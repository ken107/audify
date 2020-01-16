(function() {
  const audios: {[key: string]: HTMLAudioElement} = {};
  chrome.runtime.onConnect.addListener(port => {
    new RpcPeer(new ExtensionMessagingPeer(port)).onInvoke = (audioUrl: string) => getAudio(audioUrl).play();
  })


  function getAudio(url: string): HTMLAudioElement {
    if (!audios[url]) {
      audios[url] = document.createElement("AUDIO") as HTMLAudioElement;
      audios[url].src = url;
    }
    return audios[url];
  }
})();
