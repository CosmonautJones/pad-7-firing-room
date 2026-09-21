"use strict";

const assert = require("assert");
const Desk = require("../desk.js");

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

test("range clock holds, then counts with a fixed width", () => {
  assert.strictEqual(Desk.formatClock("hold", 0), "HOLD");
  assert.strictEqual(Desk.formatClock("count", -10), "T-00:10.0");
  assert.strictEqual(Desk.formatClock("flight", 65.2), "T+01:05.2");
});

test("altitude and orbit readouts stay blank until they mean something", () => {
  assert.strictEqual(Desk.formatAlt(9), "9 m");
  assert.strictEqual(Desk.formatAlt(12400), "12.4 km");
  assert.strictEqual(Desk.formatAlt(NaN), "—");
  assert.strictEqual(Desk.formatOrbitAlt(-100, 20), "—");
  assert.strictEqual(Desk.formatOrbitAlt(4000, 100), "—");
  assert.strictEqual(Desk.formatOrbitAlt(180000, 120000), "180.0 km");
});

test("key strip names the action instead of crowding abbreviations", () => {
  const hold = Desk.keyHint("hold", "RANGE");
  assert.ok(hold.indexOf("arm countdown") !== -1);
  assert.ok(hold.indexOf("·") !== -1);
  assert.strictEqual(Desk.keyHint("flight", "PILOT").indexOf("W/S throttle") !== -1, true);
});

test("phase line follows the desk and the flight", () => {
  assert.ok(Desk.phaseHint("hold", "RANGE").indexOf("Arm the countdown") === 0);
  assert.ok(Desk.phaseHint("flight", "RANGE", { orbit: true }).indexOf("Orbit") === 0);
  assert.ok(Desk.phaseHint("flight", "RANGE", { crashed: true }).indexOf("Impact") === 0);
});

test("preset id follows the vehicle name", () => {
  assert.strictEqual(Desk.presetId("Kestrel I"), "kestrel");
  assert.strictEqual(Desk.presetId("Sparrow"), "sparrow");
  assert.strictEqual(Desk.presetId("Heavy"), "heavy");
});

test("mosaic lamps use the same thresholds the desk always used", () => {
  const base = {
    ignited: true, throttle: 1, fuel: 200, guidance: true, crashed: false,
    sounding: false, altitude: 10, maxQPassed: false, q: 0, flight: "powered",
    twr: 1.4, phase: "flight",
  };
  assert.strictEqual(Desk.lamps(base).prop, "on");
  assert.strictEqual(Desk.lamps(Object.assign({}, base, { fuel: 0 })).prop, "");
  assert.strictEqual(Desk.lamps(Object.assign({}, base, { fuel: 39 })).fuel, "warn");
  assert.strictEqual(Desk.lamps(Object.assign({}, base, { fuel: 40 })).fuel, "on");
  assert.strictEqual(Desk.lamps(Object.assign({}, base, { altitude: 400 })).track, "");
  assert.strictEqual(Desk.lamps(Object.assign({}, base, { altitude: 401 })).track, "on");
  assert.strictEqual(Desk.lamps(Object.assign({}, base, { q: 15000 })).maxq, "");
  assert.strictEqual(Desk.lamps(Object.assign({}, base, { q: 15001 })).maxq, "warn");
  assert.strictEqual(Desk.lamps(Object.assign({}, base, { maxQPassed: true, q: 0 })).maxq, "on");
  assert.strictEqual(Desk.lamps(Object.assign({}, base, { crashed: true })).range, "bad");
  assert.strictEqual(Desk.lamps(Object.assign({}, base, { crashed: true, sounding: true })).range, "on");
  assert.strictEqual(Desk.lamps(Object.assign({}, base, { flight: "orbit" })).orbit, "on");
  assert.strictEqual(Desk.lampWord("warn"), "CAUTION");
  assert.strictEqual(Desk.lampWord(""), "DARK");
});

test("scope stays on hold until two samples exist", () => {
  const hold = Desk.scopeGeometry([], 200, 80);
  assert.strictEqual(hold.hold, true);
  assert.strictEqual(hold.karmanY, null);
});

test("scope maps downrange and altitude into the bezel, with a Karman line when it fits", () => {
  const low = Desk.scopeGeometry([{ alt: 0, x: 0 }, { alt: 1000, x: 1000 }], 100, 50);
  assert.strictEqual(low.hold, false);
  assert.strictEqual(low.karmanY, null);
  assert.ok(low.points[0].x < low.points[1].x);
  assert.ok(low.points[1].y < low.points[0].y);
  const high = Desk.scopeGeometry([{ alt: 0, x: 0 }, { alt: 200000, x: 400000 }], 100, 50);
  assert.ok(high.karmanY > 8 && high.karmanY < 42);
});

test("hold scope paints HOLD and never the old placeholder sentence", () => {
  const calls = [];
  const ctx = new Proxy({}, {
    get: function (_target, prop) {
      if (prop === "setLineDash" || prop === "setTransform" || prop === "clearRect" || prop === "fillRect" || prop === "beginPath" || prop === "moveTo" || prop === "lineTo" || prop === "stroke") {
        return function () { calls.push(prop); };
      }
      return function () {
        calls.push(["fillText"].indexOf(prop) === 0 ? ["fillText"].concat([].slice.call(arguments)) : prop);
      };
    },
    set: function () { return true; },
  });
  Desk.paintScope(ctx, 200, 80, [], 2);
  const text = calls.filter(function (c) { return Array.isArray(c) && c[0] === "fillText"; }).map(function (c) { return c[1]; });
  assert.ok(text.indexOf("HOLD") !== -1);
  assert.ok(text.every(function (line) { return String(line).indexOf("amber scope") === -1; }));
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
