# Audify

Web browsing sound effects, as a browser extension. Audify plays a short sound when you press a
button, and optionally when you click a link or hover over a button or link, on every website. It's meant for
people who rely on sound to know their input registered.

## How it works

Every sound is synthesized on the spot with the Web Audio API (oscillators, noise, filters and
envelopes). There are no audio files, so there's no fetch, no decode, and no silence at the head of
a sample. Sounds are triggered on `pointerdown` (and Enter/Space for keyboard users) rather than on
`click`, which is what makes them feel immediate.

The catalog lives in [`extension/src/sounds.ts`](extension/src/sounds.ts). Each sound is plain data:
a stack of layers, where a layer is a source (sine, triangle, square, saw, pulse, noise or chip
"crunch" noise) with an optional pitch slide, arpeggio or vibrato, an optional swept filter, and a
volume envelope. Adding a sound means adding an entry there.

Users can make their own sounds in the sound editor on the options page, starting from scratch or
from a copy of any catalog sound. The editor uses the same layer format, draws the waveform as you
change it, and plays the sound when you let go of a control. Custom sounds are saved in
`chrome.storage.sync` (one item per sound) and can be used for button clicks, link clicks and hover
like any catalog sound.

## Building

```sh
cd extension
npm install
npm run build      # outputs the unpacked extension to extension/build
npm run package    # zips build/ into package.zip for store upload
```

Store listing copy, permission justifications and screenshots are in [CHROMEWEBSTORE.md](CHROMEWEBSTORE.md) and `store/`; the privacy policy is [PRIVACY.md](PRIVACY.md).

Load `extension/build` as an unpacked extension (Chrome: `chrome://extensions`, Developer mode,
Load unpacked).
