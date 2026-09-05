"use strict";

const assert = require("assert");
const path = require("path");
const physicsPath = path.join(__dirname, "..", "physics.js");

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

function almost(actual, expected, tol, label) {
  const delta = Math.abs(actual - expected);
  assert.ok(
    delta <= tol,
    (label || "value") + " expected " + expected + " ± " + tol + ", got " + actual
  );
}

let P;
try {
  P = require(physicsPath);
} catch (err) {
  console.error("FAIL  physics module could not be loaded: " + err.message);
  process.exit(1);
}

const vehicle = P.defaultVehicle();

test("surface gravity is about 9.81 m/s²", () => {
  const g = P.gravityAccel(0, P.EARTH_RADIUS, P.MU);
  const mag = Math.hypot(g.ax, g.ay);
  almost(mag, 9.81, 0.05, "g");
});

test("gravity points toward Earth's center", () => {
  const g = P.gravityAccel(3000, 4000, P.MU);
  const posDot = 3000 * g.ax + 4000 * g.ay;
  assert.ok(posDot < 0, "gravity should oppose the position vector, got " + posDot);
});

test("sea-level air density is about 1.225 kg/m³", () => {
  almost(P.atmosphericDensity(0), 1.225, 0.01, "rho0");
});

test("air density is near zero above the cutoff", () => {
  almost(P.atmosphericDensity(120000), 0, 1e-6, "rho high");
});

test("drag opposes velocity and is zero in vacuum", () => {
  const vac = P.dragAccel(100, 50, 0, 0.5, 3.14, 10000);
  almost(vac.ax, 0, 1e-12, "vac ax");
  almost(vac.ay, 0, 1e-12, "vac ay");

  const atmo = P.dragAccel(100, 0, 1.225, 0.5, 3.14, 10000);
  assert.ok(atmo.ax < 0, "drag should oppose +x velocity");
  almost(atmo.ay, 0, 1e-9, "no y velocity means no y drag");
});

test("current mass is dry + remaining fuel + upper stages + payload", () => {
  const state = P.createState(vehicle);
  const expected =
    vehicle.payloadKg +
    vehicle.stages.reduce((sum, stage) => sum + stage.wetKg, 0);
  almost(P.currentMass(state), expected, 0.01, "pad mass");
});

test("burning fuel reduces mass and consumes propellant", () => {
  const state = P.createState(vehicle);
  state.ignited = true;
  state.throttle = 1;
  const mass0 = P.currentMass(state);
  const fuel0 = state.fuelKg[0];
  P.step(state, 1);
  assert.ok(P.currentMass(state) < mass0, "mass should fall");
  assert.ok(state.fuelKg[0] < fuel0, "fuel should burn");
});

test("empty tanks produce no thrust", () => {
  const state = P.createState(vehicle);
  state.ignited = true;
  state.throttle = 1;
  state.fuelKg = vehicle.stages.map(() => 0);
  const before = { vx: state.vx, vy: state.vy };
  P.step(state, 0.1);
  // Gravity still acts, but there should be no extra upward kick from thrust.
  const g = P.gravityAccel(state.x, state.y, state.mu);
  almost(state.vx, before.vx + g.ax * 0.1, 0.05, "vx without thrust");
});

test("staging drops the spent stage mass", () => {
  const state = P.createState(vehicle);
  state.fuelKg[0] = 0;
  const massBefore = P.currentMass(state);
  const ok = P.stage(state);
  assert.equal(ok, true);
  assert.equal(state.stage, 1);
  assert.ok(P.currentMass(state) < massBefore - 500, "booster dry mass should be gone");
});

test("cannot stage past the last stage", () => {
  const state = P.createState(vehicle);
  state.stage = vehicle.stages.length - 1;
  assert.equal(P.stage(state), false);
  assert.equal(state.stage, vehicle.stages.length - 1);
});

test("circular orbit at 200 km is classified as orbit", () => {
  const state = P.createState(vehicle);
  const r = P.EARTH_RADIUS + 200000;
  const v = Math.sqrt(P.MU / r);
  state.x = 0;
  state.y = r;
  state.vx = v;
  state.vy = 0;
  state.ignited = true;
  const el = P.orbitalElements(state);
  almost(el.eccentricity, 0, 0.002, "ecc");
  almost(el.periapsisAltitude, 200000, 500, "peri alt");
  almost(el.apoapsisAltitude, 200000, 500, "apo alt");
  assert.equal(P.classifyFlight(state), "orbit");
});

test("a pad-sitting vehicle is classified as pad", () => {
  const state = P.createState(vehicle);
  assert.equal(P.classifyFlight(state), "pad");
});

test("impacting the surface marks a crash", () => {
  const state = P.createState(vehicle);
  state.x = 0;
  state.y = P.EARTH_RADIUS - 10;
  state.vy = -100;
  P.step(state, 0.05);
  assert.equal(state.crashed, true);
  assert.equal(P.classifyFlight(state), "crashed");
});

test("stage delta-v matches the rocket equation", () => {
  const stage = vehicle.stages[0];
  const ve = stage.ispSec * P.G0;
  const expected = ve * Math.log(stage.wetKg / stage.dryKg);
  almost(P.stageDeltaV(stage), expected, 1, "dV");
});

test("higher Isp burns less fuel for the same impulse", () => {
  const low = P.createState(
    P.buildVehicle({
      payloadKg: 100,
      stages: [{ name: "A", thrustN: 20000, ispSec: 200, wetKg: 2000, dryKg: 400, cd: 0.3, areaM2: 1 }],
    })
  );
  const high = P.createState(
    P.buildVehicle({
      payloadKg: 100,
      stages: [{ name: "B", thrustN: 20000, ispSec: 400, wetKg: 2000, dryKg: 400, cd: 0.3, areaM2: 1 }],
    })
  );
  low.ignited = true;
  high.ignited = true;
  low.throttle = 1;
  high.throttle = 1;
  P.step(low, 2);
  P.step(high, 2);
  assert.ok(
    high.fuelKg[0] > low.fuelKg[0],
    "higher Isp should leave more fuel, " + high.fuelKg[0] + " vs " + low.fuelKg[0]
  );
});

test("fidelity RANGE only exposes arcade controls", () => {
  const keys = P.visibleControls("RANGE").map((c) => c.key);
  assert.deepEqual(keys, ["throttle", "guidance", "timeWarp"]);
});

test("fidelity PILOT adds pitch and staging", () => {
  const keys = P.visibleControls("PILOT").map((c) => c.key);
  assert.ok(keys.includes("pitch"));
  assert.ok(keys.includes("stage"));
  assert.ok(keys.includes("throttle"));
});

test("fidelity PROP adds engine and aero variables", () => {
  const keys = P.visibleControls("PROP").map((c) => c.key);
  ["isp", "thrust", "wetMass", "dryMass", "cd"].forEach((key) => {
    assert.ok(keys.includes(key), "missing " + key);
  });
});

test("fidelity STACK adds stack and planet variables", () => {
  const keys = P.visibleControls("STACK").map((c) => c.key);
  ["payload", "stageCount", "planetRadius", "mu", "atmScale"].forEach((key) => {
    assert.ok(keys.includes(key), "missing " + key);
  });
});

test("guidance pitch program starts vertical then leans downrange", () => {
  const pad = P.guidancePitch(0, 0, 0, Math.PI / 2);
  almost(pad, Math.PI / 2, 0.01, "pad pitch");
  const lean = P.guidancePitch(4000, 200, 40, Math.PI / 2);
  assert.ok(lean < Math.PI / 2, "should pitch over");
  assert.ok(lean > Math.PI / 4, "should not be horizontal yet at 4 km");
});

test("a ballistic loft returns below 100 km without circularizing", () => {
  const state = P.createState(vehicle);
  state.x = 0;
  state.y = P.EARTH_RADIUS + 1000;
  state.vy = 1200;
  for (let i = 0; i < 400; i += 1) {
    P.step(state, 0.5);
    if (state.crashed) break;
  }
  const el = P.orbitalElements(state);
  assert.ok(el.periapsisAltitude < 0 || state.crashed, "ballistic loft should not stay up");
});

test("sparrow sounding crosses 100 km then falls back", () => {
  const state = P.createState(P.soundingVehicle());
  state.ignited = true;
  let maxAlt = 0;
  for (let i = 0; i < 20000; i += 1) {
    P.step(state, 0.25, P.rangeAutopilot(state));
    const alt = P.altitude(state);
    if (alt > maxAlt) maxAlt = alt;
    if (state.crashed) break;
  }
  assert.ok(maxAlt > 120000, "karman " + maxAlt);
  assert.ok(state.crashed || P.orbitalElements(state).periapsisAltitude < 0, "should come down");
  assert.notEqual(P.classifyFlight(state), "orbit");
});

test("range autopilot circularizes Kestrel I into bound LEO", () => {
  const state = P.createState(P.defaultVehicle());
  state.ignited = true;
  for (let i = 0; i < 28000; i += 1) {
    const input = P.rangeAutopilot(state);
    P.step(state, 0.25, input);
    if (state.crashed) break;
    if (P.classifyFlight(state) === "orbit") break;
  }
  assert.equal(P.classifyFlight(state), "orbit");
  const el = P.orbitalElements(state);
  assert.ok(el.periapsisAltitude > 100000, "peri " + el.periapsisAltitude);
  assert.ok(el.apoapsisAltitude < 400000, "apo " + el.apoapsisAltitude);
  assert.equal(state.stage, 1, "upper stage should still be attached");
  const upperFuel0 = P.defaultVehicle().stages[1].wetKg - P.defaultVehicle().stages[1].dryKg;
  assert.ok(
    state.fuelKg[1] < upperFuel0 * 0.5,
    "upper should burn through circularization, leftover " + state.fuelKg[1]
  );
  assert.ok(
    state.fuelKg[1] > 40,
    "do not dump the upper dry to force a low apo, leftover " + state.fuelKg[1]
  );
});

test("dynamic pressure is 1/2 rho v^2", () => {
  almost(P.dynamicPressure(100, 1.225), 0.5 * 1.225 * 10000, 0.01, "q");
});

test("mach is speed over local speed of sound", () => {
  const a = P.soundSpeed(0);
  almost(a, 340, 15, "sea-level a");
  almost(P.mach(a, 0), 1, 0.05, "mach 1");
});

test("staging leaves a debris body at the old stage", () => {
  const state = P.createState(vehicle);
  state.x = 1000;
  state.y = P.EARTH_RADIUS + 40000;
  state.vx = 800;
  state.vy = 400;
  P.stage(state);
  assert.equal(state.debris.length, 1);
  almost(state.debris[0].x, 1000, 0.01, "debris x");
  almost(state.debris[0].vx, 800, 0.01, "debris vx");
});

test("ascent records a max-q event", () => {
  const state = P.createState(P.defaultVehicle());
  state.ignited = true;
  for (let i = 0; i < 8000; i += 1) {
    P.step(state, 0.25, P.rangeAutopilot(state));
    if (state.events.some((e) => e.kind === "maxq")) break;
    if (state.crashed) break;
  }
  assert.ok(
    state.events.some((e) => e.kind === "maxq"),
    "expected maxq, events=" + state.events.map((e) => e.kind).join(",")
  );
  assert.ok(state.qMax > 10000, "qMax " + state.qMax);
});

test("orbitPoints of a circular orbit sit near the flight radius", () => {
  const state = P.createState(vehicle);
  const r = P.EARTH_RADIUS + 200000;
  const v = Math.sqrt(P.MU / r);
  state.x = 0;
  state.y = r;
  state.vx = v;
  state.vy = 0;
  const pts = P.orbitPoints(state, 36);
  assert.equal(pts.length, 36);
  pts.forEach((p) => {
    almost(Math.hypot(p.x, p.y), r, 800, "orbit r");
  });
});

console.log("");
console.log(passed + " passed, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
