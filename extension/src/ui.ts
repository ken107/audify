//shared by popup.html and options.html; each section renders only if its container is on the page
(async function() {
  const player = new SoundPlayer();
  let settings = await getSettings();
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

  const actionKinds = Object.keys(actionLabels) as ActionKind[];
  const actionRows = new Map<ActionKind, {toggle: HTMLInputElement, select: HTMLSelectElement, row: HTMLElement}>();
  const assignChips: {kind: ActionKind, soundId: string, chip: HTMLButtonElement}[] = [];

  buildActions();
  buildCatalog();
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


  function update(change: (s: Settings) => void) {
    change(settings);
    render();
    saveSettings(settings).catch(console.error);
  }

  function preview(soundId: string) {
    player.volume = settings.volume;
    player.varyPitch = settings.varyPitch;
    player.play(soundId);
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
      select.value = action.soundId;
      row.classList.toggle("off", !action.enabled);
    }

    if (volumeInput) volumeInput.value = String(Math.round(settings.volume * 100));
    if (volumeText) volumeText.textContent = Math.round(settings.volume * 100) + "%";
    if (varyPitchInput) varyPitchInput.checked = settings.varyPitch;

    if (disabledSitesBox) renderDisabledSites(disabledSitesBox);

    for (const {kind, soundId, chip} of assignChips) {
      const action = settings.actions[kind];
      chip.setAttribute("aria-pressed", String(action.enabled && action.soundId == soundId));
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
      for (const cat of soundCategories) {
        const group = el("optgroup", {label: cat.name});
        for (const sound of soundCatalog.filter(x => x.category == cat.id)) {
          group.append(el("option", {value: sound.id, textContent: sound.name}));
        }
        select.append(group);
      }
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

  function buildCatalog() {
    if (!catalogBox) return;
    for (const cat of soundCategories) {
      const section = el("section", {className: "category"});
      section.append(
        el("h2", {textContent: cat.name}),
        el("p", {className: "muted", textContent: cat.description}),
      );
      const grid = el("div", {className: "sound-grid"});
      for (const sound of soundCatalog.filter(x => x.category == cat.id)) {
        const card = el("div", {className: "sound-card"});
        const playBtn = el("button", {type: "button", className: "sound-play", "aria-label": "Play " + sound.name});
        playBtn.innerHTML = playIcon;
        const text = el("div", {className: "sound-text"});
        text.append(
          el("div", {className: "sound-name", textContent: sound.name}),
          el("div", {className: "sound-desc", textContent: sound.description}),
        );
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
        card.append(playBtn, text, assign);
        grid.append(card);
      }
      section.append(grid);
      catalogBox.append(section);
    }
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


const playIcon = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, string> = {}): HTMLElementTagNameMap[K] {
  const elem = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key == "className" || key == "textContent" || key == "value" || key == "type" || key == "title" || key == "label") (elem as any)[key] = value;
    else elem.setAttribute(key, value);
  }
  return elem;
}
