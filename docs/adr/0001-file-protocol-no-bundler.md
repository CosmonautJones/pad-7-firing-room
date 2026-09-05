# ADR 0001 — Double-click `file://`, no bundler

- Status: Accepted
- Date: 2026-09-05
- Evidence: `PAD-7.html` script tags, `Open PAD-7.bat`, absence of `package.json`

## Context

PAD-7 is a desktop toy that should open the way a range document opens: you double-click it. A Node toolchain, local server, or CDN at runtime would make the first minute a setup problem instead of a launch.

## Decision

Ship a static folder. `PAD-7.html` loads `physics.js`, `three.min.js`, `optical.js`, and `audio.js` as classic scripts. No bundler, no npm install to play. GitHub Pages is optional; `file://` is the supported path.

This does **not** decide hosting, analytics, or a future editor build.

## Alternatives considered

- **Vite/webpack app.** Better DX, breaks double-click and `file://` ES modules without extra flags.
- **CDN Three.js as an ES module.** Fails offline and on `file://`.
- **Local static server required.** One extra step for every visitor.

## Consequences

- Classic UMD / IIFE modules, not `import`.
- No EffectComposer addons (they are ES modules). Bloom is additive materials instead.
- Tests run with Node `require` against the same files the browser loads.

## Validation

```
node test/run.js
```

Open `PAD-7.html` from disk. The optical window should render without a server.
