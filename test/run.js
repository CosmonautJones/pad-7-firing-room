"use strict";

const { spawnSync } = require("child_process");
const path = require("path");

const files = ["physics.test.js", "audio.test.js", "architecture.test.js", "optical.test.js", "desk.test.js"];
let failed = 0;
files.forEach(function (file) {
  console.log("\n== " + file + " ==");
  const r = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: "inherit" });
  if (r.status !== 0) failed += 1;
});
process.exit(failed ? 1 : 0);
