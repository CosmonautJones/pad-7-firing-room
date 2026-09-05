# ADR 0002 — Analog firing room, not a sci-fi HUD

- Status: Accepted
- Date: 2026-09-05
- Evidence: `PAD-7.html` tokens (`--paper`, `--brass`, mosaic lamps), HOLD clock, apo/peri `—`

## Context

The interesting object is a Cape Canaveral blockhouse at dawn. A dark glass cockpit with neon readouts would be a different product and a more generic one.

## Decision

The desk is formica, brass, IBM Plex Mono / Teko, and eight mosaic lamps. The range clock reads **HOLD** until armed. Apoapsis and periapsis read **—** until they mean something. Action buttons are grid-pinned. Three.js lives only in the optical window.

Do not restyle toward shadcn, glassmorphism, or a mission-control HUD.

This does **not** freeze copy, lamp names, or camera labels; it freezes the material language.

## Alternatives considered

- **Dark ops HUD.** Faster to generate, reads as every other space game UI.
- **Split: 3D chrome + paper desk.** Tried; the chrome competed with the window.

## Consequences

- CSS tokens stay paper/oak/brass/abort/go.
- Camera control is **VIEW**, so it does not clash with mosaic **TRACK**.
- One **CLOCK** control, and only after liftoff.

## Validation

HOLD screenshot: paper desk, HOLD clock, no CLOCK button, VIEW AUTO, mosaic TRACK is a lamp. Architecture test asserts `ARM COUNTDOWN` and `VIEW AUTO` remain in markup.
