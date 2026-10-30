# Audify

Web browsing sound effects, as a browser extension. Audify plays a short sound when you press a
button, and optionally when you hover a button or click a link, on every website. It's meant for
people who rely on sound to know their input registered.

## How it works

Every sound is synthesized on the spot with the Web Audio API (oscillators, noise, filters and
envelopes). There are no audio files, so there's no fetch, no decode, and no silence at the head of
a sample. Sounds are triggered on `pointerdown` (and Enter/Space for keyboard users) rather than on
`click`, which is what makes them feel immediate.

The catalog lives in [`extension/src/sounds.ts`](extension/src/sounds.ts). Each entry is a small
`render(synth)` function; adding a sound means adding an entry there.

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
