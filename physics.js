"use strict";

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.Pad7Physics = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  var EARTH_RADIUS = 6371000;
  var MU = 3.986004418e14;
  var G0 = 9.80665;
  var ATM_SCALE_HEIGHT = 8500;
  var ATM_DENSITY_SL = 1.225;
  var ATM_CUTOFF = 100000;

  var CONTROL_LAYERS = {
    RANGE: [
      { key: "throttle", label: "Throttle" },
      { key: "guidance", label: "Pitch program" },
      { key: "timeWarp", label: "Range clock rate" },
    ],
    PILOT: [
      { key: "throttle", label: "Throttle" },
      { key: "guidance", label: "Pitch program" },
      { key: "timeWarp", label: "Range clock rate" },
      { key: "pitch", label: "Pitch" },
      { key: "stage", label: "Stage" },
    ],
    PROP: [
      { key: "throttle", label: "Throttle" },
      { key: "guidance", label: "Pitch program" },
      { key: "timeWarp", label: "Range clock rate" },
      { key: "pitch", label: "Pitch" },
      { key: "stage", label: "Stage" },
      { key: "isp", label: "Specific impulse" },
      { key: "thrust", label: "Sea-level thrust" },
      { key: "wetMass", label: "Stage wet mass" },
      { key: "dryMass", label: "Stage dry mass" },
      { key: "cd", label: "Drag coefficient" },
    ],
    STACK: [
      { key: "throttle", label: "Throttle" },
      { key: "guidance", label: "Pitch program" },
      { key: "timeWarp", label: "Range clock rate" },
      { key: "pitch", label: "Pitch" },
      { key: "stage", label: "Stage" },
      { key: "isp", label: "Specific impulse" },
      { key: "thrust", label: "Sea-level thrust" },
      { key: "wetMass", label: "Stage wet mass" },
      { key: "dryMass", label: "Stage dry mass" },
      { key: "cd", label: "Drag coefficient" },
      { key: "payload", label: "Payload" },
      { key: "stageCount", label: "Stage count" },
      { key: "planetRadius", label: "Planet radius" },
      { key: "mu", label: "Gravitational parameter" },
      { key: "atmScale", label: "Atmosphere scale height" },
    ],
  };

  function cloneStage(stage) {
    return {
      name: stage.name,
      thrustN: stage.thrustN,
      ispSec: stage.ispSec,
      wetKg: stage.wetKg,
      dryKg: stage.dryKg,
      cd: stage.cd,
      areaM2: stage.areaM2,
    };
  }

  function buildVehicle(config) {
    var stages = (config.stages || []).map(cloneStage);
    if (!stages.length) {
      throw new Error("vehicle needs at least one stage");
    }
    return {
      name: config.name || "Stack",
      payloadKg: config.payloadKg || 0,
      stages: stages,
    };
  }

  function defaultVehicle() {
    return buildVehicle({
      name: "Kestrel I",
      payloadKg: 280,
      stages: [
        {
          name: "Booster",
          thrustN: 540000,
          ispSec: 285,
          wetKg: 24800,
          dryKg: 2100,
          cd: 0.45,
          areaM2: 1.13,
        },
        {
          name: "Upper",
          thrustN: 33000,
          ispSec: 333,
          wetKg: 2600,
          dryKg: 240,
          cd: 0.35,
          areaM2: 0.64,
        },
      ],
    });
  }

  function soundingVehicle() {
    return buildVehicle({
      name: "Sparrow sounding",
      payloadKg: 40,
      stages: [
        {
          name: "Motor",
          thrustN: 48000,
          ispSec: 230,
          wetKg: 900,
          dryKg: 180,
          cd: 0.4,
          areaM2: 0.2,
        },
      ],
    });
  }

  function heavyVehicle() {
    return buildVehicle({
      name: "Pad-7 Heavy",
      payloadKg: 4200,
      stages: [
        {
          name: "Core",
          thrustN: 7600000,
          ispSec: 282,
          wetKg: 420000,
          dryKg: 25600,
          cd: 0.5,
          areaM2: 10.5,
        },
        {
          name: "Vacuum",
          thrustN: 930000,
          ispSec: 348,
          wetKg: 111000,
          dryKg: 4500,
          cd: 0.4,
          areaM2: 8.0,
        },
      ],
    });
  }

  function gravityAccel(x, y, mu) {
    var r2 = x * x + y * y;
    var r = Math.sqrt(r2);
    if (r < 1) {
      return { ax: 0, ay: 0 };
    }
    var mag = (mu || MU) / r2;
    return { ax: (-mag * x) / r, ay: (-mag * y) / r };
  }

  function atmosphericDensity(altitude, scale, rho0, cutoff) {
    if (altitude < 0) altitude = 0;
    var cut = cutoff == null ? ATM_CUTOFF : cutoff;
    if (altitude >= cut) return 0;
    var h = scale == null ? ATM_SCALE_HEIGHT : scale;
    var rho = rho0 == null ? ATM_DENSITY_SL : rho0;
    return rho * Math.exp(-altitude / h);
  }

  function dragAccel(vx, vy, density, cd, area, mass) {
    if (density <= 0 || mass <= 0) return { ax: 0, ay: 0 };
    var speed = Math.hypot(vx, vy);
    if (speed < 1e-9) return { ax: 0, ay: 0 };
    var force = 0.5 * density * speed * speed * cd * area;
    var ax = (-force * vx) / speed / mass;
    var ay = (-force * vy) / speed / mass;
    return { ax: ax, ay: ay };
  }

  function stageDeltaV(stage) {
    if (stage.dryKg <= 0 || stage.wetKg <= stage.dryKg) return 0;
    return stage.ispSec * G0 * Math.log(stage.wetKg / stage.dryKg);
  }

  function soundSpeed(altitude) {
    var alt = Math.max(0, altitude || 0);
    var T = Math.max(180, 288.15 - 0.0065 * Math.min(alt, 11000));
    return Math.sqrt(1.4 * 287.05 * T);
  }

  function dynamicPressure(speed, density) {
    return 0.5 * density * speed * speed;
  }

  function mach(speed, altitude) {
    var a = soundSpeed(altitude);
    if (a < 1e-6) return 0;
    return speed / a;
  }

  function createState(vehicle, opts) {
    opts = opts || {};
    var planetRadius = opts.planetRadius == null ? EARTH_RADIUS : opts.planetRadius;
    return {
      t: 0,
      x: 0,
      y: planetRadius + 1.2,
      vx: 0,
      vy: 0,
      theta: Math.PI / 2,
      fuelKg: vehicle.stages.map(function (s) {
        return Math.max(0, s.wetKg - s.dryKg);
      }),
      stage: 0,
      throttle: 0,
      ignited: false,
      crashed: false,
      planetRadius: planetRadius,
      mu: opts.mu == null ? MU : opts.mu,
      atmScale: opts.atmScale == null ? ATM_SCALE_HEIGHT : opts.atmScale,
      atmRho0: opts.atmRho0 == null ? ATM_DENSITY_SL : opts.atmRho0,
      atmCutoff: opts.atmCutoff == null ? ATM_CUTOFF : opts.atmCutoff,
      vehicle: vehicle,
      events: [],
      debris: [],
      q: 0,
      qMax: 0,
      mach: 0,
      maxQPassed: false,
      circularizing: false,
    };
  }

  function currentMass(state) {
    var mass = state.vehicle.payloadKg;
    var stages = state.vehicle.stages;
    for (var i = state.stage; i < stages.length; i += 1) {
      mass += stages[i].dryKg + state.fuelKg[i];
    }
    return mass;
  }

  function altitude(state) {
    return Math.hypot(state.x, state.y) - state.planetRadius;
  }

  function radius(state) {
    return Math.hypot(state.x, state.y);
  }

  function activeStage(state) {
    return state.vehicle.stages[state.stage];
  }

  function stage(state) {
    if (state.crashed) return false;
    if (state.stage >= state.vehicle.stages.length - 1) return false;
    if (!state.debris) state.debris = [];
    state.debris.push({
      x: state.x,
      y: state.y,
      vx: state.vx - Math.cos(state.theta) * 12,
      vy: state.vy - Math.sin(state.theta) * 12,
      theta: state.theta,
      omega: 0.55,
      age: 0,
      kind: "stage",
    });
    state.stage += 1;
    state.events.push({ t: state.t, kind: "stage", stage: state.stage });
    return true;
  }

  function orbitalElements(state) {
    var r = radius(state);
    var vx = state.vx;
    var vy = state.vy;
    var speed2 = vx * vx + vy * vy;
    var mu = state.mu;
    var energy = speed2 / 2 - mu / r;
    var a = Math.abs(energy) > 1e-12 ? -mu / (2 * energy) : Infinity;
    var hx = 0;
    var hy = 0;
    var hz = state.x * vy - state.y * vx;
    var ex = (vy * hz) / mu - state.x / r;
    var ey = (-vx * hz) / mu - state.y / r;
    var e = Math.hypot(ex, ey);
    var periR;
    var apoR;
    if (!isFinite(a) || a <= 0) {
      periR = a > 0 ? a * (1 - e) : r;
      apoR = Infinity;
    } else {
      periR = a * (1 - e);
      apoR = a * (1 + e);
    }
    return {
      radius: r,
      speed: Math.sqrt(speed2),
      semiMajor: a,
      eccentricity: e,
      periapsisRadius: periR,
      apoapsisRadius: apoR,
      periapsisAltitude: periR - state.planetRadius,
      apoapsisAltitude: isFinite(apoR) ? apoR - state.planetRadius : Infinity,
      energy: energy,
      flightPath: Math.atan2(state.x * vx + state.y * vy, hz),
    };
  }

  function classifyFlight(state) {
    if (state.crashed) return "crashed";
    var alt = altitude(state);
    var el = orbitalElements(state);
    if (el.eccentricity >= 1 && el.energy > 0) return "escape";
    if (el.eccentricity < 1 && el.periapsisAltitude > state.atmCutoff) return "orbit";
    if (!state.ignited && alt < 20) return "pad";
    if (state.ignited && state.throttle > 0.01 && state.fuelKg[state.stage] > 0.1) return "powered";
    if (alt > state.atmCutoff) return "coast";
    if (el.speed > 100 && alt < state.atmCutoff) return "reentry";
    if (alt > 20) return "ascent";
    return "pad";
  }

  function guidancePitch(alt, vx, vy, current) {
    if (alt < 250) return Math.PI / 2;
    if (alt < 12000) {
      var frac = (alt - 250) / 11750;
      return Math.PI / 2 - frac * (Math.PI / 2 - 0.17);
    }
    var speed = Math.hypot(vx, vy);
    if (speed < 40) return current;
    var velPitch = Math.atan2(vy, vx);
    if (velPitch < 0) velPitch += Math.PI * 2;
    return velPitch;
  }

  function rangeAutopilot(state) {
    var input = {
      ignite: true,
      throttle: 1,
      guidance: true,
      stageNow: false,
    };
    if (state.crashed) {
      input.throttle = 0;
      return input;
    }
    if (state.fuelKg[state.stage] < 0.5 && state.stage < state.vehicle.stages.length - 1) {
      input.stageNow = true;
    }
    var flight = classifyFlight(state);
    if (flight === "orbit" || flight === "escape") {
      input.throttle = 0;
      input.guidance = false;
      return input;
    }
    if (state.vehicle.stages.length === 1) {
      var salt = altitude(state);
      input.guidance = false;
      if (salt < 400) input.theta = Math.PI / 2;
      else if (salt < 28000) input.theta = Math.PI / 2 - ((salt - 400) / 27600) * 0.22;
      else {
        var ssp = Math.hypot(state.vx, state.vy);
        input.theta = ssp > 40 ? Math.atan2(state.vy, state.vx) : state.theta;
      }
      if (state.fuelKg[state.stage] < 0.5) input.throttle = 0;
      return input;
    }
    var el = orbitalElements(state);
    var alt = altitude(state);
    var r = Math.max(radius(state), 1);
    var radial = (state.x * state.vx + state.y * state.vy) / r;
    var upper = state.stage > 0 || state.vehicle.stages.length === 1;
    var apo = el.apoapsisAltitude;
    var peri = el.periapsisAltitude;
    if (peri > state.atmCutoff + 15000) {
      input.throttle = 0;
      return input;
    }
    if (upper) {
      var nearApo =
        alt > 80000 &&
        isFinite(apo) &&
        apo > 140000 &&
        radial < 80 &&
        alt > apo - 25000;
      if (nearApo && peri < state.atmCutoff + 15000) {
        input.guidance = false;
        input.theta = Math.atan2(state.vy, state.vx);
        input.throttle = 1;
        return input;
      }
      if (isFinite(apo) && apo > 180000 && radial > 0 && alt < apo - 30000 && alt > 70000) {
        input.throttle = 0;
        return input;
      }
    }
    return input;
  }

  function orbitPoints(state, n) {
    n = n || 64;
    var el = orbitalElements(state);
    if (!isFinite(el.semiMajor) || el.semiMajor <= 0 || el.eccentricity >= 0.98) return [];
    var r = Math.max(radius(state), 1);
    var hz = state.x * state.vy - state.y * state.vx;
    var ex = (state.vy * hz) / state.mu - state.x / r;
    var ey = (-state.vx * hz) / state.mu - state.y / r;
    var arg = Math.atan2(ey, ex);
    var a = el.semiMajor;
    var e = el.eccentricity;
    var pts = [];
    for (var i = 0; i < n; i += 1) {
      var nu = (i / n) * Math.PI * 2;
      var rad = (a * (1 - e * e)) / (1 + e * Math.cos(nu));
      if (rad <= 0 || !isFinite(rad)) continue;
      pts.push({
        x: rad * Math.cos(arg + nu),
        y: rad * Math.sin(arg + nu),
      });
    }
    return pts;
  }

  function visibleControls(fidelity) {
    return (CONTROL_LAYERS[fidelity] || CONTROL_LAYERS.RANGE).slice();
  }

  function step(state, dt, input) {
    if (state.crashed) return state;
    input = input || {};
    if (typeof input.throttle === "number") {
      state.throttle = Math.max(0, Math.min(1, input.throttle));
    }
    if (input.ignite) state.ignited = true;
    if (input.stageNow) stage(state);

    var stg = activeStage(state);
    var mass = currentMass(state);
    var alt = altitude(state);

    if (input.guidance) {
      state.theta = guidancePitch(alt, state.vx, state.vy, state.theta);
    } else if (typeof input.pitchRate === "number") {
      state.theta += input.pitchRate * dt;
    }
    if (typeof input.theta === "number") state.theta = input.theta;

    var g = gravityAccel(state.x, state.y, state.mu);
    var rho = atmosphericDensity(alt, state.atmScale, state.atmRho0, state.atmCutoff);
    var drag = dragAccel(state.vx, state.vy, rho, stg.cd, stg.areaM2, mass);

    var ax = g.ax + drag.ax;
    var ay = g.ay + drag.ay;

    var thrusting =
      state.ignited && state.throttle > 0 && state.fuelKg[state.stage] > 0 && mass > 0;
    if (thrusting) {
      var thrust = stg.thrustN * state.throttle;
      ax += (Math.cos(state.theta) * thrust) / mass;
      ay += (Math.sin(state.theta) * thrust) / mass;
      var mdot = thrust / (stg.ispSec * G0);
      var burned = mdot * dt;
      if (burned > state.fuelKg[state.stage]) burned = state.fuelKg[state.stage];
      state.fuelKg[state.stage] -= burned;
    }

    state.vx += ax * dt;
    state.vy += ay * dt;
    state.x += state.vx * dt;
    state.y += state.vy * dt;
    state.t += dt;

    var speed = Math.hypot(state.vx, state.vy);
    var rhoNow = atmosphericDensity(altitude(state), state.atmScale, state.atmRho0, state.atmCutoff);
    state.q = dynamicPressure(speed, rhoNow);
    if (state.q > state.qMax) state.qMax = state.q;
    state.mach = mach(speed, altitude(state));
    if (
      !state.maxQPassed &&
      state.qMax > 12000 &&
      state.q < state.qMax * 0.9 &&
      altitude(state) > 7000
    ) {
      state.maxQPassed = true;
      state.events.push({ t: state.t, kind: "maxq", q: state.qMax });
    }

    if (state.debris && state.debris.length) {
      for (var d = 0; d < state.debris.length; d += 1) {
        var piece = state.debris[d];
        var dg = gravityAccel(piece.x, piece.y, state.mu);
        piece.vx += dg.ax * dt;
        piece.vy += dg.ay * dt;
        piece.x += piece.vx * dt;
        piece.y += piece.vy * dt;
        piece.theta += piece.omega * dt;
        piece.age += dt;
      }
    }

    if (radius(state) <= state.planetRadius) {
      var r = radius(state);
      if (r < 1) r = 1;
      state.x = (state.x / r) * state.planetRadius;
      state.y = (state.y / r) * state.planetRadius;
      state.vx = 0;
      state.vy = 0;
      state.crashed = true;
      state.throttle = 0;
      state.events.push({ t: state.t, kind: "impact" });
    }
    return state;
  }

  function stackDeltaV(vehicle) {
    var total = 0;
    var upperWet = vehicle.payloadKg;
    for (var i = vehicle.stages.length - 1; i >= 0; i -= 1) {
      var s = vehicle.stages[i];
      var wet = s.wetKg + upperWet;
      var dry = s.dryKg + upperWet;
      total += s.ispSec * G0 * Math.log(wet / dry);
      upperWet += s.wetKg;
    }
    return total;
  }

  function twr(state) {
    var mass = currentMass(state);
    if (mass <= 0) return 0;
    var stg = activeStage(state);
    var thrust = state.ignited ? stg.thrustN * state.throttle : stg.thrustN;
    var g = Math.hypot(
      gravityAccel(state.x, state.y, state.mu).ax,
      gravityAccel(state.x, state.y, state.mu).ay
    );
    return thrust / (mass * g);
  }

  return {
    EARTH_RADIUS: EARTH_RADIUS,
    MU: MU,
    G0: G0,
    ATM_SCALE_HEIGHT: ATM_SCALE_HEIGHT,
    ATM_DENSITY_SL: ATM_DENSITY_SL,
    ATM_CUTOFF: ATM_CUTOFF,
    CONTROL_LAYERS: CONTROL_LAYERS,
    buildVehicle: buildVehicle,
    defaultVehicle: defaultVehicle,
    soundingVehicle: soundingVehicle,
    heavyVehicle: heavyVehicle,
    gravityAccel: gravityAccel,
    atmosphericDensity: atmosphericDensity,
    dragAccel: dragAccel,
    stageDeltaV: stageDeltaV,
    stackDeltaV: stackDeltaV,
    createState: createState,
    currentMass: currentMass,
    altitude: altitude,
    radius: radius,
    stage: stage,
    step: step,
    orbitalElements: orbitalElements,
    classifyFlight: classifyFlight,
    guidancePitch: guidancePitch,
    rangeAutopilot: rangeAutopilot,
    orbitPoints: orbitPoints,
    soundSpeed: soundSpeed,
    dynamicPressure: dynamicPressure,
    mach: mach,
    visibleControls: visibleControls,
    twr: twr,
    activeStage: activeStage,
  };
});
