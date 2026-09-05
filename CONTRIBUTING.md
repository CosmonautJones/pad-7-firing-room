# Contributing

Play it first. Double-click `PAD-7.html`, ARM COUNTDOWN, CLOCK to 25×, get ORBIT or splashdown.

## Rules

1. **Physics is test-first.** If you change `physics.js`, add or extend a case in `test/physics.test.js` and watch it fail before you implement.
2. **Do not reverse the analog desk.** Formica, brass, HOLD clock, mosaic lamps. See [ADR 0002](docs/adr/0002-analog-firing-room.md).
3. **Keep `file://` working.** No `import` in the play path. See [ADR 0001](docs/adr/0001-file-protocol-no-bundler.md).
4. **3D stays in `#sky`.** Desk CSS is not a WebGL HUD.

## Commands

```
node test/run.js
```

## Layout

Change orbital numbers in `physics.js`. Change the window in `optical.js`. Change the graph in `audio.js`. Change copy, lamps, and phase in `PAD-7.html`.
