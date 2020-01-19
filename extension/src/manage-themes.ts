(function() {
  const peer = new RpcPeer(new DocumentMessagingPeer("ManageThemesClient", "ManageThemesService"));
  peer.onInvoke = onInvoke;


  async function onInvoke(method: string, args: any[]) {
    if (method == "getSettings") return await getSettings();
    else if (method == "saveSettings") return await saveSettings(args[0]);
    else throw new Error("Unknown method");
  }
})();
