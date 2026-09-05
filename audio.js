"use strict";

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.Pad7Audio = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  function create(opts) {
    opts = opts || {};
    var AC = opts.AudioContext;
    if (AC === undefined && typeof window !== "undefined") {
      AC = window.AudioContext || window.webkitAudioContext;
    }
    var muted = !!opts.muted;
    var ctx = null;
    var nodes = null;
    var lastAmount = 0;

    function live() {
      return !!(ctx && nodes && !muted);
    }

    function build() {
      if (ctx || !AC) return !!ctx;
      try {
        ctx = new AC();
        var master = ctx.createGain();
        master.gain.value = 0.2;
        master.connect(ctx.destination);

        var buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        var data = buf.getChannelData(0);
        var last = 0;
        for (var i = 0; i < data.length; i += 1) {
          last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
          data[i] = last * 4;
        }

        function noiseSrc() {
          var src = ctx.createBufferSource();
          src.buffer = buf;
          src.loop = true;
          src.start();
          return src;
        }

        var engine = ctx.createGain();
        engine.gain.value = 0;
        var filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 180;
        filter.Q.value = 0.7;
        noiseSrc().connect(filter);
        filter.connect(engine);
        engine.connect(master);

        var rumble = ctx.createOscillator();
        rumble.type = "sine";
        rumble.frequency.value = 38;
        var rumbleG = ctx.createGain();
        rumbleG.gain.value = 0;
        rumble.connect(rumbleG);
        rumbleG.connect(master);
        rumble.start();

        var sub = ctx.createOscillator();
        sub.type = "sine";
        sub.frequency.value = 19;
        var subG = ctx.createGain();
        subG.gain.value = 0;
        sub.connect(subG);
        subG.connect(master);
        sub.start();

        var growl = ctx.createOscillator();
        growl.type = "sawtooth";
        growl.frequency.value = 52;
        var growlF = ctx.createBiquadFilter();
        growlF.type = "lowpass";
        growlF.frequency.value = 110;
        var growlG = ctx.createGain();
        growlG.gain.value = 0;
        growl.connect(growlF);
        growlF.connect(growlG);
        growlG.connect(master);
        growl.start();

        var crackleG = ctx.createGain();
        crackleG.gain.value = 0;
        var hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 900;
        noiseSrc().connect(hp);
        hp.connect(crackleG);
        crackleG.connect(master);

        var hissG = ctx.createGain();
        hissG.gain.value = 0;
        var hissF = ctx.createBiquadFilter();
        hissF.type = "bandpass";
        hissF.frequency.value = 2400;
        hissF.Q.value = 0.6;
        noiseSrc().connect(hissF);
        hissF.connect(hissG);
        hissG.connect(master);

        var hum = ctx.createOscillator();
        hum.type = "sine";
        hum.frequency.value = 60;
        var humG = ctx.createGain();
        humG.gain.value = 0.008;
        hum.connect(humG);
        humG.connect(master);
        hum.start();

        nodes = {
          master: master,
          engine: engine,
          filter: filter,
          rumble: rumble,
          rumbleG: rumbleG,
          sub: sub,
          subG: subG,
          growl: growl,
          growlG: growlG,
          crackleG: crackleG,
          hissG: hissG,
          humG: humG,
        };
        if (ctx.state === "suspended" && ctx.resume) ctx.resume();
        return true;
      } catch (err) {
        ctx = null;
        nodes = null;
        return false;
      }
    }

    function tone(type, freq, dur, gain, slide) {
      if (!live()) return;
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = type || "sine";
      o.frequency.value = freq;
      g.gain.value = gain || 0.05;
      o.connect(g);
      g.connect(nodes.master);
      o.start();
      var t1 = ctx.currentTime + (dur || 0.12);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t1);
      g.gain.exponentialRampToValueAtTime(0.0001, t1);
      o.stop(t1 + 0.02);
    }

    function burst(dur, gain, freq) {
      if (!live()) return;
      var src = ctx.createBufferSource();
      var len = Math.max(1, Math.floor(ctx.sampleRate * (dur || 0.08)));
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      src.buffer = buf;
      var f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = freq || 1800;
      var g = ctx.createGain();
      g.gain.value = gain || 0.08;
      src.connect(f);
      f.connect(g);
      g.connect(nodes.master);
      src.start();
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (dur || 0.08));
    }

    return {
      unlock: function () {
        if (muted) return build();
        return build();
      },
      ready: function () {
        return !!(ctx && nodes);
      },
      isMuted: function () {
        return muted;
      },
      setMuted: function (on) {
        muted = !!on;
        if (muted && nodes) {
          var t = ctx.currentTime;
          nodes.engine.gain.setTargetAtTime(0, t, 0.05);
          nodes.rumbleG.gain.setTargetAtTime(0, t, 0.05);
          nodes.subG.gain.setTargetAtTime(0, t, 0.05);
          nodes.growlG.gain.setTargetAtTime(0, t, 0.05);
          nodes.crackleG.gain.setTargetAtTime(0, t, 0.05);
          nodes.hissG.gain.setTargetAtTime(0, t, 0.05);
          nodes.humG.gain.setTargetAtTime(0, t, 0.05);
        } else if (!muted && nodes) {
          nodes.humG.gain.setTargetAtTime(0.008, ctx.currentTime, 0.08);
        }
      },
      setEngine: function (amount, q) {
        amount = Math.max(0, Math.min(1, Number(amount) || 0));
        q = Number(q) || 0;
        if (lastAmount > 0.35 && amount < 0.08) this.cutoff();
        lastAmount = amount;
        if (!live()) return;
        var t = ctx.currentTime;
        var qn = Math.min(1, q / 40000);
        nodes.engine.gain.setTargetAtTime(amount * (0.16 + qn * 0.1), t, 0.08);
        nodes.rumbleG.gain.setTargetAtTime(amount * 0.09, t, 0.08);
        nodes.rumble.frequency.setTargetAtTime(28 + amount * 24 + qn * 10, t, 0.1);
        nodes.subG.gain.setTargetAtTime(amount * 0.05, t, 0.1);
        nodes.sub.frequency.setTargetAtTime(16 + amount * 8, t, 0.12);
        nodes.growlG.gain.setTargetAtTime(amount * 0.032, t, 0.1);
        nodes.growl.frequency.setTargetAtTime(46 + amount * 22, t, 0.12);
        nodes.filter.frequency.setTargetAtTime(150 + amount * 180 + qn * 260, t, 0.08);
        nodes.crackleG.gain.setTargetAtTime(amount * qn * 0.055, t, 0.05);
        nodes.hissG.gain.setTargetAtTime(amount * (0.01 + qn * 0.02), t, 0.08);
      },
      beep: function (freq, dur, gain) {
        if (!build() || muted) return;
        tone("sine", freq || 720, dur || 0.08, gain || 0.05);
      },
      bang: function () {
        if (!build() || muted) return;
        tone("triangle", 96, 0.26, 0.12, 36);
        burst(0.12, 0.07, 220);
      },
      tick: function (shown) {
        if (!build() || muted) return;
        var late = shown <= 3;
        tone("sine", late ? 980 : 720, 0.07, late ? 0.06 : 0.045);
        if (late) burst(0.04, 0.03, 1400);
      },
      cutoff: function () {
        if (!live()) return;
        burst(0.18, 0.05, 900);
        tone("sine", 70, 0.35, 0.04, 28);
      },
      chime: function (notes) {
        if (!build() || muted) return;
        (notes || []).forEach(function (n) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.type = "sine";
          o.frequency.value = n.f;
          g.gain.value = 0.0001;
          o.connect(g);
          g.connect(nodes.master);
          var t0 = ctx.currentTime + (n.t || 0);
          o.start(t0);
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(n.g || 0.055, t0 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + (n.d || 0.22));
          o.stop(t0 + (n.d || 0.22) + 0.03);
        });
      },
    };
  }

  return { create: create };
});
