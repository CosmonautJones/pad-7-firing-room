"use strict";

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.Pad7Desk = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  var KARMAN_M = 100000;
  var SCOPE_PAD = 8;
  var SCOPE_TOP = 18;

  function formatClock(phase, t) {
    if (phase === "hold") return "HOLD";
    var sign = t < 0 ? "T-" : "T+";
    var s = Math.abs(t);
    var m = Math.floor(s / 60);
    var sec = s - m * 60;
    return sign + String(m).padStart(2, "0") + ":" + sec.toFixed(1).padStart(4, "0");
  }

  function formatAlt(m) {
    if (!isFinite(m)) return "—";
    if (Math.abs(m) >= 1000) return (m / 1000).toFixed(1) + " km";
    return Math.round(m) + " m";
  }

  function formatOrbitAlt(m, altitude) {
    if (!isFinite(m)) return "—";
    if (m < 0 && altitude < 30000) return "—";
    if (altitude < 3000 && Math.abs(m) < 8000) return "—";
    return formatAlt(m);
  }

  function keyHint(phase, fidelity) {
    if (phase === "hold") return "I arm countdown  ·  R reset  ·  1–4 desk  ·  M mute";
    if (phase === "count") return "I commit  ·  / hold count  ·  R reset";
    if (fidelity === "RANGE") return ". faster clock  ·  , slower  ·  C view  ·  / abort  ·  R reset";
    return "W/S throttle  ·  A/D pitch  ·  X stage  ·  . clock  ·  / abort  ·  R reset";
  }

  function phaseHint(phase, fidelity, flags) {
    var desk = {
      RANGE: "Guidance flies the gravity turn and circularizes.",
      PILOT: "You pitch, throttle, and stage.",
      PROP: "Engine and drag numbers are live.",
      STACK: "Change the vehicle or planet, then reset to apply the stack.",
    };
    flags = flags || {};
    if (phase === "hold") return "Arm the countdown. " + (desk[fidelity] || "");
    if (phase === "count") return "Counting. Hold Count stops the clock. Commit skips to ignition.";
    if (flags.crashed) return "Impact. Reset to roll out another stack.";
    if (flags.orbit) return "Orbit. Watch the map, or reset for another attempt.";
    if (flags.sounding) return "Apogee. Sparrow has the data. Splashdown is the recovery.";
    if (fidelity === "RANGE") return "Warp the clock — a real ascent takes about 10 minutes.";
    return desk[fidelity] || "";
  }

  function presetId(name) {
    var n = String(name || "").toLowerCase();
    if (n.indexOf("sparrow") >= 0) return "sparrow";
    if (n.indexOf("heavy") >= 0) return "heavy";
    return "kestrel";
  }

  function lamps(m) {
    var fuel = m.fuel;
    return {
      prop: m.ignited && m.throttle > 0.05 && fuel > 1 ? "on" : "",
      guid: m.guidance ? "on" : "",
      range: m.crashed && !m.sounding ? "bad" : "on",
      track: m.altitude > 400 ? "on" : "",
      maxq: m.maxQPassed ? "on" : (m.q > 15000 ? "warn" : ""),
      fuel: fuel < 40 ? "warn" : "on",
      orbit: m.flight === "orbit" ? "on" : "",
      go: !m.crashed && (m.twr > 1.05 || m.flight === "orbit" || m.phase === "count") ? "on" : "warn",
    };
  }

  function lampWord(state) {
    if (state === "on") return "GREEN";
    if (state === "bad") return "NO-GO";
    if (state === "warn") return "CAUTION";
    return "DARK";
  }

  function scopeGeometry(samples, width, height) {
    if (!samples || samples.length < 2) {
      return { points: [], karmanY: null, hold: true };
    }
    var maxA = 2000;
    var maxX = 2000;
    var i;
    for (i = 0; i < samples.length; i += 1) {
      if (samples[i].alt > maxA) maxA = samples[i].alt;
      var ax = Math.abs(samples[i].x);
      if (ax > maxX) maxX = ax;
    }
    var spanX = Math.max(1, width - SCOPE_PAD * 2);
    var spanY = Math.max(1, height - SCOPE_PAD - SCOPE_TOP);
    var points = [];
    for (i = 0; i < samples.length; i += 1) {
      points.push({
        x: SCOPE_PAD + (Math.abs(samples[i].x) / maxX) * spanX,
        y: height - SCOPE_PAD - (samples[i].alt / maxA) * spanY,
      });
    }
    var karmanY = null;
    if (maxA >= KARMAN_M) karmanY = height - SCOPE_PAD - (KARMAN_M / maxA) * spanY;
    return { points: points, karmanY: karmanY, hold: false, maxA: maxA, maxX: maxX };
  }

  function paintScope(ctx, cssWidth, cssHeight, samples, dpr) {
    var ratio = dpr || 1;
    var geo = scopeGeometry(samples, cssWidth, cssHeight);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = "#1a140c";
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    ctx.strokeStyle = "rgba(196,161,90,0.16)";
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    var stepX = Math.max(16, cssWidth / 8);
    var stepY = Math.max(14, cssHeight / 5);
    var x;
    var y;
    for (x = 0; x <= cssWidth; x += stepX) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, cssHeight);
      ctx.stroke();
    }
    for (y = 0; y <= cssHeight; y += stepY) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(cssWidth, y + 0.5);
      ctx.stroke();
    }
    ctx.font = "11px IBM Plex Mono, monospace";
    if (geo.hold) {
      ctx.strokeStyle = "rgba(232,184,74,0.4)";
      ctx.beginPath();
      ctx.moveTo(SCOPE_PAD, cssHeight - 10);
      ctx.lineTo(cssWidth - SCOPE_PAD, cssHeight - 10);
      ctx.stroke();
      ctx.fillStyle = "#c4a15a";
      ctx.fillText("HOLD", SCOPE_PAD, cssHeight - 16);
      return geo;
    }
    if (geo.karmanY != null) {
      ctx.strokeStyle = "rgba(232,184,74,0.5)";
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(SCOPE_PAD, geo.karmanY);
      ctx.lineTo(cssWidth - SCOPE_PAD, geo.karmanY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#8a7044";
      ctx.font = "10px IBM Plex Mono, monospace";
      ctx.fillText("100 km", cssWidth - 54, Math.max(12, geo.karmanY - 4));
    }
    ctx.strokeStyle = "#e8b84a";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    geo.points.forEach(function (p, index) {
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    var last = geo.points[geo.points.length - 1];
    ctx.fillStyle = "#f3d27a";
    ctx.fillRect(last.x - 1.5, last.y - 1.5, 3, 3);
    return geo;
  }

  return {
    formatClock: formatClock,
    formatAlt: formatAlt,
    formatOrbitAlt: formatOrbitAlt,
    keyHint: keyHint,
    phaseHint: phaseHint,
    presetId: presetId,
    lamps: lamps,
    lampWord: lampWord,
    scopeGeometry: scopeGeometry,
    paintScope: paintScope,
  };
});
