//Owns the offscreen document that plays sounds for content scripts. Extension pages aren't
//subject to the autoplay rules web pages are, so sounds play even before the user has clicked
//anything on the page. Chrome closes an audio offscreen document after 30s of silence, so it's
//recreated on demand.
(function() {
  let creating: Promise<void>|undefined;

  chrome.runtime.onInstalled.addListener(() => ensureOffscreen().catch(console.error));
  chrome.runtime.onStartup.addListener(() => ensureOffscreen().catch(console.error));

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type == "hello") {
      sendResponse({offscreen: !!chrome.offscreen});
      if (chrome.offscreen) ensureOffscreen().catch(console.error);
    }
    else if (msg.type == "play" && chrome.offscreen) {
      //when the offscreen document is alive it receives the message too and plays it;
      //otherwise create it and hand the sound over
      forwardIfClosed(msg).catch(console.error);
    }
  })


  async function forwardIfClosed(msg: PlayMessage) {
    if (await ensureOffscreen()) await chrome.runtime.sendMessage(msg);
  }

  /** Returns true if the document had to be created */
  async function ensureOffscreen() {
    const existing = await chrome.runtime.getContexts({contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]});
    if (existing.length) return false;
    creating ??= chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
      justification: "Plays the sound effects for button presses, link clicks and hovers",
    }).finally(() => creating = undefined);
    await creating;
    return true;
  }
})();
