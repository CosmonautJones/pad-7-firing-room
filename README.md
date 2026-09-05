# PAD-7 Firing Room

A dawn blockhouse on the Eastern Range. You arm a ten-second count, light Kestrel I, and warp the range clock until periapsis comes up green.

No install. No server. Double-click `PAD-7.html`.

## Try it in thirty seconds

1. Clone this repo (or download the ZIP).
2. Open `PAD-7.html`, or run `Open PAD-7.bat` on Windows.
3. Click **ARM COUNTDOWN**. Chrome starts audio on that click.
4. After liftoff, mash **CLOCK** to 25× and wait for **ORBIT**.

RANGE flies the gravity turn and circularizes. Switch to PILOT if you want the stick.

```
node test/run.js
```

39 tests: orbital physics, audio desk, composition root.

## What you are looking at

| Surface | Job |
|---|---|
| Optical window | Three.js Earth, pad, stack, cameras |
| Paper desk | RANGE / PILOT / PROP / STACK |
| Mosaic lamps | PROP GUID RANGE TRACK MAX-Q FUEL ORBIT GO |
| Range clock | **HOLD** until you arm it |

**VIEW** cycles AUTO, PAD, TOWER, SITE, CHASE, LIMB, MAP. Mosaic **TRACK** is the radar lamp, not a camera.

## Keys

| Key | Action |
|---|---|
| I / Space | Arm, commit, or (in flight) CLOCK |
| . / , | Faster / slower clock |
| C | VIEW |
| / | Abort or hold count |
| R | Reset to pad |
| G | Guidance |
| W/S A/D X | Throttle, pitch, stage (PILOT) |
| 1–4 | Desk |
| M | Mute |

## Architecture

Classic scripts, one responsibility each:

```
PAD-7.html     desk, countdown, radio, composition
physics.js     gravity, drag, rocket equation, RANGE autopilot
optical.js     Three.js window only
audio.js       Web Audio graph (injected AudioContext in tests)
three.min.js   vendored r160 UMD
```

Decisions that are expensive to reverse live in [`docs/adr/`](docs/adr/README.md). Layout of the modules: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Vehicles

- **Kestrel I** — two-stage LEO. RANGE + guidance inserts ~120×310 km.
- **Sparrow** — sounding. KARMAN, APOGEE, SOUNDING, splashdown.
- **Heavy** — more stack than you probably need.

## Constraints we will not silently reverse

- Analog firing room (formica, brass, mosaic). Not a neon HUD.
- `file://` first. No bundler required to play.
- Physics changes need a failing test first.
- 3D stays in the optical window.

## License

MIT. See [LICENSE](LICENSE).
