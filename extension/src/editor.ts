/*
 * Sound editor, on the options page. A sound is a stack of layers (see sounds.ts), and the
 * editor shows one layer's controls at a time under a waveform of the whole sound. Every
 * change redraws the waveform, and letting go of a control plays the sound.
 */

interface EditorHooks {
  volume: () => number;
  onSave: (id: string, isNew: boolean) => void;
  onDelete: (id: string) => void;
}

const waveLabels: Record<Wave, string> = {
  sine: "Sine",
  triangle: "Triangle",
  square: "Square",
  sawtooth: "Saw",
  pulse: "Pulse",
  noise: "Noise",
  crunch: "Crunch",
}

function openSoundEditor(initial: Sound, hooks: EditorHooks) {
  const isNew = !initial.id;
  const draft: Sound = structuredClone(initial);
  let current = 0;
  let dirty = false;
  let autoPlay = loadAutoPlay();
  const player = new SoundPlayer();
  player.varyPitch = false;
  let mix: Float32Array|undefined, solo: Float32Array|undefined;
  let renderSeq = 0, redrawTimer = 0;
  let playhead: {start: number, dur: number}|undefined;
  let deleteArmed = 0;

  //---------------------------------------------------------------- shell
  const dialog = el("dialog", {className: "editor", "aria-label": "Sound editor"});

  const nameInput = el("input", {type: "text", className: "name-input", placeholder: "Name your sound", maxlength: "60", "aria-label": "Sound name"});
  nameInput.value = draft.name;
  nameInput.addEventListener("input", () => { draft.name = nameInput.value; dirty = true });
  const closeBtn = el("button", {type: "button", className: "chip-remove close", title: "Close", "aria-label": "Close", textContent: "×"});
  closeBtn.addEventListener("click", () => tryClose());
  const head = el("header", {className: "editor-head"});
  head.append(nameInput, closeBtn);

  const playBtn = el("button", {type: "button", className: "sound-play", title: "Play", "aria-label": "Play"});
  playBtn.innerHTML = playIcon;
  playBtn.addEventListener("click", () => play());
  const canvas = el("canvas", {className: "wave", "aria-hidden": "true"});
  const meta = el("div", {className: "wave-meta"});
  const wavePanel = el("div", {className: "wave-panel"});
  const waveBox = el("div", {className: "wave-box"});
  waveBox.append(canvas, meta);
  wavePanel.append(playBtn, waveBox);

  const tabs = el("div", {className: "layer-tabs", role: "tablist", "aria-label": "Layers"});
  const panel = el("div", {className: "layer-panel", role: "tabpanel"});

  const body = el("div", {className: "editor-body"});
  body.append(wavePanel, tabs, panel);

  const autoInput = el("input", {type: "checkbox", role: "switch"});
  autoInput.checked = autoPlay;
  autoInput.addEventListener("change", () => { autoPlay = autoInput.checked; saveAutoPlay(autoPlay) });
  const autoLabel = el("label", {className: "auto-play"});
  autoLabel.append(switchFor(autoInput), el("span", {textContent: "Play as I edit"}));
  const status = el("span", {className: "editor-status", role: "status"});
  const deleteBtn = el("button", {type: "button", className: "btn-plain danger", textContent: "Delete"});
  deleteBtn.hidden = isNew;
  deleteBtn.addEventListener("click", onDelete);
  const cancelBtn = el("button", {type: "button", className: "btn-plain", textContent: "Cancel"});
  cancelBtn.addEventListener("click", () => tryClose());
  const saveBtn = el("button", {type: "button", className: "btn", textContent: isNew ? "Save sound" : "Save"});
  saveBtn.addEventListener("click", onSave);
  const foot = el("footer", {className: "editor-foot"});
  foot.append(autoLabel, status, deleteBtn, cancelBtn, saveBtn);

  dialog.append(head, body, foot);
  document.body.append(dialog);
  dialog.addEventListener("cancel", e => { e.preventDefault(); tryClose() });
  dialog.addEventListener("close", () => { dialog.remove(); removeEventListener("resize", draw) });
  addEventListener("resize", draw);
  dialog.showModal();
  if (isNew) nameInput.focus();
  else playBtn.focus();

  renderTabs();
  renderPanel();
  redraw();


  //---------------------------------------------------------------- layer tabs
  function renderTabs() {
    tabs.replaceChildren();
    draft.layers.forEach((layer, i) => {
      const tab = el("button", {type: "button", role: "tab", className: "layer-tab", "aria-selected": String(i == current), textContent: `${i + 1}. ${waveLabels[layer.wave]}`});
      tab.addEventListener("click", () => { current = i; renderTabs(); renderPanel(); redraw() });
      tabs.append(tab);
    });
    const add = el("button", {type: "button", className: "layer-tab add", textContent: "+ Add layer"});
    add.disabled = draft.layers.length >= soundLimits.layers;
    add.title = add.disabled ? `A sound can have up to ${soundLimits.layers} layers` : "Add a layer";
    add.addEventListener("click", () => {
      draft.layers.push({...newSoundLayer});
      current = draft.layers.length - 1;
      changed(true, true);
    });
    tabs.append(add);
  }

  //---------------------------------------------------------------- one layer's controls
  function renderPanel() {
    const layer = draft.layers[current];
    const isOsc = layer.wave != "noise" && layer.wave != "crunch";
    panel.replaceChildren();

    //source
    const source = group("Source");
    source.body.append(segmented("Waveform", (Object.keys(waveLabels) as Wave[]).map(w => [w, waveLabels[w]]), () => layer.wave, w => setWave(layer, w)));
    if (layer.wave == "pulse") {
      source.body.append(segmented("Pulse width", [[0.125, "12.5%"], [0.25, "25%"], [0.5, "50%"]], () => layer.duty ?? 0.5, d => layer.duty = d));
    }
    source.body.append(slider("Starts after", {min: 0, max: 1000, unit: "ms", scale: 1000, get: () => layer.start ?? 0, set: v => layer.start = v || undefined}));
    const layerActions = el("div", {className: "layer-actions"});
    const dup = el("button", {type: "button", className: "btn-plain small", textContent: "Duplicate layer"});
    dup.disabled = draft.layers.length >= soundLimits.layers;
    dup.addEventListener("click", () => {
      draft.layers.splice(current + 1, 0, structuredClone(layer));
      current++;
      changed(true, true);
    });
    const remove = el("button", {type: "button", className: "btn-plain small danger", textContent: "Remove layer"});
    remove.disabled = draft.layers.length <= 1;
    remove.addEventListener("click", () => {
      draft.layers.splice(current, 1);
      current = Math.min(current, draft.layers.length - 1);
      changed(true, true);
    });
    layerActions.append(dup, remove);
    source.body.append(layerActions);

    //pitch
    const pitch = group(layer.wave == "crunch" ? "Brightness" : "Pitch");
    if (layer.wave == "noise") {
      pitch.body.append(el("p", {className: "muted hint", textContent: "Noise has no pitch. Shape it with the filter."}));
    }
    else {
      const freqOpts = freqSlider(layer.wave);
      pitch.body.append(slider(freqOpts.label, {...freqOpts, get: () => layer.freq ?? 440, set: v => layer.freq = v}));
      const motion = layer.arp ? "arp" : layer.glide?.length ? "glide" : "steady";
      const motions: [string, string][] = [["steady", "Steady"], ["glide", "Slide"], ["arp", "Arpeggio"]];
      pitch.body.append(segmented("Movement", motions, () => motion, m => {
        delete layer.arp;
        delete layer.glide;
        const f = layer.freq ?? 440;
        if (m == "glide") layer.glide = [{to: layer.wave == "crunch" ? f / 4 : f * 2, time: 0.1}];
        if (m == "arp") layer.arp = {notes: [f, f * 1.25, f * 1.5], step: 0.04};
      }));
      if (layer.glide?.length) pitch.body.append(glideEditor(() => layer.glide!, g => layer.glide = g.length ? g : undefined, freqOpts));
      if (layer.arp) pitch.body.append(arpEditor(layer.arp));
    }

    //vibrato
    const vibrato = group("Vibrato", isOsc ? {
      on: () => !!layer.vibrato,
      set: on => layer.vibrato = on ? {rate: 8, depth: 20, time: Math.max(0.05, soundDuration([layer]) - (layer.start ?? 0))} : undefined,
    } : undefined);
    if (!isOsc) vibrato.body.append(el("p", {className: "muted hint", textContent: "Vibrato needs a waveform with a pitch."}));
    else if (layer.vibrato) {
      const v = layer.vibrato;
      vibrato.body.append(
        slider("Speed", {min: 0.5, max: 60, log: true, unit: "Hz", get: () => v.rate, set: x => v.rate = x}),
        slider("Depth", {min: 0.1, max: 2000, log: true, unit: "Hz", get: () => v.depth, set: x => v.depth = x}),
        slider("Fades to", {min: 0.1, max: 2000, log: true, unit: "Hz", get: () => v.end ?? v.depth, set: x => v.end = x}),
        slider("Over", {min: 1, max: 2000, log: true, unit: "ms", scale: 1000, get: () => v.time, set: x => v.time = x}),
      );
    }

    //filter
    const filter = group("Filter", {
      on: () => !!layer.filter,
      set: on => layer.filter = on ? {type: "lowpass", freq: 2000, q: 1} : undefined,
    });
    if (layer.filter) {
      const f = layer.filter;
      const cutoff = {min: 20, max: 20000, log: true, unit: "Hz", label: "Cutoff"};
      filter.body.append(
        segmented("Type", [["lowpass", "Low-pass"], ["highpass", "High-pass"], ["bandpass", "Band-pass"]], () => f.type, t => f.type = t),
        slider("Cutoff", {...cutoff, get: () => f.freq, set: x => f.freq = x}),
        slider("Resonance", {min: 0.1, max: 30, log: true, unit: "Q", get: () => f.q, set: x => f.q = x}),
      );
      if (f.glide?.length) filter.body.append(glideEditor(() => f.glide!, g => f.glide = g.length ? g : undefined, cutoff));
      else {
        const sweep = el("button", {type: "button", className: "btn-plain small", textContent: "+ Sweep the cutoff"});
        sweep.addEventListener("click", () => { f.glide = [{to: f.freq * 2, time: 0.1}]; changed(true, true) });
        filter.body.append(sweep);
      }
    }

    //envelope
    const envelope = group("Envelope");
    envelope.body.append(
      slider("Attack", {min: 1, max: 2000, log: true, unit: "ms", scale: 1000, get: () => layer.attack, set: v => layer.attack = v}),
      slider("Hold", {min: 0, max: 2000, unit: "ms", scale: 1000, get: () => layer.hold ?? 0, set: v => layer.hold = v || undefined}),
      slider("Decay", {min: 1, max: 2000, log: true, unit: "ms", scale: 1000, get: () => layer.decay, set: v => layer.decay = v}),
      slider("Level", {min: 0.1, max: 150, unit: "%", scale: 100, get: () => layer.level, set: v => layer.level = v}),
      el("p", {className: "muted hint", textContent: layer.hold ? "Rises, holds, then fades out." : "No hold: a percussive hit that peaks and dies away."}),
    );

    panel.append(source.box, pitch.box, envelope.box, filter.box, vibrato.box);
  }

  function setWave(layer: Layer, wave: Wave) {
    const wasCrunch = layer.wave == "crunch";
    layer.wave = wave;
    if (wave == "pulse") layer.duty ??= 0.25;
    if (wave == "noise" || wave == "crunch") delete layer.vibrato;
    //crunch's "frequency" is a brightness, so moving to or from it starts the pitch over
    if ((wave == "crunch") != wasCrunch) {
      delete layer.glide;
      delete layer.arp;
      layer.freq = wave == "crunch" ? 0.5 : 440;
    }
  }

  function freqSlider(wave: Wave) {
    return wave == "crunch"
      ? {label: "Brightness", min: 1, max: 100, unit: "%", scale: 100}
      : {label: "Frequency", min: 20, max: 20000, log: true, unit: "Hz"};
  }

  function glideEditor(get: () => Glide[], set: (g: Glide[]) => void, target: SliderRange & {label: string}) {
    const box = el("div", {className: "glides"});
    get().forEach((g, i) => {
      const row = el("div", {className: "glide-row"});
      const remove = el("button", {type: "button", className: "chip-remove", title: "Remove this slide", "aria-label": "Remove slide " + (i + 1), textContent: "×"});
      remove.addEventListener("click", () => { set(get().filter((_, j) => j != i)); changed(true, true) });
      row.append(
        slider(i ? "Then to" : "Slides to", {...target, get: () => g.to, set: v => g.to = v}),
        slider("Over", {min: 1, max: 2000, log: true, unit: "ms", scale: 1000, get: () => g.time, set: v => g.time = v}),
        remove,
      );
      box.append(row);
    });
    if (get().length < soundLimits.glides) {
      const add = el("button", {type: "button", className: "btn-plain small", textContent: "+ Add another slide"});
      add.addEventListener("click", () => {
        const list = get();
        set([...list, {to: list[list.length - 1].to, time: 0.1}]);
        changed(true, true);
      });
      box.append(add);
    }
    return box;
  }

  function arpEditor(arp: {notes: number[], step: number}) {
    const box = el("div", {className: "arp"});
    const field = el("label", {className: "field"});
    const input = el("input", {type: "text", inputmode: "decimal", spellcheck: "false"});
    input.value = arp.notes.map(n => fmt(n)).join(", ");
    input.addEventListener("change", () => {
      const notes = input.value.split(/[\s,]+/).map(Number).filter(n => n > 0).slice(0, soundLimits.arpNotes)
        .map(n => Math.min(20000, Math.max(20, n)));
      if (notes.length) arp.notes = notes;
      input.value = arp.notes.map(n => fmt(n)).join(", ");
      changed(true);
    });
    field.append(el("span", {className: "field-label", textContent: "Notes (Hz)"}), input);
    box.append(field, slider("Note length", {min: 5, max: 500, log: true, unit: "ms", scale: 1000, get: () => arp.step, set: v => arp.step = v}));
    return box;
  }


  //---------------------------------------------------------------- building blocks
  function group(title: string, toggle?: {on: () => boolean, set: (on: boolean) => void}) {
    const box = el("section", {className: "group"});
    const h = el("div", {className: "group-head"});
    h.append(el("h3", {textContent: title}));
    if (toggle) {
      const input = el("input", {type: "checkbox", role: "switch", "aria-label": title});
      input.checked = toggle.on();
      input.addEventListener("change", () => { toggle.set(input.checked); changed(true, true) });
      h.append(switchFor(input));
      box.classList.toggle("off", !input.checked);
    }
    const body = el("div", {className: "group-body"});
    box.append(h, body);
    return {box, body};
  }

  function segmented<T extends string|number>(label: string, options: [T, string][], get: () => T, set: (v: T) => void) {
    const box = el("div", {className: "field"});
    const seg = el("div", {className: "segmented", role: "group", "aria-label": label});
    for (const [value, text] of options) {
      const b = el("button", {type: "button", textContent: text, "aria-pressed": String(get() == value)});
      b.addEventListener("click", () => {
        if (get() == value) return;
        set(value);
        changed(true, true);
      });
      seg.append(b);
    }
    box.append(el("span", {className: "field-label", textContent: label}), seg);
    return box;
  }

  interface SliderRange { min: number, max: number, log?: boolean, unit: string, scale?: number }

  /** A range slider with a number box, in display units (ms, %, Hz); `scale` converts from stored units */
  function slider(label: string, o: SliderRange & {get: () => number, set: (v: number) => void}) {
    const scale = o.scale ?? 1;
    const toRange = (d: number) => o.log
      ? 1000 * Math.log(Math.max(d, o.min) / o.min) / Math.log(o.max / o.min)
      : 1000 * (d - o.min) / (o.max - o.min);
    const fromRange = (r: number) => o.log ? o.min * Math.pow(o.max / o.min, r / 1000) : o.min + (o.max - o.min) * r / 1000;
    const clamp = (d: number) => Math.min(o.max, Math.max(o.min, d));

    const box = el("label", {className: "field slider"});
    const range = el("input", {type: "range", min: "0", max: "1000", step: "1", "aria-label": label});
    const num = el("input", {type: "number", min: String(o.min), max: String(o.max), step: "any", "aria-label": label + " in " + o.unit});
    const sync = () => {
      const d = o.get() * scale;
      range.value = String(Math.round(toRange(d)));
      num.value = fmt(d);
    };
    sync();
    range.addEventListener("input", () => {
      const d = round(fromRange(Number(range.value)));
      o.set(d / scale);
      num.value = fmt(d);
      changed(false);
    });
    range.addEventListener("change", () => changed(true));
    num.addEventListener("change", () => {
      const d = Number(num.value);
      if (num.value.trim() && isFinite(d)) o.set(clamp(d) / scale);
      sync();
      changed(true);
    });
    const value = el("span", {className: "num"});
    value.append(num, el("span", {className: "unit", textContent: o.unit}));
    box.append(el("span", {className: "field-label", textContent: label}), range, value);
    return box;
  }

  function switchFor(input: HTMLInputElement) {
    const wrap = el("span", {className: "switch"});
    wrap.append(input, el("span", {className: "switch-track", "aria-hidden": "true"}));
    return wrap;
  }

  //3 significant digits keeps slider values readable (523, 52.3, 5.23)
  function round(d: number) {
    return d == 0 ? 0 : Number(d.toPrecision(3));
  }

  function fmt(d: number) {
    return String(Number(d.toFixed(d < 10 ? 3 : d < 100 ? 2 : 1)));
  }


  //---------------------------------------------------------------- changes, preview, waveform
  /** `commit`: the user let go of a control, so play the sound; `rebuild`: controls changed shape */
  function changed(commit: boolean, rebuild = false) {
    dirty = true;
    cancelBtn.textContent = "Cancel";
    status.textContent = "";
    if (rebuild) {
      renderTabs();
      renderPanel();
    }
    else if (commit) {
      //a tab's label names its waveform
      renderTabs();
    }
    redraw();
    if (commit && autoPlay) play();
  }

  function play() {
    player.volume = hooks.volume();
    const layers = sanitizeLayers(draft.layers);
    player.play(layers);
    startPlayhead(soundDuration(layers));
  }

  function redraw() {
    //coalesce a slider drag into one offline render per frame
    if (redrawTimer) return;
    redrawTimer = requestAnimationFrame(async () => {
      redrawTimer = 0;
      const seq = ++renderSeq;
      const layers = sanitizeLayers(draft.layers);
      const [m, s] = await Promise.all([
        renderOffline(layers),
        layers.length > 1 ? renderOffline([layers[current]]) : Promise.resolve(undefined),
      ]);
      if (seq != renderSeq) return;
      mix = m;
      solo = s;
      updateMeta(layers);
      draw();
    });
  }

  function updateMeta(layers: Layer[]) {
    let peak = 0;
    for (const v of mix!) peak = Math.max(peak, Math.abs(v));
    const ms = Math.round(soundDuration(layers) * 1000);
    meta.replaceChildren(el("span", {textContent: `${ms} ms`}), el("span", {textContent: `Peak ${Math.round(peak * 100)}%`}));
    if (peak > 1) meta.append(el("span", {className: "warn", textContent: "Peaks above 100% will distort. Lower a layer's level."}));
    else if (ms > 600) meta.append(el("span", {className: "warn soft", textContent: "Long for a click sound. Overlapping clicks can pile up."}));
  }

  function draw() {
    if (!mix || !dialog.isConnected) return;
    const dpr = devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const g = canvas.getContext("2d")!;
    g.scale(dpr, dpr);
    const css = getComputedStyle(dialog);
    const color = (name: string) => css.getPropertyValue(name).trim();
    const mid = h / 2, amp = h / 2 - 6;

    //full-scale guides and the center line
    g.fillStyle = color("--surface-2");
    g.fillRect(0, mid - amp, w, amp * 2);
    g.fillStyle = color("--border");
    g.fillRect(0, Math.round(mid), w, 1);

    const plot = (data: Float32Array, style: string) => {
      g.fillStyle = style;
      const per = data.length / w;
      for (let x = 0; x < w; x++) {
        let lo = 0, hi = 0;
        const end = Math.min(data.length, Math.floor((x + 1) * per));
        for (let i = Math.floor(x * per); i < end; i++) {
          const v = data[i];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        lo = Math.max(lo, -1.1);
        hi = Math.min(hi, 1.1);
        g.fillRect(x, mid - hi * amp, 1, Math.max(1, (hi - lo) * amp));
      }
    };
    //the whole sound, with the selected layer on top when there's more than one
    if (solo) {
      plot(mix, color("--track") + "88");
      plot(solo, color("--accent"));
    }
    else plot(mix, color("--accent"));

    if (playhead) {
      const t = (performance.now() - playhead.start) / 1000;
      const total = mix.length / 44100;
      g.fillStyle = color("--text");
      g.fillRect(Math.round(t / total * w), 0, 1.5, h);
    }
  }

  function startPlayhead(dur: number) {
    playhead = {start: performance.now(), dur};
    const tick = () => {
      if (!playhead || !dialog.isConnected) return;
      if (performance.now() - playhead.start > playhead.dur * 1000 + 20) playhead = undefined;
      draw();
      if (playhead) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }


  //---------------------------------------------------------------- save, delete, close
  async function onSave() {
    const sound: Sound = {
      id: draft.id || newCustomSoundId(),
      name: draft.name.trim().slice(0, 60) || "Untitled sound",
      layers: sanitizeLayers(draft.layers),
    };
    saveBtn.disabled = true;
    try {
      await saveCustomSound(sound);
      dirty = false;
      dialog.close();
      hooks.onSave(sound.id, isNew);
    }
    catch (err) {
      //sync storage has a total quota, and a cap on writes per minute
      status.textContent = "Couldn't save: " + (err instanceof Error ? err.message : String(err));
      saveBtn.disabled = false;
    }
  }

  async function onDelete() {
    if (!deleteArmed) {
      deleteBtn.textContent = "Click again to delete";
      deleteArmed = setTimeout(() => { deleteArmed = 0; deleteBtn.textContent = "Delete" }, 3000);
      return;
    }
    clearTimeout(deleteArmed);
    await deleteCustomSound(draft.id);
    hooks.onDelete(draft.id);
    dirty = false;
    dialog.close();
  }

  function tryClose() {
    if (dirty && cancelBtn.textContent != "Discard changes") {
      cancelBtn.textContent = "Discard changes";
      status.textContent = "You have unsaved changes.";
      cancelBtn.focus();
      return;
    }
    dialog.close();
  }

  function loadAutoPlay() {
    try { return localStorage.getItem("editorAutoPlay") != "false" } catch { return true }
  }

  function saveAutoPlay(on: boolean) {
    try { localStorage.setItem("editorAutoPlay", String(on)) } catch {}
  }
}
