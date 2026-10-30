(function() {
  const player = new SoundPlayer();

  chrome.runtime.onMessage.addListener((msg: PlayMessage) => {
    if (msg.type != "play") return;
    //a sound that would come out noticeably late is worse than none
    if (Date.now() - msg.time > 250) return;
    player.volume = msg.volume;
    player.varyPitch = msg.varyPitch;
    player.play(msg.soundId);
  })
})();
