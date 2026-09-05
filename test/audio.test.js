"use strict";

const assert = require("assert");
const path = require("path");
const audioPath = path.join(__dirname, "..", "audio.js");

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

function mockAudioContext() {
  function param(start) {
    return {
      value: start || 0,
      setTargetAtTime: function (v) { this.value = v; },
      setValueAtTime: function (v) { this.value = v; },
      exponentialRampToValueAtTime: function (v) { this.value = v; },
    };
  }
  function node() {
    return {
      type: "sine",
      frequency: param(0),
      Q: param(0),
      gain: param(0),
      buffer: null,
      loop: false,
      connect: function () { return this; },
      start: function () {},
      stop: function () {},
    };
  }
  return function AudioContext() {
    this.sampleRate = 44100;
    this.currentTime = 0;
    this.destination = {};
    this.state = "suspended";
    this.createGain = node;
    this.createOscillator = node;
    this.createBiquadFilter = node;
    this.createBuffer = function (c, n) {
      return { getChannelData: function () { return new Float32Array(n); } };
    };
    this.createBufferSource = node;
    this.resume = function () {
      this.state = "running";
      return Promise.resolve();
    };
  };
}

let Pad7Audio;
try {
  Pad7Audio = require(audioPath);
} catch (err) {
  console.error("FAIL  audio module could not be loaded: " + err.message);
  process.exit(1);
}

test("create returns an audio desk with mute off", () => {
  const sound = Pad7Audio.create({ AudioContext: mockAudioContext() });
  assert.strictEqual(sound.isMuted(), false);
  assert.strictEqual(typeof sound.unlock, "function");
  assert.strictEqual(typeof sound.setEngine, "function");
  assert.strictEqual(typeof sound.beep, "function");
  assert.strictEqual(typeof sound.bang, "function");
  assert.strictEqual(typeof sound.chime, "function");
  assert.strictEqual(typeof sound.tick, "function");
  assert.strictEqual(typeof sound.cutoff, "function");
});

test("unlock builds the graph on a user gesture", () => {
  const sound = Pad7Audio.create({ AudioContext: mockAudioContext() });
  assert.strictEqual(sound.ready(), false);
  const ok = sound.unlock();
  assert.strictEqual(ok, true);
  assert.strictEqual(sound.ready(), true);
});

test("unlock without AudioContext stays silent instead of throwing", () => {
  const sound = Pad7Audio.create({ AudioContext: null });
  assert.doesNotThrow(function () { sound.unlock(); });
  assert.strictEqual(sound.ready(), false);
  assert.doesNotThrow(function () { sound.beep(440, 0.1, 0.05); });
  assert.doesNotThrow(function () { sound.setEngine(1, 20000); });
});

test("mute silences the engine and stays muted across unlock", () => {
  const sound = Pad7Audio.create({ AudioContext: mockAudioContext() });
  sound.setMuted(true);
  assert.strictEqual(sound.isMuted(), true);
  sound.unlock();
  sound.setEngine(1, 30000);
  assert.strictEqual(sound.isMuted(), true);
  sound.setMuted(false);
  assert.strictEqual(sound.isMuted(), false);
});

test("setEngine accepts throttle and dynamic pressure without throwing", () => {
  const sound = Pad7Audio.create({ AudioContext: mockAudioContext() });
  sound.unlock();
  assert.doesNotThrow(function () { sound.setEngine(0, 0); });
  assert.doesNotThrow(function () { sound.setEngine(1, 40000); });
  assert.doesNotThrow(function () { sound.setEngine(0.4, 8000); });
});

test("one-shots do not throw after unlock", () => {
  const sound = Pad7Audio.create({ AudioContext: mockAudioContext() });
  sound.unlock();
  assert.doesNotThrow(function () { sound.beep(880, 0.08, 0.06); });
  assert.doesNotThrow(function () { sound.bang(); });
  assert.doesNotThrow(function () { sound.tick(3); });
  assert.doesNotThrow(function () { sound.cutoff(); });
  assert.doesNotThrow(function () {
    sound.chime([{ f: 392, t: 0, d: 0.18 }, { f: 523, t: 0.14, d: 0.22 }]);
  });
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
