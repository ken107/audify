(function() {
  const audios: {[url: string]: HTMLAudioElement} = {};
  chrome.runtime.onConnect.addListener(port => {
    new RpcPeer(new ExtensionMessagingPeer(port)).onInvoke = playAudio;
  })


  function playAudio(url: string) {
    if (audios[url]) {
      audios[url].currentTime = 0;
      audios[url].play();
    }
    else {
      audios[url] = document.createElement("AUDIO") as HTMLAudioElement;
      audios[url].src = url;
      audios[url].play();
    }
  }
})();
