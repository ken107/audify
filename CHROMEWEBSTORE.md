# Chrome Web Store Listing — Audify

> Last Updated: 2026-10-30

Copy-paste source for the Chrome Web Store Developer Dashboard. Keep it in sync with
`extension/dist/manifest.json` whenever permissions, features or data handling change.

## Store Listing

**Extension Name**
Audify - Web Browsing Sound Effects

**Short Description** (132 max)
Instant sound feedback when you press buttons, click links, or hover over them, on every website.

**Detailed Description**
Audify plays a short, instant sound whenever you press a button on a web page, so you always know your click registered. Optionally, it can also play a sound when you click a link or hover over a button or link.

Built for people who rely on sound. Many of us notice a missing click sound more than a missing visual change. Audify gives every button and link the kind of audible response physical controls have, with no noticeable delay.

47 sounds to choose from: crisp ticks, taps, pops, wood blocks, typewriter and keyboard clicks, quiet hover blips, chimes and swooshes for links, comical sounds such as boink, quack, honk, kazoo and slide whistle, and retro 8-bit bleeps like menu cursors, jumps and power-ups.
Separate sound choices for button presses, link clicks and hovers.
Works with the keyboard too: pressing Enter or Space on a button or link plays its sound.
Volume control and optional slight pitch variation, so repeated sounds feel natural.
Mute Audify on any site with one switch from the toolbar.
Your settings sync across your devices.

How to use it:
1. Install Audify. Button presses now make a sound on every site.
2. Click the Audify icon in the toolbar to turn on hover or link sounds, pick sounds, change the volume, or mute the current site.
3. Click "Browse all sounds" to hear the whole collection and pick your favorites.

Privacy: Audify only notices when you press, hover over, or activate a button or link, so it knows when to play a sound. It does not read or collect page content or browsing history, makes no network requests, and contains no analytics.

Feedback and bug reports: https://github.com/ken107/audify/issues

**Category**
Accessibility

**Single Purpose**
Plays a short sound effect when the user presses a button, clicks a link, or hovers over a button or link on a web page.

**Primary Language**
English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon | 128×128 PNG | ✅ Ready | `store/store-icon-128.png` (96 px artwork with 16 px padding, per store guidelines) |
| Screenshot 1 | 1280×800 | ✅ Ready | `store/screenshot-1-catalog.png` |
| Screenshot 2 | 1280×800 | ✅ Ready | `store/screenshot-2-popup.png` |
| Screenshot 3 | 1280×800 | ✅ Ready | `store/screenshot-3-dark.png` |
| Small Promo Tile | 440×280 | ⬜ Not created | |
| Marquee Promo Tile | 1400×560 | ⬜ Not created | |

### Screenshot Notes
1. Settings page with the sound catalog: shows the range of sounds and one-tap assignment.
2. Toolbar popup next to a one-line pitch: per-action switches, per-site mute, volume.
3. Settings page in dark mode.

Regenerate after UI changes. Icon sources are SVGs in `store/icon-source/`: `icon-full.svg` for the
extension's 48 and 128 px icons (edge to edge, so it matches other extensions on chrome://extensions),
`icon-small.svg` for the 16 and 32 px toolbar sizes, and `icon.svg` for the padded store icon.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Saves the user's Audify settings (on/off, chosen sound for each action, volume, pitch variation, muted sites) and syncs them across the user's signed-in browsers. |
| `activeTab` | permissions | When the user opens the toolbar popup, Audify reads the current tab's domain name to show a "Sounds on this site" switch, so the user can mute Audify on that site. The domain is only shown and, if the user mutes it, saved to their own settings. |
| `offscreen` | permissions | Audify plays its sounds from a hidden extension page so they can play as soon as a page loads, including hover sounds before the user has clicked anything on that page. The page only generates audio; it has no access to web pages or user data. |
| Content script on `<all_urls>` | host access | Audify's single purpose is to play a sound when the user presses a button or clicks a link on any website, so it must run on every site the user visits. The script only listens for pointer and keyboard events on buttons and links and plays a locally generated sound. It does not read page content, change the page, or send any data anywhere. Users can mute it per site or turn it off entirely. |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

Audify stores only its own settings in browser extension storage, and never transmits anything.
Per the CWS form, "User activity" is not collected: pointer and keyboard events are used
momentarily to trigger a sound and are not recorded, stored, or sent.

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | No | No | | No |
| Health info | No | No | | No |
| Financial info | No | No | | No |
| Authentication info | No | No | | No |
| Personal communications | No | No | | No |
| Location | No | No | | No |
| Web history | No | No | | No |
| User activity | No | No | | No |
| Website content | No | No | | No |

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL**
https://github.com/ken107/audify/blob/master/PRIVACY.md (live once this branch is merged)

## Distribution

**Visibility**: Public
**Regions**: All regions

## Developer Info

**Publisher Name**: _to fill in_
**Contact Email**: _to fill in_
**Support URL**: https://github.com/ken107/audify/issues
**Homepage URL**: https://github.com/ken107/audify

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 2.0.0 | 2026-10-30 | Synthesized sound catalog (47 sounds) replaces audio files; hover and link sounds; keyboard support; new popup and settings page; per-site mute; Manifest V3. | Draft |

## Review Notes

### Known Issues / Limitations
- In browsers without offscreen documents (Firefox), sounds play inside the page and are subject to its autoplay rules, so hover sounds stay silent until the user first clicks or presses a key there.
- Content scripts can't run on browser pages (chrome://, the Web Store), so those pages have no sounds.

### Rejection History
None yet.
