/*
 * Catalog of synthesized sound effects.
 *
 * Every sound is built from oscillators and noise at the moment it's played, so there's no
 * file to fetch or decode and nothing silent at the head of a sample: the first audible
 * sample goes out on the next audio render quantum.
 */

type SoundCategory = "click" | "hover" | "link" | "comic" | "retro";

interface SoundDef {
  id: string;
  name: string;
  category: SoundCategory;
  description: string;
  render: (s: Synth) => void;
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


const soundCatalog: SoundDef[] = [
  //---------------------------------------------------------------- clicks
  {
    id: "tick", name: "Tick", category: "click",
    description: "A dry, very short tick, like a watch",
    render(s) {
      s.noise(s.filter("highpass", 4000, 0.7, s.env(0.001, 0.012, 0.6)));
    }
  },
  {
    id: "tap", name: "Tap", category: "click",
    description: "A soft fingertip tap on glass",
    render(s) {
      const o = s.osc("sine", 1500, s.env(0.001, 0.035, 0.45));
      s.glide(o.frequency, 1500, 900, 0.025);
    }
  },
  {
    id: "pop", name: "Pop", category: "click",
    description: "A round little mouth pop",
    render(s) {
      const o = s.osc("sine", 700, s.env(0.002, 0.06, 0.7));
      s.glide(o.frequency, 700, 160, 0.05);
      s.noise(s.filter("bandpass", 2000, 1, s.env(0.001, 0.008, 0.15)));
    }
  },
  {
    id: "wood", name: "Wood block", category: "click",
    description: "A hollow knock on a wooden block",
    render(s) {
      s.osc("sine", 880, s.env(0.001, 0.08, 0.5));
      s.osc("sine", 1410, s.env(0.001, 0.04, 0.25));
      s.noise(s.filter("bandpass", 2200, 2, s.env(0.001, 0.01, 0.25)));
    }
  },
  {
    id: "switch", name: "Switch", category: "click",
    description: "A light switch flicking: two quick clacks",
    render(s) {
      s.noise(s.filter("bandpass", 3000, 2, s.env(0.001, 0.012, 1.2)));
      s.osc("sine", 2200, s.env(0.001, 0.015, 0.15));
      s.noise(s.filter("bandpass", 2400, 2, s.env(0.001, 0.012, 0.6, {at: 0.035})), 0.035);
    }
  },
  {
    id: "typewriter", name: "Typewriter", category: "click",
    description: "A typebar striking paper",
    render(s) {
      s.noise(s.filter("bandpass", 2500, 1, s.env(0.001, 0.025, 0.6)));
      s.osc("sine", 140, s.env(0.001, 0.05, 0.5));
      s.noise(s.filter("highpass", 5000, 0.7, s.env(0.001, 0.01, 0.12, {at: 0.04})), 0.04);
    }
  },
  {
    id: "thock", name: "Thock", category: "click",
    description: "A deep, muted keyboard thock",
    render(s) {
      const o = s.osc("sine", 220, s.env(0.002, 0.07, 0.75));
      s.glide(o.frequency, 220, 120, 0.05);
      s.noise(s.filter("lowpass", 1200, 0.7, s.env(0.001, 0.03, 0.35)));
    }
  },
  {
    id: "mechkey", name: "Clicky key", category: "click",
    description: "A clicky mechanical keyswitch, press and release",
    render(s) {
      s.noise(s.filter("highpass", 2500, 0.7, s.env(0.001, 0.008, 0.6)));
      s.noise(s.filter("bandpass", 4500, 8, s.env(0.001, 0.03, 0.5)));
      s.noise(s.filter("bandpass", 3800, 6, s.env(0.001, 0.02, 0.2, {at: 0.06})), 0.06);
    }
  },
  {
    id: "glass", name: "Glass", category: "click",
    description: "A clear tink on a glass",
    render(s) {
      s.osc("sine", 2100, s.env(0.001, 0.35, 0.25));
      s.osc("sine", 2100 * 2.72, s.env(0.001, 0.15, 0.12));
      s.osc("sine", 2100 * 5.1, s.env(0.001, 0.06, 0.06));
    }
  },
  {
    id: "droplet", name: "Droplet", category: "click",
    description: "A water drop with a rising plink",
    render(s) {
      const o = s.osc("sine", 900, s.env(0.002, 0.08, 0.5));
      s.glide(o.frequency, 900, 2200, 0.06);
    }
  },
  {
    id: "bubble", name: "Bubble", category: "click",
    description: "A soft, round bubble",
    render(s) {
      const o = s.osc("triangle", 300, s.env(0.005, 0.1, 0.55));
      s.glide(o.frequency, 300, 900, 0.08);
    }
  },

  //---------------------------------------------------------------- hovers
  {
    id: "whisper", name: "Whisper", category: "hover",
    description: "A barely-there breath of air",
    render(s) {
      s.noise(s.filter("highpass", 6000, 0.7, s.env(0.008, 0.03, 0.3)));
    }
  },
  {
    id: "blip", name: "Blip", category: "hover",
    description: "A tiny, quiet electronic blip",
    render(s) {
      s.osc("sine", 1600, s.env(0.003, 0.03, 0.15));
    }
  },
  {
    id: "air", name: "Air", category: "hover",
    description: "A short upward puff",
    render(s) {
      const f = s.filter("bandpass", 800, 1.5, s.env(0.015, 0.05, 0.6));
      s.glide(f.frequency, 800, 3000, 0.06);
      s.noise(f);
    }
  },
  {
    id: "tink", name: "Tink", category: "hover",
    description: "A pinpoint of glass, very quiet",
    render(s) {
      s.osc("sine", 4200, s.env(0.001, 0.06, 0.07));
      s.osc("sine", 4200 * 2.4, s.env(0.001, 0.03, 0.03));
    }
  },
  {
    id: "rise", name: "Rise", category: "hover",
    description: "A gentle little upward slide",
    render(s) {
      const o = s.osc("sine", 500, s.env(0.01, 0.045, 0.16));
      s.glide(o.frequency, 500, 800, 0.05);
    }
  },
  {
    id: "brush", name: "Brush", category: "hover",
    description: "A soft brush against fabric",
    render(s) {
      s.noise(s.filter("bandpass", 1800, 1, s.env(0.004, 0.018, 0.45)));
    }
  },

  //---------------------------------------------------------------- links
  {
    id: "chime", name: "Chime", category: "link",
    description: "Two bright ascending notes",
    render(s) {
      s.osc("sine", 1318.5, s.env(0.002, 0.35, 0.3));
      s.osc("sine", 1318.5 * 2, s.env(0.002, 0.1, 0.05));
      s.osc("sine", 1975.5, s.env(0.002, 0.45, 0.3, {at: 0.07}), 0.07);
      s.osc("sine", 1975.5 * 2, s.env(0.002, 0.12, 0.05, {at: 0.07}), 0.07);
    }
  },
  {
    id: "ding", name: "Ding", category: "link",
    description: "A small bell",
    render(s) {
      const partials = [[1, 0.35, 0.8], [2.76, 0.15, 0.4], [5.4, 0.08, 0.2], [8.93, 0.04, 0.1]];
      for (const [ratio, gain, decay] of partials) s.osc("sine", 1046 * ratio, s.env(0.001, decay, gain));
    }
  },
  {
    id: "swoosh", name: "Swoosh", category: "link",
    description: "Air rushing past, off to the next page",
    render(s) {
      const f = s.filter("bandpass", 400, 2, s.env(0.03, 0.15, 1.4));
      s.glide(f.frequency, 400, 4000, 0.18);
      s.noise(f);
    }
  },
  {
    id: "pageturn", name: "Page turn", category: "link",
    description: "A paper page flipping over",
    render(s) {
      const f = s.filter("bandpass", 1500, 1.2, s.env(0.02, 0.08, 0.9));
      s.glide(f.frequency, 1500, 3000, 0.1);
      s.noise(f);
      s.noise(s.filter("bandpass", 2500, 1.5, s.env(0.005, 0.05, 0.5, {at: 0.07})), 0.07);
    }
  },
  {
    id: "portal", name: "Portal", category: "link",
    description: "A shimmering upward warp",
    render(s) {
      const o = s.osc("sine", 300, s.env(0.01, 0.22, 0.25));
      s.glide(o.frequency, 300, 1200, 0.2);
      s.lfo(o.frequency, 30, 40, 0.2);
    }
  },
  {
    id: "stepup", name: "Step up", category: "link",
    description: "Two quick notes, moving forward",
    render(s) {
      s.osc("triangle", 660, s.env(0.002, 0.06, 0.35));
      s.osc("triangle", 990, s.env(0.002, 0.12, 0.35, {at: 0.06}), 0.06);
    }
  },

  //---------------------------------------------------------------- comical
  {
    id: "boink", name: "Boink", category: "comic",
    description: "A springy cartoon boink",
    render(s) {
      const o = s.osc("sine", 180, s.env(0.003, 0.4, 0.6));
      s.glide(o.frequency, 180, 360, 0.35);
      s.lfo(o.frequency, 22, 90, 0.35, 2);
    }
  },
  {
    id: "sproing", name: "Sproing", category: "comic",
    description: "A doorstop spring flicked hard",
    render(s) {
      const o = s.osc("triangle", 400, s.env(0.003, 0.55, 0.45));
      s.glide(o.frequency, 400, 900, 0.5);
      s.lfo(o.frequency, 30, 150, 0.5, 5);
    }
  },
  {
    id: "bonk", name: "Bonk", category: "comic",
    description: "Something hard hits a cartoon head",
    render(s) {
      const o = s.osc("sine", 320, s.env(0.001, 0.15, 0.8));
      s.glide(o.frequency, 320, 70, 0.12);
      s.noise(s.filter("lowpass", 900, 0.7, s.env(0.001, 0.04, 0.5)));
    }
  },
  {
    id: "slideup", name: "Slide whistle up", category: "comic",
    description: "Whee, up we go",
    render(s) {
      const o = s.osc("sine", 350, s.hold(0.02, 0.24, 0.08, 0.25));
      s.glide(o.frequency, 350, 1400, 0.3);
      s.lfo(o.frequency, 6, 15, 0.3);
    }
  },
  {
    id: "slidedown", name: "Slide whistle down", category: "comic",
    description: "And back down again",
    render(s) {
      const o = s.osc("sine", 1400, s.hold(0.02, 0.24, 0.08, 0.25));
      s.glide(o.frequency, 1400, 350, 0.3);
      s.lfo(o.frequency, 6, 15, 0.3);
    }
  },
  {
    id: "quack", name: "Quack", category: "comic",
    description: "A short, indignant duck",
    render(s) {
      const out = s.hold(0.005, 0.08, 0.06, 0.5);
      const f1 = s.filter("bandpass", 1400, 4, out);
      const f2 = s.filter("bandpass", 2600, 5, out);
      s.glide(f1.frequency, 1400, 700, 0.14);
      const o = s.osc("sawtooth", 420, f1);
      o.connect(f2);
      s.glide(o.frequency, 420, 300, 0.14);
    }
  },
  {
    id: "honk", name: "Honk", category: "comic",
    description: "A clown-car bulb horn",
    render(s) {
      const f = s.filter("lowpass", 1400, 3, s.hold(0.01, 0.15, 0.05, 0.16));
      for (const freq of [349, 352]) {
        const o = s.osc("square", freq, f);
        s.glide(o.frequency, freq, freq * 0.95, 0.2);
      }
    }
  },
  {
    id: "kazoo", name: "Kazoo", category: "comic",
    description: "A buzzy little kazoo toot",
    render(s) {
      const f = s.filter("bandpass", 900, 1.2, s.hold(0.03, 0.22, 0.08, 0.3));
      for (const type of ["sawtooth", "square"] as const) {
        const o = s.osc(type, 233, f);
        s.lfo(o.frequency, 5.5, 6, 0.33);
      }
    }
  },
  {
    id: "laser", name: "Laser", category: "retro",
    description: "Pew!",
    render(s) {
      const o = s.osc("square", 1800, s.filter("lowpass", 3000, 1, s.env(0.002, 0.17, 0.25)));
      s.glide(o.frequency, 1800, 180, 0.16);
    }
  },
  {
    id: "wobble", name: "Wobble", category: "comic",
    description: "A jelly wobble",
    render(s) {
      const o = s.osc("sine", 520, s.hold(0.01, 0.22, 0.1, 0.25));
      s.lfo(o.frequency, 14, 160, 0.33, 40);
    }
  },
  {
    id: "squeak", name: "Squeak", category: "comic",
    description: "A rubber toy squeezed once",
    render(s) {
      const o = s.osc("triangle", 1900, s.hold(0.005, 0.1, 0.05, 0.3));
      s.glide(o.frequency, 1900, 2700, 0.05);
      s.glide(o.frequency, 2700, 2100, 0.09, 0.05);
      s.lfo(o.frequency, 40, 60, 0.15);
    }
  },
  {
    id: "blorp", name: "Blorp", category: "comic",
    description: "Something gooey sinking out of sight",
    render(s) {
      const f = s.filter("lowpass", 2000, 12, s.env(0.005, 0.22, 0.4));
      s.glide(f.frequency, 2000, 200, 0.2);
      const o = s.osc("sawtooth", 160, f);
      s.glide(o.frequency, 160, 70, 0.2);
    }
  },
  {
    id: "arcade", name: "Arcade", category: "retro",
    description: "A two-note bonus pickup",
    render(s) {
      s.osc("square", 880, s.hold(0.001, 0.055, 0.01, 0.15));
      s.osc("square", 1320, s.env(0.001, 0.3, 0.15, {at: 0.06}), 0.06);
    }
  },
  {
    id: "cork", name: "Cork", category: "comic",
    description: "A cork popping out of a bottle",
    render(s) {
      const o = s.osc("sine", 400, s.env(0.001, 0.06, 0.6));
      s.glide(o.frequency, 400, 1200, 0.03);
      s.noise(s.filter("bandpass", 1200, 1, s.env(0.001, 0.02, 0.5)));
    }
  },

  //---------------------------------------------------------------- retro
  {
    id: "cursor", name: "Cursor", category: "retro",
    description: "Moving the selection in a game menu",
    render(s) {
      s.pulse(0.25, 1760, s.hold(0.001, 0.025, 0.01, 0.18));
    }
  },
  {
    id: "select", name: "Select", category: "retro",
    description: "Two quick notes confirming a menu choice",
    render(s) {
      const o = s.pulse(0.125, 988, s.hold(0.001, 0.08, 0.02, 0.2));
      s.notes(o.frequency, [988, 1319], 0.04);
    }
  },
  {
    id: "bleep", name: "Bleep", category: "retro",
    description: "A tiny chip bleep, quiet enough for hovers",
    render(s) {
      s.pulse(0.125, 2093, s.hold(0.001, 0.012, 0.008, 0.1));
    }
  },
  {
    id: "dialog", name: "Dialog", category: "retro",
    description: "The beep of text typing out in a game's dialog box",
    render(s) {
      s.pulse(0.5, 660, s.hold(0.001, 0.02, 0.01, 0.15));
    }
  },
  {
    id: "jump", name: "Jump", category: "retro",
    description: "A platformer hop",
    render(s) {
      const o = s.pulse(0.25, 300, s.hold(0.002, 0.1, 0.04, 0.2));
      s.glide(o.frequency, 300, 760, 0.12);
    }
  },
  {
    id: "powerup", name: "Power-up", category: "retro",
    description: "A fast rising arpeggio",
    render(s) {
      const o = s.pulse(0.25, 523, s.hold(0.002, 0.2, 0.05, 0.2));
      s.notes(o.frequency, [523, 659, 784, 1047, 1319, 1568, 2093], 0.03);
    }
  },
  {
    id: "bounce", name: "Bounce", category: "retro",
    description: "A ball bouncing off a wall",
    render(s) {
      const o = s.osc("triangle", 220, s.hold(0.001, 0.06, 0.03, 0.4));
      s.glide(o.frequency, 220, 660, 0.03);
      s.glide(o.frequency, 660, 330, 0.05, 0.03);
    }
  },
  {
    id: "blaster", name: "Blaster", category: "retro",
    description: "A short arcade shot",
    render(s) {
      const o = s.pulse(0.125, 1400, s.hold(0.001, 0.05, 0.03, 0.2));
      s.glide(o.frequency, 1400, 260, 0.07);
      s.crunch(0.5, s.env(0.001, 0.04, 0.1));
    }
  },
  {
    id: "hit", name: "Hit", category: "retro",
    description: "Taking damage",
    render(s) {
      s.crunch(0.25, s.env(0.001, 0.1, 0.22));
      const o = s.pulse(0.5, 440, s.hold(0.001, 0.06, 0.04, 0.12));
      s.notes(o.frequency, [440, 220, 330, 165], 0.025);
    }
  },
  {
    id: "boom", name: "Boom", category: "retro",
    description: "An 8-bit explosion",
    render(s) {
      const n = s.crunch(0.35, s.filter("lowpass", 4000, 0.7, s.env(0.002, 0.4, 0.45)));
      n.playbackRate.exponentialRampToValueAtTime(0.04, s.t0 + 0.4);
    }
  },
]

const soundsById = new Map(soundCatalog.map(x => [x.id, x]));


/**
 * Owns one AudioContext and plays catalog sounds through a master volume. The context is
 * created on first use, and suspended after a while of silence so idle tabs cost nothing.
 */
class SoundPlayer {
  volume = defaultSettings.volume;
  varyPitch = defaultSettings.varyPitch;
  private ctx?: AudioContext;
  private master?: GainNode;
  private idleTimer?: number;

  async play(soundId: string) {
    const def = soundsById.get(soundId);
    if (!def || this.volume <= 0) return;
    const ctx = this.getContext();
    if (ctx.state != "running") {
      //resume() waits for user activation; drop the sound if it would come out late
      const requested = performance.now();
      try { await ctx.resume() } catch { return }
      if (performance.now() - requested > 150) return;
    }
    this.render(def);
  }

  private render(def: SoundDef) {
    const ctx = this.ctx!;
    this.master!.gain.value = this.volume * this.volume;
    const pitch = this.varyPitch ? 1 + (Math.random() - 0.5) * 0.08 : 1;
    const synth = new Synth(ctx, this.master!, ctx.currentTime, pitch);
    def.render(synth);
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
