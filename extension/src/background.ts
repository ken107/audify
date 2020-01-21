(function() {
  chrome.runtime.onConnect.addListener(port => {
    new RpcPeer(new ExtensionMessagingPeer(port)).onInvoke = (audioUrl: string) => getAudio(audioUrl).play();
  })


  function getAudio(url: string): HTMLAudioElement {
    const audio = document.createElement("AUDIO") as HTMLAudioElement;
    audio.src = url;
    return audio;
  }
})();
