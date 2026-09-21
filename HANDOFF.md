# PAD-7 Firing Room — handoff

Last worked: 2026-09-21. Tests: `node test/run.js` → physics 28, audio 6, architecture 6, optical 20, desk 9 (69 total).

## What this is

A double-click desktop orbital launch sim. Dawn Cape Canaveral **blockhouse**. Optical window is Three.js. Desk is RANGE / PILOT / PROP / STACK.

Path: this folder. Open `PAD-7.html` or `Open PAD-7.bat`.

## Files

| File | Role |
|---|---|
| `PAD-7.html` | Desk, countdown, radio, 2D fallback |
| `desk.js` | Clock, lamps, scope |
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

## Motion and exhaust polish

- Core and three flame cards scale from the nozzle; opaque fire stays attached at every throttle.
- Flame shaders share the renderer's logarithmic depth, so pad scenery does not hide the fringe.
- Low-altitude trench smoke uses a fixed billboard pool. Vacuum stretches and cools the plume.
- Camera offsets blend in wall time across AUTO PAD to CHASE; follow distance is bounded for both stages.
- LIMB aims along Earth's tangent. The sky renders as a backdrop and cannot cover the distant surface.
- Reduced motion freezes flame shader time, wobble and rumble, including preference changes while playing.
- The model clears the deck with a presentation offset. Physics and upper-stage guidance are unchanged.

Verified in Chrome using the real file protocol: HOLD, ARM / COMMIT, liftoff,
25× through Max-Q, C through SITE / LIMB / MAP, and fresh 420×680 HOLD / launch.
`node test/browser-smoke.cjs` repeats this check and asserts framing, AUTO continuity,
visible controls, reduced motion and zero console errors. See README for its optional test dependency.

## Cinematic presentation pass

- Baked roll markings and serials, body joints, external conduit, gantry lattice and railings, hazard paint, tanks and service pipes.
- Layered dawn sky and sparse stars. Blue atmospheric fade uses sightline height and the same depth convention as Earth.
- Billowing trench smoke, warm ignition light on the deck, nozzle glow, turbulent flame edges and shock diamonds.
- A short pressure- and Mach-driven condensation collar, made of wisps rather than a solid shell.
- AUTO now holds LIMB above 85 km until orbit is achieved; manual cameras retain precedence.
- Stack rebuilds dispose nested effect materials and shared geometry once, without disposing the reusable textures.

Verified: 45 unit/contract tests and the Chrome file-protocol smoke test, including
an actual full Kestrel flight through orbital insertion, automatic map reveal,
420x680 controls, live reduced motion and zero console errors.

## Interactive optics and photo mode

- Optical canvas owns pointer capture, one-finger orbit, two-finger pinch, wheel zoom and focused arrow keys. No control library or play dependency added.
- Manual view uses a local radial frame, bounded distances and surface clearance. It stays attached to the stack at warp; MAP orbits Earth.
- Double-click / AUTO restores automatic framing. Cycling VIEW clears manual control. HAND indicates the temporary override.
- PHOTO / P pauses both simulation and visual time and hides the desk. Camera input keeps its wall clock so composition remains responsive. RESUME / Escape continues without catch-up.
- SAVE PNG renders and captures the WebGL canvas immediately, with no preserveDrawingBuffer overhead during play. Traces and UI are excluded. Capture failure leaves the flight paused with a visible retry message.
- Flight shortcuts are inactive in photo mode; focused camera arrow keys cannot steer the vehicle. Browser zoom shortcuts and native form controls retain their behavior.

Verification: `node test/run.js` (48 tests); `node test/browser-optics.cjs`
(mouse, wheel, keyboard, pinch, 25x anchoring, countdown and flight pause, PNG bytes,
resume, capture failure and 420x680); `node test/browser-smoke.cjs` (full AUTO flight).
Browser integration scripts use the optional Playwright test dependency described in README.


## Detail, lighting and photographic export

- Embedded 4096 x 2048 NASA Blue Marble surface and 2048 x 1024 cloud mask,
  aligned to Cape Canaveral and the flight plane. Sources: assets/README.md.
- Earth images decode asynchronously into fresh GPU textures. Tiny fallback
  allocations are disposed after replacement. No network request during play.
- Sky, atmospheric and flame shaders explicitly finish the color pipeline.
  The solar disk, directional illumination and atmosphere share a dawn direction.
- PMREM now captures luminous sky geometry. A lights-only scene had generated
  a black reflection map; metalwork now receives soft dawn reflections.
- Clouds sit near 7.6 km rather than 51 km. Stars sit beyond the planet at every
  MAP distance instead of appearing in front of its surface.
- MAP frames the Americas and the launch region. Manual orbit remains available.
- SAVE 4K produces a PNG up to 3840 pixels on its longest edge, preserving aspect
  ratio and respecting GPU limits. Live size and density restore even on error.
- Live render density stays capped at 2x; photo export alone raises resolution.

Verification: 53 unit/contract tests; offline Chrome optical integration includes
GPU texture pixel readback, 4K PNG dimensions, pause/resume, touch and mobile.
Full file-protocol flight smoke verifies ascent, Max-Q, limb, orbit and 420x680.


## Vehicle assemblies and range hardware

- `modelProfile`, `modelFrame` and `makeVehicleModel` in optical.js define three
  fictional silhouettes. The model is procedural and remains inside the optical
  window. Lathed pressure vessels, ogive fairings, swept extruded fins, open bells,
  thin joints, raceways and roll markings replace the primitive stack.
- Fin roots intersect the hull; Heavy's five bells have clearance and five opaque
  jets. Every stage has explicit nozzle positions for exhaust placement.
- `setRocketStage` transfers the original lower-stage group into debrisGroup.
  Upper geometry and local position persist. Debris translation and spin come
  from the existing physics state; reduced motion freezes visual spin only.
- STACK-added stages extend upward successively with tapered diameters. Camera
  focus uses the retained assembly's center; PAD fits each vehicle's height.
- Service bridges have gantry support brackets and swing clear after commit.
  Tracking dishes have pedestal mounts and feeds. A tanker and venting vapor
  add human-scale context. Photo mode freezes moving scenery.
- Rebuilds reunite stage groups before resource disposal and clear the old exhaust
  reference, preventing double disposal of effects after stage changes/reset.

Verified: 57 unit/contract tests; Chrome model integration for all three presets,
STACK stage addition, persistent upper geometry, real detached hardware, five
Heavy plumes and all mobile silhouettes. Full flight and photo integrations pass.
Physics and audio files remain unchanged.
