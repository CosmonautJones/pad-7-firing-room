# ADR 0004 — Vendored Three.js, optical window only

- Status: Accepted
- Date: 2026-09-05
- Evidence: `three.min.js` (r160 UMD), `optical.js` `Pad7Optical`, canvas `#sky`

## Context

The window is the show: pad, tower, downrange site, chase, limb, map. Three.js from a CDN as ES modules does not open under `file://`. EffectComposer bloom needs those modules.

## Decision

Vendor `three.min.js` r160. `optical.js` is an IIFE that talks to `THREE` and exposes `Pad7Optical.{init,resize,render,reset}`. Logarithmic depth, ACES, generated Earth maps, additive plume (not a composer). If WebGL fails, `PAD-7.html` falls back to the 2D canvas path.

3D is forbidden on the desk.

## Alternatives considered

- **CDN `import * as THREE`.** Broken on `file://`.
- **EffectComposer UnrealBloom.** Needs addons; skipped in favor of additive plume shaders.
- **Full-page WebGL.** Would paint over the analog desk.

## Consequences

- ~670 KB committed binary-ish JS. Acceptable for a double-click toy.
- r160 UMD prints a deprecation warning. Inference: keep r160 until a UMD-compatible upgrade is tested on `file://`.
- Shadows vs logarithmic depth are unreliable. Pad lighting uses floods + a contact blob, not a trusted shadow map.

## Validation

Open `PAD-7.html`. HOLD pad, VIEW TOWER / SITE / CHASE / LIMB / MAP. Console may warn about `three.min.js` deprecation; it must not error.
