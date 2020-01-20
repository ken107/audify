(async function() {
  const peer = new RpcPeer(new ExtensionMessagingPeer(chrome.runtime.connect()));
  const settings = await getSettings();
  const theme = settings.myThemes?.find(x => x.id == settings.currentThemeId);
  const eventTypes = theme?.rules.reduce((ag, x) => ag.add(x.eventType), new Set<string>());
  eventTypes?.forEach(x => document.body.addEventListener(x, onEvent));


  function onEvent(e: Event) {
    const target = e.target as Element;
    const rule = theme?.rules.find(x => x.eventType == e.type && target.matches(x.cssSelector));
    if (rule) peer.invoke(rule.audioUrl);
  }
})();
