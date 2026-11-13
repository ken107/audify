/*
 * Catalog of synthesized sound effects.
 *
 * Every sound is built from oscillators and noise at the moment it's played, so there's no
 * file to fetch or decode and nothing silent at the head of a sample: the first audible
 * sample goes out on the next audio render quantum.
 *
 * A sound is plain data: a stack of layers, each one a source (a waveform or noise) with an
 * optional pitch movement, an optional filter and a volume envelope. Catalog sounds and the
 * sounds people make in the editor use the same format, so any catalog sound can be opened
 * and edited.
 */

type SoundCategory = "click" | "hover" | "link" | "comic" | "retro";

type Wave = "sine" | "triangle" | "square" | "sawtooth" | "pulse" | "noise" | "crunch";

/** An exponential slide to `to` over `time` seconds; several run one after another */
interface Glide {
  to: number;
  time: number;
}

interface Layer {
  wave: Wave;
  /** Pulse width for the pulse wave: 0.125, 0.25 or 0.5 */
  duty?: number;
  /** Hz; for crunch it's the noise brightness (0..1), and noise ignores it */
  freq?: number;
  /** Seconds after the sound starts that this layer comes in */
  start?: number;
  /** Pitch slides, starting from `freq` */
  glide?: Glide[];
  /** Chip-style arpeggio: jump through these frequencies, `step` seconds apart; replaces glide */
  arp?: {notes: number[], step: number};
  /** Pitch wobble: `depth` Hz at `rate` Hz, fading to `end` Hz over `time` seconds */
  vibrato?: {rate: number, depth: number, end?: number, time: number};
  filter?: {type: "lowpass" | "highpass" | "bandpass", freq: number, q: number, glide?: Glide[]};
  /** Envelope, seconds. With no hold the sound is percussive (exponential rise and fall),
   *  with a hold it rises linearly, holds at `level`, then fades out over `decay`. */
  attack: number;
  hold?: number;
  decay: number;
  level: number;
}

interface Sound {
  id: string;
  name: string;
  description?: string;
  layers: Layer[];
}

interface SoundDef extends Sound {
  category: SoundCategory;
  description: string;
}

const soundCategories: {id: SoundCategory, name: string, description: string}[] = [
  {id: "click", name: "Clicks", description: "Short, crisp confirmations for pressing a button"},
  {id: "hover", name: "Hovers", description: "Quiet cues that stay out of the way when the mouse passes over"},
  {id: "link", name: "Links", description: "A little more movement, for going somewhere"},
  {id: "comic", name: "Comical", description: "Cartoon sounds, for when the web needs to lighten up"},
  {id: "retro", name: "Retro", description: "Chiptune bleeps in the style of 8-bit consoles and arcade cabinets"},
]


/**
 * Small toolkit for building one sound. Times are relative to the start of the sound,
 * frequencies are scaled by the pitch factor, and every source is stopped once the
 * last envelope has finished so the graph can be garbage collected.
 */
class Synth {
  private sources: AudioScheduledSourceNode[] = [];
  private end = 0;

  constructor(readonly ctx: BaseAudioContext, readonly out: AudioNode, readonly t0: number, readonly pitch: number) {}

  hz(f: number) {
    return f * this.pitch;
  }

  /** Percussive envelope: fast rise to peak, exponential fall to silence */
  env(attack: number, decay: number, peak: number, opts: {at?: number, to?: AudioNode} = {}) {
    const g = this.ctx.createGain();
    const t = this.t0 + (opts.at ?? 0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + Math.max(attack, 0.001));
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(opts.to ?? this.out);
    this.end = Math.max(this.end, t + attack + decay);
    return g;
  }

  /** Sustained envelope: rise, hold at peak, then release */
  hold(attack: number, sustain: number, release: number, peak: number, opts: {at?: number, to?: AudioNode} = {}) {
    const g = this.ctx.createGain();
    const t = this.t0 + (opts.at ?? 0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + sustain);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + sustain + release);
    g.connect(opts.to ?? this.out);
    this.end = Math.max(this.end, t + attack + sustain + release);
    return g;
  }

  osc(type: OscillatorType, freq: number, to: AudioNode, at = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(this.hz(freq), this.t0 + at);
    o.connect(to);
    o.start(this.t0 + at);
    this.sources.push(o);
    return o;
  }

  noise(to: AudioNode, at = 0, buffer = noiseBuffer(this.ctx)) {
    const n = this.ctx.createBufferSource();
    n.buffer = buffer;
    n.loop = true;
    n.connect(to);
    n.start(this.t0 + at, Math.random() * 0.9);
    this.sources.push(n);
    return n;
  }

  filter(type: BiquadFilterType, freq: number, q: number, to: AudioNode) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = this.hz(freq);
    f.Q.value = q;
    f.connect(to);
    return f;
  }

  /** Exponential glide of a frequency param */
  glide(param: AudioParam, from: number, to: number, dur: number, at = 0) {
    param.setValueAtTime(this.hz(from), this.t0 + at);
    param.exponentialRampToValueAtTime(this.hz(to), this.t0 + at + dur);
  }

  /** Pulse wave with the given duty cycle (0.125, 0.25, 0.5), the voice of 8-bit sound chips */
  pulse(duty: number, freq: number, to: AudioNode, at = 0) {
    const o = this.osc("square", freq, to, at);
    o.setPeriodicWave(pulseWave(this.ctx, duty));
    return o;
  }

  /** Step a frequency param through a sequence of notes, chip-style (no glide between them) */
  notes(param: AudioParam, freqs: number[], step: number, at = 0) {
    freqs.forEach((f, i) => param.setValueAtTime(this.hz(f), this.t0 + at + i * step));
  }

  /** Coarse 1-bit noise like a chip's noise channel; `rate` (0..1) sets how bright it is */
  crunch(rate: number, to: AudioNode, at = 0) {
    const n = this.noise(to, at, crunchBuffer(this.ctx));
    n.playbackRate.setValueAtTime(rate * this.pitch, this.t0 + at);
    return n;
  }

  /** Vibrato / wobble on a param; depth fades to `endDepth` over `dur` */
  lfo(param: AudioParam, rate: number, depth: number, dur: number, endDepth = depth, at = 0) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(this.hz(depth), this.t0 + at);
    g.gain.exponentialRampToValueAtTime(Math.max(this.hz(endDepth), 0.01), this.t0 + at + dur);
    g.connect(param);
    this.osc("sine", rate / this.pitch, g, at);
  }

  finish() {
    for (const s of this.sources) s.stop(this.end + 0.02);
  }
}

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(ctx: BaseAudioContext) {
  let buf = noiseBuffers.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buf);
  }
  return buf;
}


const pulseWaves = new WeakMap<BaseAudioContext, Map<number, PeriodicWave>>();

function pulseWave(ctx: BaseAudioContext, duty: number) {
  let waves = pulseWaves.get(ctx);
  if (!waves) pulseWaves.set(ctx, waves = new Map());
  let wave = waves.get(duty);
  if (!wave) {
    const real = new Float32Array(64), imag = new Float32Array(64);
    for (let n = 1; n < 64; n++) real[n] = 2 / (n * Math.PI) * Math.sin(n * Math.PI * duty);
    waves.set(duty, wave = ctx.createPeriodicWave(real, imag));
  }
  return wave;
}

const crunchBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

function crunchBuffer(ctx: BaseAudioContext) {
  let buf = crunchBuffers.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let v = 1;
    for (let i = 0; i < data.length; i++) {
      if (i % 4 == 0) v = Math.random() < 0.5 ? -1 : 1;
      data[i] = v;
    }
    crunchBuffers.set(ctx, buf);
  }
  return buf;
}


function renderLayers(s: Synth, layers: Layer[]) {
  for (const layer of layers) renderLayer(s, layer);
}

function renderLayer(s: Synth, layer: Layer) {
  const at = layer.start ?? 0;
  const env = layer.hold
    ? s.hold(layer.attack, layer.hold, layer.decay, layer.level, {at})
    : s.env(layer.attack, layer.decay, layer.level, {at});
  let dest: AudioNode = env;
  if (layer.filter) {
    const {type, freq, q, glide} = layer.filter;
    const f = s.filter(type, freq, q, env);
    if (glide) glidePath(s, f.frequency, freq, glide, at);
    dest = f;
  }

  const freq = layer.freq ?? 440;
  let param: AudioParam|undefined;
  if (layer.wave == "noise") {
    s.noise(dest, at);
  }
  else if (layer.wave == "crunch") {
    param = s.crunch(freq, dest, at).playbackRate;
  }
  else {
    const o = layer.wave == "pulse" ? s.pulse(layer.duty ?? 0.5, freq, dest, at) : s.osc(layer.wave, freq, dest, at);
    param = o.frequency;
    if (layer.vibrato) {
      const {rate, depth, end, time} = layer.vibrato;
      s.lfo(param, rate, depth, time, end ?? depth, at);
    }
  }
  if (param) {
    if (layer.arp) s.notes(param, layer.arp.notes, layer.arp.step, at);
    else if (layer.glide) glidePath(s, param, freq, layer.glide, at);
  }
}

function glidePath(s: Synth, param: AudioParam, from: number, glides: Glide[], at: number) {
  for (const {to, time} of glides) {
    s.glide(param, from, to, time, at);
    from = to;
    at += time;
  }
}

/** How long a sound rings, in seconds */
function soundDuration(layers: Layer[]) {
  return Math.max(0, ...layers.map(x => (x.start ?? 0) + x.attack + (x.hold ?? 0) + x.decay));
}

/**
 * Limits on what a sound can do, enforced on anything read from storage or typed into the
 * editor, so a bad value can't throw inside the audio graph (an exponential ramp to zero
 * does) or play something long and loud on every click.
 */
const soundLimits = {
  layers: 8,
  duration: 2,
  freq: [20, 20000],
  crunch: [0.01, 1],
  q: [0.1, 30],
  level: [0.001, 1.5],
  glides: 4,
  arpNotes: 16,
  vibratoRate: [0.5, 60],
  vibratoDepth: [0.01, 2000],
} as const;

function sanitizeLayers(input: unknown): Layer[] {
  const waves: Wave[] = ["sine", "triangle", "square", "sawtooth", "pulse", "noise", "crunch"];
  const num = (v: unknown, min: number, max: number, def: number) => {
    const n = typeof v == "number" && isFinite(v) ? v : def;
    return Math.min(max, Math.max(min, n));
  };
  const time = (v: unknown, def = 0) => num(v, 0, soundLimits.duration, def);
  const list = Array.isArray(input) ? input.slice(0, soundLimits.layers) : [];
  return list.filter(x => x && typeof x == "object").map((x: any): Layer => {
    const wave: Wave = waves.includes(x.wave) ? x.wave : "sine";
    const fr = wave == "crunch" ? soundLimits.crunch : soundLimits.freq;
    const freq = (v: unknown, def: number) => num(v, fr[0], fr[1], def);
    const glides = (g: unknown, f: (v: unknown, d: number) => number, def: number) => Array.isArray(g) && g.length
      ? g.slice(0, soundLimits.glides).map((y: any) => ({to: f(y?.to, def), time: num(y?.time, 0.001, soundLimits.duration, 0.1)}))
      : undefined;
    const layer: Layer = {
      wave,
      attack: num(x.attack, 0.001, soundLimits.duration, 0.001),
      decay: num(x.decay, 0.001, soundLimits.duration, 0.1),
      level: num(x.level, soundLimits.level[0], soundLimits.level[1], 0.3),
    };
    if (wave == "pulse") layer.duty = [0.125, 0.25, 0.5].includes(x.duty) ? x.duty : 0.5;
    if (wave != "noise") layer.freq = freq(x.freq, wave == "crunch" ? 0.5 : 440);
    if (x.start) layer.start = time(x.start);
    if (x.hold) layer.hold = time(x.hold);
    if (wave != "noise") {
      if (x.arp && Array.isArray(x.arp.notes) && x.arp.notes.length) {
        layer.arp = {notes: x.arp.notes.slice(0, soundLimits.arpNotes).map((n: unknown) => freq(n, layer.freq!)), step: num(x.arp.step, 0.005, 0.5, 0.04)};
      }
      else {
        const g = glides(x.glide, freq, layer.freq!);
        if (g) layer.glide = g;
      }
    }
    if (wave != "noise" && wave != "crunch" && x.vibrato) {
      const v = x.vibrato, [dmin, dmax] = soundLimits.vibratoDepth;
      layer.vibrato = {
        rate: num(v.rate, soundLimits.vibratoRate[0], soundLimits.vibratoRate[1], 6),
        depth: num(v.depth, dmin, dmax, 10),
        time: num(v.time, 0.001, soundLimits.duration, 0.2),
      };
      if (v.end != null) layer.vibrato.end = num(v.end, dmin, dmax, layer.vibrato.depth);
    }
    if (x.filter) {
      const f = x.filter, [fmin, fmax] = soundLimits.freq;
      const ffreq = (v: unknown, d: number) => num(v, fmin, fmax, d);
      layer.filter = {
        type: ["lowpass", "highpass", "bandpass"].includes(f.type) ? f.type : "lowpass",
        freq: ffreq(f.freq, 2000),
        q: num(f.q, soundLimits.q[0], soundLimits.q[1], 1),
      };
      const g = glides(f.glide, ffreq, layer.filter.freq);
      if (g) layer.filter.glide = g;
    }
    return layer;
  });
}


const soundCatalog: SoundDef[] = [
  //---------------------------------------------------------------- clicks
  {
    id: "tick", name: "Tick", category: "click",
    description: "A dry, very short tick, like a watch",
    layers: [
      {wave: "noise", filter: {type: "highpass", freq: 4000, q: 0.7}, attack: 0.001, decay: 0.012, level: 0.6},
    ]
  },
  {
    id: "tap", name: "Tap", category: "click",
    description: "A soft fingertip tap on glass",
    layers: [
      {wave: "sine", freq: 1500, glide: [{to: 900, time: 0.025}], attack: 0.001, decay: 0.035, level: 0.45},
    ]
  },
  {
    id: "pop", name: "Pop", category: "click",
    description: "A round little mouth pop",
    layers: [
      {wave: "sine", freq: 700, glide: [{to: 160, time: 0.05}], attack: 0.002, decay: 0.06, level: 0.7},
      {wave: "noise", filter: {type: "bandpass", freq: 2000, q: 1}, attack: 0.001, decay: 0.008, level: 0.15},
    ]
  },
  {
    id: "wood", name: "Wood block", category: "click",
    description: "A hollow knock on a wooden block",
    layers: [
      {wave: "sine", freq: 880, attack: 0.001, decay: 0.08, level: 0.5},
      {wave: "sine", freq: 1410, attack: 0.001, decay: 0.04, level: 0.25},
      {wave: "noise", filter: {type: "bandpass", freq: 2200, q: 2}, attack: 0.001, decay: 0.01, level: 0.25},
    ]
  },
  {
    id: "switch", name: "Switch", category: "click",
    description: "A light switch flicking: two quick clacks",
    layers: [
      {wave: "noise", filter: {type: "bandpass", freq: 3000, q: 2}, attack: 0.001, decay: 0.012, level: 1.2},
      {wave: "sine", freq: 2200, attack: 0.001, decay: 0.015, level: 0.15},
      {wave: "noise", start: 0.035, filter: {type: "bandpass", freq: 2400, q: 2}, attack: 0.001, decay: 0.012, level: 0.6},
    ]
  },
  {
    id: "typewriter", name: "Typewriter", category: "click",
    description: "A typebar striking paper",
    layers: [
      {wave: "noise", filter: {type: "bandpass", freq: 2500, q: 1}, attack: 0.001, decay: 0.025, level: 0.6},
      {wave: "sine", freq: 140, attack: 0.001, decay: 0.05, level: 0.5},
      {wave: "noise", start: 0.04, filter: {type: "highpass", freq: 5000, q: 0.7}, attack: 0.001, decay: 0.01, level: 0.12},
    ]
  },
  {
    id: "thock", name: "Thock", category: "click",
    description: "A deep, muted keyboard thock",
    layers: [
      {wave: "sine", freq: 220, glide: [{to: 120, time: 0.05}], attack: 0.002, decay: 0.07, level: 0.75},
      {wave: "noise", filter: {type: "lowpass", freq: 1200, q: 0.7}, attack: 0.001, decay: 0.03, level: 0.35},
    ]
  },
  {
    id: "mechkey", name: "Clicky key", category: "click",
    description: "A clicky mechanical keyswitch, press and release",
    layers: [
      {wave: "noise", filter: {type: "highpass", freq: 2500, q: 0.7}, attack: 0.001, decay: 0.008, level: 0.6},
      {wave: "noise", filter: {type: "bandpass", freq: 4500, q: 8}, attack: 0.001, decay: 0.03, level: 0.5},
      {wave: "noise", start: 0.06, filter: {type: "bandpass", freq: 3800, q: 6}, attack: 0.001, decay: 0.02, level: 0.2},
    ]
  },
  {
    id: "glass", name: "Glass", category: "click",
    description: "A clear tink on a glass",
    layers: [
      {wave: "sine", freq: 2100, attack: 0.001, decay: 0.35, level: 0.25},
      {wave: "sine", freq: 5712, attack: 0.001, decay: 0.15, level: 0.12},
      {wave: "sine", freq: 10710, attack: 0.001, decay: 0.06, level: 0.06},
    ]
  },
  {
    id: "droplet", name: "Droplet", category: "click",
    description: "A water drop with a rising plink",
    layers: [
      {wave: "sine", freq: 900, glide: [{to: 2200, time: 0.06}], attack: 0.002, decay: 0.08, level: 0.5},
    ]
  },
  {
    id: "bubble", name: "Bubble", category: "click",
    description: "A soft, round bubble",
    layers: [
      {wave: "triangle", freq: 300, glide: [{to: 900, time: 0.08}], attack: 0.005, decay: 0.1, level: 0.55},
    ]
  },

  //---------------------------------------------------------------- hovers
  {
    id: "whisper", name: "Whisper", category: "hover",
    description: "A barely-there breath of air",
    layers: [
      {wave: "noise", filter: {type: "highpass", freq: 6000, q: 0.7}, attack: 0.008, decay: 0.03, level: 0.3},
    ]
  },
  {
    id: "blip", name: "Blip", category: "hover",
    description: "A tiny, quiet electronic blip",
    layers: [
      {wave: "sine", freq: 1600, attack: 0.003, decay: 0.03, level: 0.15},
    ]
  },
  {
    id: "air", name: "Air", category: "hover",
    description: "A short upward puff",
    layers: [
      {wave: "noise", filter: {type: "bandpass", freq: 800, q: 1.5, glide: [{to: 3000, time: 0.06}]}, attack: 0.015, decay: 0.05, level: 0.6},
    ]
  },
  {
    id: "tink", name: "Tink", category: "hover",
    description: "A pinpoint of glass, very quiet",
    layers: [
      {wave: "sine", freq: 4200, attack: 0.001, decay: 0.06, level: 0.07},
      {wave: "sine", freq: 10080, attack: 0.001, decay: 0.03, level: 0.03},
    ]
  },
  {
    id: "rise", name: "Rise", category: "hover",
    description: "A gentle little upward slide",
    layers: [
      {wave: "sine", freq: 500, glide: [{to: 800, time: 0.05}], attack: 0.01, decay: 0.045, level: 0.16},
    ]
  },
  {
    id: "brush", name: "Brush", category: "hover",
    description: "A soft brush against fabric",
    layers: [
      {wave: "noise", filter: {type: "bandpass", freq: 1800, q: 1}, attack: 0.004, decay: 0.018, level: 0.45},
    ]
  },

  //---------------------------------------------------------------- links
  {
    id: "chime", name: "Chime", category: "link",
    description: "Two bright ascending notes",
    layers: [
      {wave: "sine", freq: 1318.5, attack: 0.002, decay: 0.35, level: 0.3},
      {wave: "sine", freq: 2637, attack: 0.002, decay: 0.1, level: 0.05},
      {wave: "sine", freq: 1975.5, start: 0.07, attack: 0.002, decay: 0.45, level: 0.3},
      {wave: "sine", freq: 3951, start: 0.07, attack: 0.002, decay: 0.12, level: 0.05},
    ]
  },
  {
    id: "ding", name: "Ding", category: "link",
    description: "A small bell",
    layers: [
      {wave: "sine", freq: 1046, attack: 0.001, decay: 0.8, level: 0.35},
      {wave: "sine", freq: 2886.96, attack: 0.001, decay: 0.4, level: 0.15},
      {wave: "sine", freq: 5648.4, attack: 0.001, decay: 0.2, level: 0.08},
      {wave: "sine", freq: 9340.78, attack: 0.001, decay: 0.1, level: 0.04},
    ]
  },
  {
    id: "swoosh", name: "Swoosh", category: "link",
    description: "Air rushing past, off to the next page",
    layers: [
      {wave: "noise", filter: {type: "bandpass", freq: 400, q: 2, glide: [{to: 4000, time: 0.18}]}, attack: 0.03, decay: 0.15, level: 1.4},
    ]
  },
  {
    id: "pageturn", name: "Page turn", category: "link",
    description: "A paper page flipping over",
    layers: [
      {wave: "noise", filter: {type: "bandpass", freq: 1500, q: 1.2, glide: [{to: 3000, time: 0.1}]}, attack: 0.02, decay: 0.08, level: 0.9},
      {wave: "noise", start: 0.07, filter: {type: "bandpass", freq: 2500, q: 1.5}, attack: 0.005, decay: 0.05, level: 0.5},
    ]
  },
  {
    id: "portal", name: "Portal", category: "link",
    description: "A shimmering upward warp",
    layers: [
      {wave: "sine", freq: 300, glide: [{to: 1200, time: 0.2}], vibrato: {rate: 30, depth: 40, time: 0.2}, attack: 0.01, decay: 0.22, level: 0.25},
    ]
  },
  {
    id: "stepup", name: "Step up", category: "link",
    description: "Two quick notes, moving forward",
    layers: [
      {wave: "triangle", freq: 660, attack: 0.002, decay: 0.06, level: 0.35},
      {wave: "triangle", freq: 990, start: 0.06, attack: 0.002, decay: 0.12, level: 0.35},
    ]
  },

  //---------------------------------------------------------------- comical
  {
    id: "boink", name: "Boink", category: "comic",
    description: "A springy cartoon boink",
    layers: [
      {wave: "sine", freq: 180, glide: [{to: 360, time: 0.35}], vibrato: {rate: 22, depth: 90, end: 2, time: 0.35}, attack: 0.003, decay: 0.4, level: 0.6},
    ]
  },
  {
    id: "sproing", name: "Sproing", category: "comic",
    description: "A doorstop spring flicked hard",
    layers: [
      {wave: "triangle", freq: 400, glide: [{to: 900, time: 0.5}], vibrato: {rate: 30, depth: 150, end: 5, time: 0.5}, attack: 0.003, decay: 0.55, level: 0.45},
    ]
  },
  {
    id: "bonk", name: "Bonk", category: "comic",
    description: "Something hard hits a cartoon head",
    layers: [
      {wave: "sine", freq: 320, glide: [{to: 70, time: 0.12}], attack: 0.001, decay: 0.15, level: 0.8},
      {wave: "noise", filter: {type: "lowpass", freq: 900, q: 0.7}, attack: 0.001, decay: 0.04, level: 0.5},
    ]
  },
  {
    id: "slideup", name: "Slide whistle up", category: "comic",
    description: "Whee, up we go",
    layers: [
      {wave: "sine", freq: 350, glide: [{to: 1400, time: 0.3}], vibrato: {rate: 6, depth: 15, time: 0.3}, attack: 0.02, hold: 0.24, decay: 0.08, level: 0.25},
    ]
  },
  {
    id: "slidedown", name: "Slide whistle down", category: "comic",
    description: "And back down again",
    layers: [
      {wave: "sine", freq: 1400, glide: [{to: 350, time: 0.3}], vibrato: {rate: 6, depth: 15, time: 0.3}, attack: 0.02, hold: 0.24, decay: 0.08, level: 0.25},
    ]
  },
  {
    id: "quack", name: "Quack", category: "comic",
    description: "A short, indignant duck",
    //one sawtooth through two formant filters, written as two identical sawtooths
    layers: [
      {wave: "sawtooth", freq: 420, glide: [{to: 300, time: 0.14}], filter: {type: "bandpass", freq: 1400, q: 4, glide: [{to: 700, time: 0.14}]}, attack: 0.005, hold: 0.08, decay: 0.06, level: 0.5},
      {wave: "sawtooth", freq: 420, glide: [{to: 300, time: 0.14}], filter: {type: "bandpass", freq: 2600, q: 5}, attack: 0.005, hold: 0.08, decay: 0.06, level: 0.5},
    ]
  },
  {
    id: "honk", name: "Honk", category: "comic",
    description: "A clown-car bulb horn",
    layers: [
      {wave: "square", freq: 349, glide: [{to: 331.55, time: 0.2}], filter: {type: "lowpass", freq: 1400, q: 3}, attack: 0.01, hold: 0.15, decay: 0.05, level: 0.16},
      {wave: "square", freq: 352, glide: [{to: 334.4, time: 0.2}], filter: {type: "lowpass", freq: 1400, q: 3}, attack: 0.01, hold: 0.15, decay: 0.05, level: 0.16},
    ]
  },
  {
    id: "kazoo", name: "Kazoo", category: "comic",
    description: "A buzzy little kazoo toot",
    layers: [
      {wave: "sawtooth", freq: 233, vibrato: {rate: 5.5, depth: 6, time: 0.33}, filter: {type: "bandpass", freq: 900, q: 1.2}, attack: 0.03, hold: 0.22, decay: 0.08, level: 0.3},
      {wave: "square", freq: 233, vibrato: {rate: 5.5, depth: 6, time: 0.33}, filter: {type: "bandpass", freq: 900, q: 1.2}, attack: 0.03, hold: 0.22, decay: 0.08, level: 0.3},
    ]
  },
  {
    id: "laser", name: "Laser", category: "retro",
    description: "Pew!",
    layers: [
      {wave: "square", freq: 1800, glide: [{to: 180, time: 0.16}], filter: {type: "lowpass", freq: 3000, q: 1}, attack: 0.002, decay: 0.17, level: 0.25},
    ]
  },
  {
    id: "wobble", name: "Wobble", category: "comic",
    description: "A jelly wobble",
    layers: [
      {wave: "sine", freq: 520, vibrato: {rate: 14, depth: 160, end: 40, time: 0.33}, attack: 0.01, hold: 0.22, decay: 0.1, level: 0.25},
    ]
  },
  {
    id: "squeak", name: "Squeak", category: "comic",
    description: "A rubber toy squeezed once",
    layers: [
      {wave: "triangle", freq: 1900, glide: [{to: 2700, time: 0.05}, {to: 2100, time: 0.09}], vibrato: {rate: 40, depth: 60, time: 0.15}, attack: 0.005, hold: 0.1, decay: 0.05, level: 0.3},
    ]
  },
  {
    id: "blorp", name: "Blorp", category: "comic",
    description: "Something gooey sinking out of sight",
    layers: [
      {wave: "sawtooth", freq: 160, glide: [{to: 70, time: 0.2}], filter: {type: "lowpass", freq: 2000, q: 12, glide: [{to: 200, time: 0.2}]}, attack: 0.005, decay: 0.22, level: 0.4},
    ]
  },
  {
    id: "arcade", name: "Arcade", category: "retro",
    description: "A two-note bonus pickup",
    layers: [
      {wave: "square", freq: 880, attack: 0.001, hold: 0.055, decay: 0.01, level: 0.15},
      {wave: "square", freq: 1320, start: 0.06, attack: 0.001, decay: 0.3, level: 0.15},
    ]
  },
  {
    id: "cork", name: "Cork", category: "comic",
    description: "A cork popping out of a bottle",
    layers: [
      {wave: "sine", freq: 400, glide: [{to: 1200, time: 0.03}], attack: 0.001, decay: 0.06, level: 0.6},
      {wave: "noise", filter: {type: "bandpass", freq: 1200, q: 1}, attack: 0.001, decay: 0.02, level: 0.5},
    ]
  },

  //---------------------------------------------------------------- retro
  {
    id: "cursor", name: "Cursor", category: "retro",
    description: "Moving the selection in a game menu",
    layers: [
      {wave: "pulse", duty: 0.25, freq: 1760, attack: 0.001, hold: 0.025, decay: 0.01, level: 0.18},
    ]
  },
  {
    id: "select", name: "Select", category: "retro",
    description: "Two quick notes confirming a menu choice",
    layers: [
      {wave: "pulse", duty: 0.125, freq: 988, arp: {notes: [988, 1319], step: 0.04}, attack: 0.001, hold: 0.08, decay: 0.02, level: 0.2},
    ]
  },
  {
    id: "bleep", name: "Bleep", category: "retro",
    description: "A tiny chip bleep, quiet enough for hovers",
    layers: [
      {wave: "pulse", duty: 0.125, freq: 2093, attack: 0.001, hold: 0.012, decay: 0.008, level: 0.1},
    ]
  },
  {
    id: "dialog", name: "Dialog", category: "retro",
    description: "The beep of text typing out in a game's dialog box",
    layers: [
      {wave: "pulse", duty: 0.5, freq: 660, attack: 0.001, hold: 0.02, decay: 0.01, level: 0.15},
    ]
  },
  {
    id: "jump", name: "Jump", category: "retro",
    description: "A platformer hop",
    layers: [
      {wave: "pulse", duty: 0.25, freq: 300, glide: [{to: 760, time: 0.12}], attack: 0.002, hold: 0.1, decay: 0.04, level: 0.2},
    ]
  },
  {
    id: "powerup", name: "Power-up", category: "retro",
    description: "A fast rising arpeggio",
    layers: [
      {wave: "pulse", duty: 0.25, freq: 523, arp: {notes: [523, 659, 784, 1047, 1319, 1568, 2093], step: 0.03}, attack: 0.002, hold: 0.2, decay: 0.05, level: 0.2},
    ]
  },
  {
    id: "bounce", name: "Bounce", category: "retro",
    description: "A ball bouncing off a wall",
    layers: [
      {wave: "triangle", freq: 220, glide: [{to: 660, time: 0.03}, {to: 330, time: 0.05}], attack: 0.001, hold: 0.06, decay: 0.03, level: 0.4},
    ]
  },
  {
    id: "blaster", name: "Blaster", category: "retro",
    description: "A short arcade shot",
    layers: [
      {wave: "pulse", duty: 0.125, freq: 1400, glide: [{to: 260, time: 0.07}], attack: 0.001, hold: 0.05, decay: 0.03, level: 0.2},
      {wave: "crunch", freq: 0.5, attack: 0.001, decay: 0.04, level: 0.1},
    ]
  },
  {
    id: "hit", name: "Hit", category: "retro",
    description: "Taking damage",
    layers: [
      {wave: "crunch", freq: 0.25, attack: 0.001, decay: 0.1, level: 0.22},
      {wave: "pulse", duty: 0.5, freq: 440, arp: {notes: [440, 220, 330, 165], step: 0.025}, attack: 0.001, hold: 0.06, decay: 0.04, level: 0.12},
    ]
  },
  {
    id: "boom", name: "Boom", category: "retro",
    description: "An 8-bit explosion",
    layers: [
      {wave: "crunch", freq: 0.35, glide: [{to: 0.04, time: 0.4}], filter: {type: "lowpass", freq: 4000, q: 0.7}, attack: 0.002, decay: 0.4, level: 0.45},
    ]
  },
]

/** What a new sound in the editor starts as: one plain tone */
const newSoundLayer: Layer = {wave: "sine", freq: 660, attack: 0.002, decay: 0.12, level: 0.4};

const soundsById = new Map(soundCatalog.map(x => [x.id, x]));

/** A catalog sound or one of the user's own, by id */
function findSound(id: string, custom: Map<string, Sound>): Sound|undefined {
  return soundsById.get(id) ?? custom.get(id);
}


/**
 * Owns one AudioContext and plays sounds through a master volume. The context is created
 * on first use, and suspended after a while of silence so idle tabs cost nothing.
 */
class SoundPlayer {
  volume = defaultSettings.volume;
  varyPitch = defaultSettings.varyPitch;
  private ctx?: AudioContext;
  private master?: GainNode;
  private idleTimer?: number;

  async play(layers: Layer[]) {
    if (!layers.length || this.volume <= 0) return;
    const ctx = this.getContext();
    if (ctx.state != "running") {
      //resume() waits for user activation; drop the sound if it would come out late
      const requested = performance.now();
      try { await ctx.resume() } catch { return }
      if (performance.now() - requested > 150) return;
    }
    this.render(layers);
  }

  private render(layers: Layer[]) {
    const ctx = this.ctx!;
    this.master!.gain.value = this.volume * this.volume;
    const pitch = this.varyPitch ? 1 + (Math.random() - 0.5) * 0.08 : 1;
    const synth = new Synth(ctx, this.master!, ctx.currentTime, pitch);
    renderLayers(synth, layers);
    synth.finish();

    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => ctx.suspend(), 30000);
  }

  private getContext() {
    if (!this.ctx) {
      this.ctx = new AudioContext({latencyHint: "interactive"});
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }
}

/** Renders a sound offline at its natural pitch, for drawing its waveform */
async function renderOffline(layers: Layer[], sampleRate = 44100) {
  const length = Math.max(1, Math.ceil((soundDuration(layers) + 0.02) * sampleRate));
  const ctx = new OfflineAudioContext(1, length, sampleRate);
  const synth = new Synth(ctx, ctx.destination, 0, 1);
  renderLayers(synth, layers);
  synth.finish();
  return (await ctx.startRendering()).getChannelData(0);
}
