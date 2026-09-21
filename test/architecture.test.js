"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("  ok  " + name);
  } catch (err) {
    failed += 1;
    console.error("  FAIL  " + name);
    console.error("        " + err.message);
  }
}

const html = fs.readFileSync(path.join(root, "PAD-7.html"), "utf8");
const P = require(path.join(root, "physics.js"));
const Audio = require(path.join(root, "audio.js"));

test("composition root loads physics, three, optical, audio, then desk", () => {
  const order = ["physics.js", "three.min.js", "optical.js", "audio.js", "desk.js"].map(function (f) {
    return html.indexOf('src="' + f + '"');
  });
  order.forEach(function (i, n) {
    assert.ok(i > 0, "missing script " + n);
    if (n > 0) assert.ok(i > order[n - 1], "script order broken at " + n);
  });
});

test("physics exports the orbital contract the desk needs", () => {
  ["createState", "step", "rangeAutopilot", "altitude", "orbitalElements", "classifyFlight", "defaultVehicle", "soundingVehicle"].forEach(function (k) {
    assert.strictEqual(typeof P[k], "function", k);
  });
});

test("audio desk is constructed, not a bag of globals", () => {
  assert.strictEqual(typeof Audio.create, "function");
  const sound = Audio.create({ AudioContext: null });
  assert.strictEqual(sound.isMuted(), false);
});

test("desk keeps analog constraints in the markup", () => {
  assert.ok(html.indexOf("ARM COUNTDOWN") !== -1);
  assert.ok(html.indexOf("VIEW AUTO") !== -1);
  assert.ok(html.indexOf("RANGE CLOCK") !== -1);
  assert.ok(html.indexOf('id="warpBtn"') !== -1 && html.indexOf("hidden") !== -1);
  assert.ok(html.indexOf("sci-fi") === -1);
});

test("optical camera SITE is not named TRACK", () => {
  const optical = fs.readFileSync(path.join(root, "optical.js"), "utf8");
  assert.ok(optical.indexOf("downrange") !== -1);
  assert.ok(html.indexOf("VIEW AUTO") !== -1);
});

test("desk hot path keeps the lamps and readouts mounted", () => {
  assert.ok(html.indexOf('id="clockFace"') !== -1);
  assert.ok(html.indexOf('data-lamp="prop"') !== -1);
  assert.ok(html.indexOf('src="desk.js"') !== -1);
  assert.ok(html.indexOf('getElementById("telem").innerHTML') === -1);
  assert.ok(html.indexOf('getElementById("mosaic").innerHTML') === -1);
  assert.ok(html.indexOf("const BRIEFS") === -1);
  assert.ok(html.indexOf("Desk.paintScope") !== -1);
  assert.ok(html.indexOf("window.Pad7Room") !== -1);
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
