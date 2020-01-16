(function() {
  const peer = new RpcPeer(new ExtensionMessagingPeer(chrome.runtime.connect()));
  document.body.addEventListener("click", onClick);


  async function onClick(e: Event) {
    const target = e.target as Element;
    const settings = await getSettings();
    const rule = (settings.currentTheme || config.defaultTheme).rules.find(rule => target.matches(rule.match));
    if (rule) peer.invoke(rule.audioUrl);
  }
})();
