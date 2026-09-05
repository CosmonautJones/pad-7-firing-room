# Architecture

PAD-7 is a static firing-room sim. The composition root is `PAD-7.html`. Everything else is a module with one job.

## SOLID as applied here

This is not a React app and will not be made into one to “look SOLID.” The mapping is:

| Principle | How it shows up |
|---|---|
| **S**ingle responsibility | `physics.js` integrates orbits. `optical.js` draws the window. `audio.js` is the graph. The HTML owns desk state and phase. |
| **O**pen/closed | New cameras are entries in VIEW + `desiredCam`. New vehicles are presets. Do not edit the integrator to add a camera. |
| **L**iskov | Node and browser load the same `Pad7Physics` / `Pad7Audio` factories. Tests that pass in Node describe the objects the page uses. |
| **I**nterface segregation | RANGE/PILOT/PROP/STACK expose different sliders via `visibleControls`. Optical’s public surface is `init/resize/render/reset`. |
| **D**ependency inversion | `Pad7Audio.create({ AudioContext })` — tests inject a fake context. Physics takes vehicle + planet numbers, not the DOM. |

## Runtime

```
user click ARM
  → Sound.unlock()          (autoplay)
  → phase hold|count|flight
  → Pad7Physics.step / rangeAutopilot
  → Pad7Optical.render  or  2D canvas fallback
  → mosaic + telem + radio
```

Coordinate frame: pad at `(0, R + 1.2)`, nose `θ = π/2` up, pitch toward +X. Optical maps that into Three.js with +Y as the pad radial (Florida painted at that pole).

## Tests

`node test/run.js` runs:

- `physics.test.js` — 28 orbital / autopilot / fidelity cases
- `audio.test.js` — mute, unlock, injected context
- `architecture.test.js` — script order and analog markup contracts

## What does not belong here

- A bundler (ADR 0001)
- A sci-fi HUD (ADR 0002)
- Physics in the render loop (ADR 0003)
- CDN ES-module Three.js (ADR 0004)
- Sample files for engine noise (ADR 0005)
