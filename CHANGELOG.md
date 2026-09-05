# Changelog

## 2026-09-05

- Optical window: PBR stack and pad, generated Earth, atmosphere limb, additive plume, VIEW cameras (SITE not TRACK).
- Desk: one CLOCK after liftoff, warp hidden on HOLD, larger optical on short windows, AUDIO OFF mark.
- `audio.js` extracted; thicker engine (sub rumble, hiss, MECO cutoff, countdown tick). Injected `AudioContext` for tests.
- Docs: ADRs 0001–0005, architecture map, MIT license, `node test/run.js` (39 tests).

## Earlier

- 2D Earth-centered physics, RANGE autopilot into bound LEO, Sparrow sounding success path.
- Vendored Three.js r160 in the optical window with 2D fallback.
