# ADR 0003 — Physics is a pure module

- Status: Accepted
- Date: 2026-09-05
- Evidence: `physics.js` UMD factory, `test/physics.test.js` (28 cases), `PAD-7.html` calls `Pad7Physics` only

## Context

Orbital mechanics is where the sim can silently lie. UI and WebGL change often. If gravity, drag, and the pitch program live in the page, a visual tweak can break LEO.

## Decision

`physics.js` owns gravity, atmosphere, drag, the rocket equation, staging, debris, classification, and RANGE autopilot. It has no DOM, no Three.js, no audio. Node and the browser load the same factory (`Pad7Physics`). Presentation (HTML, `optical.js`, `audio.js`) may not change orbital numbers.

This does **not** decide a 3D gravity model. Flight is still 2D Earth-centered (`x,y` plane, pad at `(0, R+1.2)`).

## Alternatives considered

- **Physics inside the render loop.** Faster to sketch, untestable without a browser.
- **Full 3D n-body.** Out of scope for a firing-room toy.

## Consequences

- Tighter LEO comes from the pitch program, not from cutting the upper early (see HANDOFF).
- Visual polish cannot “fix” apoapsis. Change `physics.js` only with a failing test first.

## Validation

```
node test/physics.test.js
```

Kestrel RANGE autopilot must circularize into bound LEO with leftover upper fuel. Sparrow must cross 100 km and fall back.
