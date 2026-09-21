"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");
const root = path.join(__dirname, "..");

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.context().setOffline(true);
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(pathToFileURL(path.join(root, "PAD-7.html")).href);
    await page.waitForFunction(() => Pad7Optical.ready);
    await page.evaluate(() => {
      THREE.Scene.prototype.onAfterRender = function (renderer, scene, camera) { window.capture = { renderer, scene, camera }; };
    });
    await page.waitForFunction(() => window.capture);
    await page.waitForFunction(()=>capture.scene.getObjectByName("earth").material.map.image.width===4096 && capture.scene.getObjectByName("clouds").material.alphaMap.image.width===2048);
    const colors = await page.evaluate(() => {
      const {renderer,scene}=capture;
      const target=new THREE.WebGLRenderTarget(64,32);
      const sample=new THREE.Scene(); sample.onAfterRender=()=>{};
      const geometry=new THREE.PlaneGeometry(2,2);
      const material=new THREE.MeshBasicMaterial({map:scene.getObjectByName("earth").material.map,toneMapped:false});
      sample.add(new THREE.Mesh(geometry,material));
      const view=new THREE.OrthographicCamera(-1,1,1,-1,0.1,10); view.position.z=1;
      const pixels=new Uint8Array(64*32*4);
      try {
        renderer.setRenderTarget(target); renderer.render(sample,view);
        renderer.readRenderTargetPixels(target,0,0,64,32,pixels);
        const unique=new Set(); for(let i=0;i<pixels.length;i+=4)unique.add(pixels.slice(i,i+3).join(","));
        return unique.size;
      } finally {renderer.setRenderTarget(null); target.dispose(); geometry.dispose(); material.dispose();}
    });
    assert.ok(colors>200,"satellite detail reaches the GPU, not only the decoded image");
    async function cameraState() {
      return page.evaluate(() => {
        const { scene, camera } = capture;
        const rocket = scene.getObjectByName("padBlob").parent;
        const point = rocket.position.clone().project(camera);
        return { pos: camera.position.toArray(), span: camera.position.distanceTo(rocket.position), center: [point.x, point.y], manual: Pad7Optical.manual };
      });
    }
    const box = await page.locator("#sky").boundingBox();
    const before = await cameraState();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.45);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.5, { steps: 12 });
    await page.mouse.up();
    const dragged = await cameraState();
    assert.ok(dragged.manual, "drag takes camera control");
    assert.notDeepEqual(dragged.pos, before.pos);
    await page.mouse.wheel(0, -180);
    await page.waitForTimeout(100);
    assert.ok((await cameraState()).span < dragged.span, "wheel zooms in");
    await page.locator("#sky").dblclick({ position: { x: box.width * 0.5, y: box.height * 0.5 } });
    assert.equal(await page.evaluate(() => Pad7Optical.manual), false, "double-click restores AUTO");
    await page.locator("#sky").focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.evaluate(() => Pad7Optical.manual), true, "keyboard camera orbit");
    await page.getByRole("button", { name: "Return to AUTO", exact: true }).click();

    // Photo mode must stop a countdown, not merely a vehicle sitting in HOLD.
    await page.getByRole("button", { name: "ARM COUNTDOWN", exact: true }).click();
    await page.locator("#photoBtn").click();
    const count = await page.evaluate(() => Pad7Room.ui.countT);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => Pad7Room.ui.countT), count, "countdown paused");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "COMMIT", exact: true }).click();
    for (let i = 0; i < 4; i++) await page.locator("#warpBtn").click();
    await page.waitForFunction(() => Pad7Room.physics.altitude(Pad7Room.state) > 4000, {}, { timeout: 60000 });
    await page.locator("#zoomIn").click();
    await page.waitForTimeout(400);
    assert.ok((await cameraState()).center.every(n => Math.abs(n) < 0.85), "manual camera stays framed at 25x");
    assert.match(await page.locator("#camBtn").textContent(), /HAND/);
    await page.locator("#photoBtn").click();
    const snapshot = await page.evaluate(() => JSON.stringify(state));
    const flame = await page.evaluate(() => Pad7Room.ui.visualTime);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => JSON.stringify(state)), snapshot, "photo pauses state");
    assert.equal(await page.evaluate(() => Pad7Room.ui.visualTime), flame, "photo pauses visual animation");
    await page.keyboard.press("i");
    await page.keyboard.press("r");
    assert.equal(await page.evaluate(() => JSON.stringify(state)), snapshot, "flight keys disabled in photo mode");
    assert.equal(await page.locator("#desk").isVisible(), false, "instruments hidden");
    await page.evaluate(() => { window.originalCapture = Pad7Optical.capturePng; Pad7Optical.capturePng = () => { throw new Error("test capture failure"); }; });
    await page.locator("#savePhoto").click();
    assert.match(await page.locator("#photoStatus").textContent(), /CAPTURE FAILED/);
    assert.equal(await page.evaluate(() => Pad7Room.ui.photo), true);
    await page.evaluate(() => { Pad7Optical.capturePng = window.originalCapture; });
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#savePhoto").click();
    const download = await downloadPromise;
    fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
    const saved = path.join(root, "artifacts", "optics-photo-" + Date.now() + ".png");
    // Read the completed browser download before writing the review artifact.
    // A Windows image preview can hold an earlier artifact open across test runs.
    const chunks = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk);
    const png = Buffer.concat(chunks);
    fs.writeFileSync(saved, png);
    console.log("Downloaded photo:", saved);
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.ok(png.length > 20000, "PNG contains scene data");
    assert.equal(Math.max(png.readUInt32BE(16),png.readUInt32BE(20)),3840,"photo exports at 4K independently of the live canvas");
    assert.ok(await page.locator("#sky").evaluate(el=>el.width===Math.round(el.clientWidth*Math.min(2,devicePixelRatio))),"live canvas density restored after export");
    const frozen = await page.evaluate(() => Pad7Room.state.t);
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => Pad7Room.ui.photo), false);
    await page.waitForFunction(t => Pad7Room.state.t > t, frozen);
    assert.equal(await page.locator("#desk").isVisible(), true);

    // Use Chrome's touch input to exercise the actual Pointer Events path.
    await page.setViewportSize({ width: 420, height: 680 });
    await page.getByRole("button", { name: "Return to AUTO", exact: true }).click();
    await page.reload();
    await page.waitForFunction(() => Pad7Optical.ready);
    await page.evaluate(() => {
      THREE.Scene.prototype.onAfterRender = function (renderer, scene, camera) { window.capture = { scene, camera }; };
    });
    await page.waitForFunction(() => window.capture);
    const touch = await page.context().newCDPSession(page);
    await touch.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 2 });
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 160, y: 155, id: 1 }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 220, y: 165, id: 1 }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    assert.equal(await page.evaluate(() => Pad7Optical.manual), true, "touch drag orbits");
    const beforePinch = await cameraState();
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 150, y: 150, id: 1 }, { x: 250, y: 150, id: 2 }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 120, y: 150, id: 1 }, { x: 280, y: 150, id: 2 }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(100);
    assert.ok((await cameraState()).span < beforePinch.span, "pinch spread zooms in");
    await page.locator("#photoBtn").click();
    for (const id of ["#zoomIn", "#zoomOut", "#autoView", "#savePhoto", "#photoBtn"]) {
      const rect = await page.locator(id).boundingBox();
      assert.ok(rect && rect.x >= 0 && rect.x + rect.width <= 420 && rect.y + rect.height <= 680, id + " remains in narrow viewport");
    }
    await page.screenshot({ path: path.join(root, "artifacts", "optics-mobile.png") });
    await page.locator("#photoBtn").click();
    assert.equal(await page.evaluate(() => Pad7Room.ui.photo), false);
    assert.equal(await page.locator("#ignite").isVisible(), true);
    assert.deepEqual(errors, []);
    console.log("PASS: mouse orbit, wheel, recenter, keyboard, 25x framing, countdown/flight pause, PNG download, resume, touch and narrow controls; zero console errors");
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
