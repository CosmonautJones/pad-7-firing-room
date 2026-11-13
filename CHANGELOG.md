# Changelog

Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The version shows on the desk as **REV** under the PAD-7 mark; `node test/run.js` fails if it and the newest entry here disagree.

## [0.1.0] - 2026-11-13

- First numbered release. The desk shows REV 0.1.0 under the PAD-7 mark so you can tell which build is running.

## 2026-09-05

- Optical window: PBR stack and pad, generated Earth, atmosphere limb, additive plume, VIEW cameras (SITE not TRACK).
- Desk: one CLOCK after liftoff, warp hidden on HOLD, larger optical on short windows, AUDIO OFF mark.
- `audio.js` extracted; thicker engine (sub rumble, hiss, MECO cutoff, countdown tick). Injected `AudioContext` for tests.
- Docs: ADRs 0001–0005, architecture map, MIT license, `node test/run.js` (39 tests).

## Earlier

- 2D Earth-centered physics, RANGE autopilot into bound LEO, Sparrow sounding success path.
- Vendored Three.js r160 in the optical window with 2D fallback.
