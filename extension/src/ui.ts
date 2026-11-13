//shared by popup.html and options.html; each section renders only if its container is on the page
(async function() {
  const player = new SoundPlayer();
  let settings = await getSettings();
  let customSounds = await getCustomSounds();
  const activeTab = await getActiveTab();
  const siteHostname = activeTab && /^https?:$/.test(activeTab.url.protocol) ? activeTab.url.hostname : undefined;

  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T|null;
  const enabledInput = $<HTMLInputElement>("enabled");
  const siteRow = $("site-row");
  const siteInput = $<HTMLInputElement>("site-enabled");
  const actionsBox = $("actions");
  const volumeInput = $<HTMLInputElement>("volume");
  const volumeText = $("volume-text");
  const varyPitchInput = $<HTMLInputElement>("vary-pitch");
  const disabledSitesBox = $("disabled-sites");
  const catalogBox = $("catalog");
  const openCatalogLink = $<HTMLAnchorElement>("open-catalog");
  const mySoundsBox = $("my-sounds");

  const actionKinds = Object.keys(actionLabels) as ActionKind[];
  const actionRows = new Map<ActionKind, {toggle: HTMLInputElement, select: HTMLSelectElement, row: HTMLElement}>();
  let assignChips: {kind: ActionKind, soundId: string, chip: HTMLButtonElement}[] = [];

  buildActions();
  buildCatalog();
  buildMySounds();
  render();
  checkActiveTab();

  enabledInput?.addEventListener("change", () => update(s => s.enabled = enabledInput.checked));
  siteInput?.addEventListener("change", () => update(s => {
    s.disabledSites = s.disabledSites.filter(x => x != siteHostname);
    if (!siteInput.checked) s.disabledSites.push(siteHostname!);
  }));
  volumeInput?.addEventListener("input", () => {
    settings.volume = Number(volumeInput.value) / 100;
    render();
  });
  volumeInput?.addEventListener("change", () => {
    update(() => {});
    preview(settings.actions.buttonClick.soundId);
  });
  varyPitchInput?.addEventListener("change", () => update(s => s.varyPitch = varyPitchInput.checked));
  openCatalogLink?.addEventListener("click", e => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  onSettingsChanged(value => {
    settings = value;
    render();
  });
  onCustomSoundsChanged(async () => {
    customSounds = await getCustomSounds();
    for (const {select} of actionRows.values()) fillSoundSelect(select);
    buildMySounds();
    render();
  });


  function update(change: (s: Settings) => void) {
    change(settings);
    render();
    saveSettings(settings).catch(console.error);
  }

  function preview(soundId: string) {
    const sound = findSound(soundId, customSounds);
    if (!sound) return;
    player.volume = settings.volume;
    player.varyPitch = settings.varyPitch;
    player.play(sound.layers);
  }

  //the sound an action actually plays: a custom sound that's gone falls back to the default
  function actionSoundId(kind: ActionKind) {
    const id = settings.actions[kind].soundId;
    return findSound(id, customSounds) ? id : defaultSettings.actions[kind].soundId;
  }

  function render() {
    if (enabledInput) enabledInput.checked = settings.enabled;
    document.body.classList.toggle("all-off", !settings.enabled);

    if (siteRow && siteInput && siteHostname) {
      siteRow.hidden = false;
      $("site-name")!.textContent = siteHostname;
      siteInput.checked = !settings.disabledSites.includes(siteHostname);
    }

    for (const [kind, {toggle, select, row}] of actionRows) {
      const action = settings.actions[kind];
      toggle.checked = action.enabled;
      select.value = actionSoundId(kind);
      row.classList.toggle("off", !action.enabled);
    }

    if (volumeInput) volumeInput.value = String(Math.round(settings.volume * 100));
    if (volumeText) volumeText.textContent = Math.round(settings.volume * 100) + "%";
    if (varyPitchInput) varyPitchInput.checked = settings.varyPitch;

    if (disabledSitesBox) renderDisabledSites(disabledSitesBox);

    for (const {kind, soundId, chip} of assignChips) {
      const action = settings.actions[kind];
      chip.setAttribute("aria-pressed", String(action.enabled && actionSoundId(kind) == soundId));
    }
  }

  function buildActions() {
    if (!actionsBox) return;
    for (const kind of actionKinds) {
      const row = el("div", {className: "action"});
      const head = el("label", {className: "action-head"});
      const toggle = el("input", {type: "checkbox", role: "switch"});
      head.append(el("span", {className: "action-name", textContent: actionLabels[kind]}), makeSwitch(toggle));

      const select = el("select", {"aria-label": actionLabels[kind] + " sound"});
      fillSoundSelect(select);
      const playBtn = el("button", {type: "button", className: "icon-btn", title: "Preview", "aria-label": "Preview " + actionLabels[kind].toLowerCase() + " sound"});
      playBtn.innerHTML = playIcon;

      toggle.addEventListener("change", () => update(s => s.actions[kind].enabled = toggle.checked));
      select.addEventListener("change", () => {
        update(s => s.actions[kind] = {enabled: true, soundId: select.value});
        preview(select.value);
      });
      playBtn.addEventListener("click", () => preview(select.value));

      const soundLine = el("div", {className: "action-sound"});
      soundLine.append(select, playBtn);
      row.append(head, soundLine);
      actionsBox.append(row);
      actionRows.set(kind, {toggle, select, row});
    }
  }

  function fillSoundSelect(select: HTMLSelectElement) {
    const value = select.value;
    select.replaceChildren();
    if (customSounds.size) {
      const group = el("optgroup", {label: "My sounds"});
      for (const sound of sortedCustomSounds()) group.append(el("option", {value: sound.id, textContent: sound.name}));
      select.append(group);
    }
    for (const cat of soundCategories) {
      const group = el("optgroup", {label: cat.name});
      for (const sound of soundCatalog.filter(x => x.category == cat.id)) {
        group.append(el("option", {value: sound.id, textContent: sound.name}));
      }
      select.append(group);
    }
    if (value) select.value = value;
  }

  function sortedCustomSounds() {
    return [...customSounds.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  //options page: the user's own sounds, above the catalog
  function buildMySounds() {
    if (!mySoundsBox) return;
    assignChips = assignChips.filter(x => !x.soundId.startsWith(customSoundIdPrefix));
    const newBtn = el("button", {type: "button", className: "btn", textContent: "New sound"});
    newBtn.addEventListener("click", () => openEditor({id: "", name: "", layers: [{...newSoundLayer}]}));
    const head = el("div", {className: "section-head"});
    const titles = el("div");
    titles.append(
      el("h2", {textContent: "My sounds"}),
      el("p", {className: "muted", textContent: "Make your own in the sound editor, or open any sound below and change it"}),
    );
    head.append(titles, newBtn);
    const grid = el("div", {className: "sound-grid"});
    for (const sound of sortedCustomSounds()) {
      const layers = sound.layers.length;
      grid.append(soundCard(sound, `${layers} layer${layers == 1 ? "" : "s"}, ${Math.round(soundDuration(sound.layers) * 1000)} ms`, "Edit"));
    }
    if (!customSounds.size) grid.append(el("p", {className: "muted empty", textContent: "None yet."}));
    mySoundsBox.replaceChildren(head, grid);
  }

  function openEditor(sound: Sound) {
    openSoundEditor(sound, {
      volume: () => settings.volume,
      onDelete: id => update(s => {
        for (const kind of actionKinds) if (s.actions[kind].soundId == id) s.actions[kind].soundId = defaultSettings.actions[kind].soundId;
      }),
      onSave: (id, isNew) => { if (isNew) mySoundsBox?.scrollIntoView({behavior: "smooth", block: "start"}) },
    });
  }

  function buildCatalog() {
    if (!catalogBox) return;
    for (const cat of soundCategories) {
      const section = el("section", {className: "category"});
      section.append(
        el("h2", {textContent: cat.name}),
        el("p", {className: "muted", textContent: cat.description}),
      );
      const grid = el("div", {className: "sound-grid"});
      for (const sound of soundCatalog.filter(x => x.category == cat.id)) grid.append(soundCard(sound, sound.description, "Edit a copy"));
      section.append(grid);
      catalogBox.append(section);
    }
  }

  function soundCard(sound: Sound, description: string, editLabel: string) {
    const card = el("div", {className: "sound-card"});
    const playBtn = el("button", {type: "button", className: "sound-play", "aria-label": "Play " + sound.name});
    playBtn.innerHTML = playIcon;
    const text = el("div", {className: "sound-text"});
    text.append(
      el("div", {className: "sound-name", textContent: sound.name}),
      el("div", {className: "sound-desc", textContent: description}),
    );
    const editBtn = el("button", {type: "button", className: "sound-edit", title: editLabel, "aria-label": editLabel + ": " + sound.name});
    editBtn.innerHTML = editIcon;
    editBtn.addEventListener("click", () => {
      if (customSounds.has(sound.id)) openEditor(structuredClone(sound));
      else openEditor({id: "", name: "My " + sound.name.toLowerCase(), layers: structuredClone(sound.layers)});
    });
    const assign = el("div", {className: "assign", role: "group", "aria-label": "Use " + sound.name + " for"});
    for (const kind of actionKinds) {
      const chip = el("button", {type: "button", className: "chip", textContent: actionLabels[kind], title: "Use for " + actionLabels[kind].toLowerCase()});
      chip.addEventListener("click", () => {
        update(s => s.actions[kind] = {enabled: true, soundId: sound.id});
        preview(sound.id);
      });
      assign.append(chip);
      assignChips.push({kind, soundId: sound.id, chip});
    }
    //hovering a card previews it; a short dwell keeps a fast sweep across the grid from firing every card
    let dwell: number|undefined;
    card.addEventListener("pointerenter", e => {
      if (e.pointerType == "mouse") dwell = setTimeout(() => preview(sound.id), 60);
    });
    card.addEventListener("pointerleave", () => clearTimeout(dwell));
    playBtn.addEventListener("click", () => preview(sound.id));
    card.append(playBtn, text, editBtn, assign);
    return card;
  }

  function renderDisabledSites(box: HTMLElement) {
    box.replaceChildren();
    if (!settings.disabledSites.length) {
      box.append(el("p", {className: "muted", textContent: "None. You can mute a site from the toolbar popup while you're on it."}));
      return;
    }
    for (const site of settings.disabledSites) {
      const chip = el("span", {className: "site-chip", textContent: site});
      const remove = el("button", {type: "button", className: "chip-remove", title: "Turn sounds back on for " + site, "aria-label": "Turn sounds back on for " + site, textContent: "×"});
      remove.addEventListener("click", () => update(s => s.disabledSites = s.disabledSites.filter(x => x != site)));
      chip.append(remove);
      box.append(chip);
    }
  }

  function makeSwitch(input: HTMLInputElement) {
    const wrap = el("span", {className: "switch"});
    wrap.append(input, el("span", {className: "switch-track", "aria-hidden": "true"}));
    return wrap;
  }

  //popup only; activeTab gives us the tab's URL because the user just clicked our icon
  async function getActiveTab() {
    if (!document.getElementById("site-row")) return undefined;
    try {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      if (tab?.id == null || !tab.url) return undefined;
      return {id: tab.id, url: new URL(tab.url)};
    }
    catch {
      return undefined;
    }
  }

  //Chrome doesn't add content scripts to tabs that were already open when the extension was
  //installed or updated, so if ours doesn't answer, explain why this page is silent
  async function checkActiveTab() {
    const notice = $("tab-notice");
    if (!notice || !activeTab) return;
    const {protocol, hostname} = activeTab.url;
    const isWeb = /^https?:$/.test(protocol) || (protocol == "file:" && await chrome.extension.isAllowedFileSchemeAccess());
    const isStore = hostname == "chromewebstore.google.com" || (hostname == "chrome.google.com" && activeTab.url.pathname.startsWith("/webstore"));
    if (!isWeb || isStore) {
      notice.querySelector("p")!.textContent = "Browser pages like this one can't play Audify sounds. Sounds work on regular websites.";
      notice.hidden = false;
      return;
    }
    try {
      await chrome.tabs.sendMessage(activeTab.id, {type: "ping"}, {frameId: 0});
    }
    catch {
      const reloadBtn = el("button", {type: "button", className: "btn", textContent: "Reload page"});
      reloadBtn.addEventListener("click", async () => {
        await chrome.tabs.reload(activeTab.id);
        window.close();
      });
      notice.querySelector("p")!.textContent = "This page was opened before Audify was installed or updated. Reload it to hear sounds here.";
      notice.append(reloadBtn);
      notice.hidden = false;
    }
  }
})();


const editIcon = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16v4zM13.5 6.5l4 4"/></svg>';

const playIcon = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, string> = {}): HTMLElementTagNameMap[K] {
  const elem = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key == "className" || key == "textContent" || key == "value" || key == "type" || key == "title" || key == "label") (elem as any)[key] = value;
    else elem.setAttribute(key, value);
  }
  return elem;
}
