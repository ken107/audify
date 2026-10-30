(function() {
  const player = new SoundPlayer();
  const hostname = topHostname();
  let settings: Settings|undefined;
  let lastHovered: Element|null = null;
  let lastHoverTime = 0;

  getSettings().then(applySettings);
  onSettingsChanged(applySettings);

  //capture phase on window, so pages that stop propagation don't swallow the sound
  addEventListener("pointerdown", onPointerDown, true);
  addEventListener("keydown", onKeyDown, true);
  addEventListener("pointerover", onPointerOver, true);


  function applySettings(value: Settings) {
    settings = value;
    player.volume = value.volume;
    player.varyPitch = value.varyPitch;
  }

  //sound on press rather than on click, it's what makes it feel immediate
  function onPointerDown(e: PointerEvent) {
    if (!e.isPrimary || e.button != 0) return;
    const hit = findTarget(e);
    if (hit) play(hit.kind == "button" ? "buttonClick" : "linkClick");
  }

  //keyboard activation: Enter on buttons and links, Space on buttons
  function onKeyDown(e: KeyboardEvent) {
    if (e.repeat || (e.key != "Enter" && e.key != " ")) return;
    const hit = findTarget(e);
    if (hit?.kind == "button") play("buttonClick");
    else if (hit?.kind == "link" && e.key == "Enter") play("linkClick");
  }

  function onPointerOver(e: PointerEvent) {
    if (e.pointerType != "mouse") return;
    const hit = findTarget(e);
    const button = hit?.kind == "button" ? hit.elem : null;
    if (button && button != lastHovered && e.timeStamp - lastHoverTime > 40) {
      lastHoverTime = e.timeStamp;
      play("buttonHover");
    }
    lastHovered = button;
  }

  function play(kind: ActionKind) {
    if (!settings || !isSiteEnabled(settings, hostname)) return;
    const action = settings.actions[kind];
    if (action.enabled) player.play(action.soundId);
  }

  //walk the composed path so buttons inside shadow DOM are found, innermost wins
  function findTarget(e: Event): {kind: "button"|"link", elem: Element}|null {
    for (const node of e.composedPath()) {
      if (!(node instanceof Element)) continue;
      if (node.matches(buttonSelector)) return isDisabled(node) ? null : {kind: "button", elem: node};
      if (node.matches(linkSelector)) return {kind: "link", elem: node};
    }
    return null;
  }

  function isDisabled(elem: Element) {
    return elem.matches(":disabled, [aria-disabled=true]");
  }

  //inside an iframe, per-site settings follow the site in the address bar
  function topHostname() {
    const ancestors = location.ancestorOrigins;
    if (ancestors?.length) {
      try { return new URL(ancestors[ancestors.length - 1]).hostname } catch {}
    }
    return location.hostname;
  }
})();
