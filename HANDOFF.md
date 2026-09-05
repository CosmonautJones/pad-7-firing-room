# PAD-7 Firing Room — handoff

Last worked: 2026-09-05. Tests: `node test/run.js` → physics 28, audio 6, architecture 5.

## What this is

A double-click desktop orbital launch sim. Dawn Cape Canaveral **blockhouse**. Optical window is Three.js. Desk is RANGE / PILOT / PROP / STACK.

Path: this folder. Open `PAD-7.html` or `Open PAD-7.bat`.

## Files

| File | Role |
|---|---|
| `PAD-7.html` | Desk, countdown, radio, 2D fallback |
| `optical.js` | Three.js window |
| `audio.js` | Web Audio graph |
| `three.min.js` | Vendored Three r160 |
| `physics.js` | Orbital physics + RANGE autopilot |
| `test/run.js` | Full suite |
| `docs/adr/` | Architecture decisions |

## Decisions (do not silently reverse)

See `docs/adr/`. Short form: analog desk, `file://`, physics isolated, 3D in the window only, injected audio.

## Pickup

```
node test/run.js
```

Then open `PAD-7.html`, ARM COUNTDOWN, CLOCK 25×, wait for ORBIT.
