# ADR 0005 — Web Audio graph, injected AudioContext

- Status: Accepted
- Date: 2026-09-05
- Evidence: `audio.js` `Pad7Audio.create({ AudioContext })`, `test/audio.test.js`

## Context

The room needs engine, countdown, staging, and a success beat. Sample libraries fail `file://` and bloat the folder. The graph used to live inside `PAD-7.html`, which mixed desk orchestration with oscillators.

## Decision

`audio.js` is a UMD factory. The desk calls `Pad7Audio.create()` and unlocks on ARM (browser autoplay rules). Tests inject a fake `AudioContext`. No files, no CDN sounds. Mute is `M` and an AUDIO OFF mark on the mast.

This does **not** decide recorded F-1 samples or spatialization.

## Alternatives considered

- **MP3/OGG bank.** Heavier, licensing, `file://` path pain.
- **Keep audio in HTML.** Faster, violates single responsibility and made Node tests of mute/unlock awkward.

## Consequences

- Sound is synthetic. Honest, and good enough for a blockhouse toy.
- Missing `audio.js` must not crash the sim: the desk installs a silent stub.

## Validation

```
node test/audio.test.js
```

ARM COUNTDOWN in Chrome (a click) then listen: ticks, ignition thump, rumble, Max-Q crackle, MECO cutoff. `M` shows AUDIO OFF.
