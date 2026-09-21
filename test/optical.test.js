"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const THREE = require("../three.min.js");
const source = fs.readFileSync(path.join(__dirname, "../optical.js"), "utf8");
// Expose private presentation objects only in this VM, never on the play path.
const context = { THREE };
vm.runInNewContext(source.replace("root.Pad7Optical = {", `root.probe = {
  camera: desiredCam,
  sky: skyMaterial,
  atmosphere: atmoMaterial,
  stars: function() { scene=new THREE.Scene(); makeStars(); return stars; },
  earthFrame: function() { return earthOrientation(); },
  photoSize: function(w,h,limit) { return photoSize(w,h,limit); },
  capture: function(r,c) { renderer=r; canvas=c; ready=true; return root.Pad7Optical.capturePng(); },
  manualCamera: function(s, n) { return manualView(s, n); },
  flame: function(reduced, now) { reduceMotion = reduced; var m = flameCardMaterial(false); driveFlame(m, 1, 1, now); return m; },
  model: function(vehicle) { return makeVehicleModel(vehicle); },
  staged: function(vehicle) { if (!rocketGroup) rocketGroup=new THREE.Group(); if (!debrisGroup) debrisGroup=new THREE.Group(); buildRocket(vehicle,0); var upper=rocketGroup.getObjectByName('stage-1'); var lower=rocketGroup.getObjectByName('stage-0'); var before=upper.position.clone(); setRocketStage(1); return {upper:upper,lower:lower,before:before,root:rocketGroup,debris:debrisGroup,core:plumeCore}; },
  rocket: function() { if (!rocketGroup) rocketGroup = new THREE.Group(); buildRocket({name: 'test', stages: [{}, {}]}, 0); return {core: plumeCore, cards: plumePlanes, vapor: condensation}; }
}; root.Pad7Optical = {`), context);
let failed = 0, passed = 0;
function test(name, fn) { try { fn(); passed++; console.log("  ok  " + name); } catch (e) { failed++; console.error("  FAIL  " + name + ": " + e.message); } }
const Physics=require('../physics.js');
test("vehicle presets build distinct silhouettes and engine arrangements", () => {
  const k=context.probe.model(Physics.defaultVehicle()),s=context.probe.model(Physics.soundingVehicle()),h=context.probe.model(Physics.heavyVehicle());
  assert.equal(k.stages.length,2); assert.equal(s.stages.length,1); assert.equal(h.stages.length,2);
  assert.ok(s.profile.radius<k.profile.radius && k.profile.radius<h.profile.radius);
  assert.equal(h.stages[0].userData.nozzles.length,5);
  assert.equal(k.stages[0].userData.nozzles.length,1);
  assert.equal(s.stages[0].userData.nozzles.length,1);
  for(const model of [k,s,h]) {
    let bells=0,curves=0,fins=0;
    model.group.traverse(o=>{if(o.name==='engine-bell')bells++;if(o.geometry?.type==='LatheGeometry')curves++;if(o.name==='swept-fin'){fins++;assert.notEqual(o.geometry.type,'BoxGeometry')}});
    assert.ok(bells && curves && fins,"shaped hardware instead of primitive placeholders");
  }
});
test("staging detaches the actual booster and preserves upper-stage geometry", () => {
  const m=context.probe.staged(Physics.defaultVehicle());
  assert.equal(m.upper.parent.parent,m.root,"upper remains in the original assembly");
  assert.ok(m.upper.position.distanceTo(m.before)<1e-9,"upper cannot teleport on staging");
  assert.equal(m.lower.parent,m.debris,"same booster moves into debris");
  assert.ok(m.lower.getObjectByName('engine-bell'),"discarded stage retains its hardware");
  assert.equal(m.core.position.y,m.upper.userData.nozzles[0].y,"new exhaust meets the upper nozzle");
});
test("fin roots intersect the pressure vessel and clustered bells do not overlap", () => {
  for(const vehicle of [Physics.defaultVehicle(),Physics.soundingVehicle(),Physics.heavyVehicle()]) {
    const model=context.probe.model(vehicle);
    model.group.traverse(mesh=>{
      if(mesh.name!=="swept-fin")return;
      mesh.geometry.computeBoundingBox();
      assert.ok(mesh.geometry.boundingBox.min.x<mesh.userData.hullRadius-0.05,"fin root must enter the hull");
      assert.ok(Math.abs(mesh.rotation.y/(Math.PI/2)-Math.round(mesh.rotation.y/(Math.PI/2)))<1e-6,"fins project radially");
    });
    const bells=model.stages[0].userData.nozzles;
    for(let i=0;i<bells.length;i++)for(let j=i+1;j<bells.length;j++)assert.ok(Math.hypot(bells[i].x-bells[j].x,bells[i].z-bells[j].z)>bells[i].radius+bells[j].radius,"engine bells need physical clearance");
  }
});
test("STACK-added stages occupy successive positions instead of overlapping", () => {
  const vehicle=Physics.defaultVehicle();vehicle.stages.push({...vehicle.stages[1],name:'Kick stage'});
  const model=context.probe.model(vehicle);
  assert.equal(model.stages.length,3);
  const firstUpper=new THREE.Box3().setFromObject(model.stages[1]);
  assert.ok(model.stages[2].userData.nozzles[0].y>firstUpper.min.y+10);
  assert.ok(model.stages[2].userData.radius<model.stages[1].userData.radius);
});
test("custom color shaders finish with display color conversion", () => {
  for (const material of [context.probe.sky(), context.probe.atmosphere(false), context.probe.flame(false, 1000)]) {
    assert.ok(material.fragmentShader.includes("#include <colorspace_fragment>"));
  }
});
test("dawn sky keeps a horizon band and a second cloud deck", () => {
  const sky = context.probe.sky();
  assert.ok(sky.fragmentShader.includes("horizonBand"));
  assert.ok(sky.fragmentShader.includes("deckBreaks"));
});
test("pad still keeps a side angle, the deck, and a readable stack", () => {
  const s = Physics.createState(Physics.defaultVehicle());
  const cam = context.probe.camera(s, { camera: "pad", phase: "hold" }, Physics);
  assert.equal(cam.mode, "pad");
  assert.ok(cam.pos.x < s.x - 40, "camera stays off the tower side for parallax");
  assert.ok(cam.pos.z > 100, "downrange offset");
  const dist = Math.hypot(cam.pos.x - cam.look.x, cam.pos.y - cam.look.y, cam.pos.z - cam.look.z);
  assert.ok(dist > 110 && dist < 180, "distance " + dist);
  assert.ok(cam.fov >= 26 && cam.fov <= 32);
  assert.ok(cam.look.y < s.y + 36, "look includes the deck, not only the nose");
  assert.ok(cam.pos.y < cam.look.y + 20, "not a crane looking down");
});
test("stars stay beyond Earth at every supported map zoom", () => {
  const positions=context.probe.stars().geometry.attributes.position;
  assert.ok(Math.hypot(positions.getX(0),positions.getY(0),positions.getZ(0))>6371000*10);
});
test("Earth places Cape Canaveral under the pad and east along ascent", () => {
  const lat=28.5*Math.PI/180, lon=-80.6*Math.PI/180, q=context.probe.earthFrame();
  const cape=new THREE.Vector3(Math.cos(lat)*Math.cos(lon),Math.sin(lat),-Math.cos(lat)*Math.sin(lon)).applyQuaternion(q);
  const east=new THREE.Vector3(-Math.sin(lon),0,-Math.cos(lon)).applyQuaternion(q);
  assert.ok(cape.distanceTo(new THREE.Vector3(0,1,0))<1e-6);
  assert.ok(east.distanceTo(new THREE.Vector3(1,0,0))<1e-6);
});
test("photo resolution preserves composition within GPU and 4K limits", () => {
  for (const [w,h,limit] of [[1440,1000,8192],[420,680,8192],[1440,1000,2048]]) {
    const size=context.probe.photoSize(w,h,limit);
    assert.equal(Math.max(size.width,size.height),Math.min(3840,limit));
    assert.ok(Math.abs(size.width/size.height-w/h)<0.001);
  }
});
test("failed photo capture restores the live renderer size and density", () => {
  let density=1.5, w=1440, h=1000;
  const r={capabilities:{maxTextureSize:8192},getContext:()=>({MAX_RENDERBUFFER_SIZE:1,getParameter:()=>8192}),getPixelRatio:()=>density,getSize:v=>v.set(w,h),setPixelRatio:n=>{density=n},setSize:(x,y)=>{w=x;h=y},render:()=>{}};
  assert.throws(()=>context.probe.capture(r,{toDataURL:()=>{throw new Error("capture failed")}}),/capture failed/);
  assert.deepEqual([w,h,density],[1440,1000,1.5]);
});
test("flame depth matches the renderer logarithmic depth buffer", () => {
  const m = context.probe.flame(false, 1000);
  assert.ok(m.vertexShader.includes("#include <logdepthbuf_vertex>"));
  assert.ok(m.fragmentShader.includes("#include <logdepthbuf_fragment>"));
});
test("reduced motion freezes flame shader time", () => {
  assert.equal(context.probe.flame(true, 1000).uniforms.time.value, context.probe.flame(true, 9000).uniforms.time.value);
  assert.notEqual(context.probe.flame(false, 1000).uniforms.time.value, context.probe.flame(false, 9000).uniforms.time.value);
});
test("opaque core and fringe scale from the same nozzle origin", () => {
  const {core, cards} = context.probe.rocket();
  assert.equal(core.material.transparent, false);
  core.geometry.computeBoundingBox();
  assert.ok(Math.abs(core.geometry.boundingBox.max.y) < 0.001, "core must end at local zero");
  for (const card of cards) {
    card.geometry.computeBoundingBox();
    assert.ok(Math.abs(card.geometry.boundingBox.max.y) < 0.001, "card must end at local zero");
    assert.equal(card.position.y, core.position.y);
  }
});
test("limb sightline puts the geometric horizon behind the stack", () => {
  const R = 6371000;
  for (const alt of [10000, 100000, 300000]) {
    const s = {planetRadius: R, x: 0, y: R + alt, theta: 0.3, vx: 5000, vy: 10};
    const c = context.probe.camera(s, {camera: "limb", phase: "flight"}, {altitude: () => alt});
    const depression = Math.atan2(c.pos.y - c.look.y, Math.hypot(c.pos.x - c.look.x, c.pos.z));
    const horizon = Math.acos(R / (R + alt));
    assert.ok(Math.abs(depression - horizon) < 0.025, "horizon is outside the intended composition");
    assert.ok(Math.hypot(c.pos.x - s.x, c.pos.y - s.y, c.pos.z) < 300, "stack too distant");
  }
});
test("AUTO stays with ascent before revealing the map on orbit", () => {
  const state = {planetRadius: 6371000, x: 0, y: 6491000, theta: 0.2, vx: 5000, vy: 400};
  const P = {altitude: () => 120000};
  assert.equal(context.probe.camera(state, {camera: "auto", phase: "flight", missions: {orbit: false}}, P).mode, "limb");
  assert.equal(context.probe.camera(state, {camera: "auto", phase: "flight", missions: {orbit: true}}, P).mode, "map");
  assert.equal(context.probe.camera(state, {camera: "chase", phase: "flight", missions: {orbit: true}}, P).mode, "chase");
});
test("rebuilding a stack releases nested effect materials", () => {
  const first = context.probe.rocket();
  let disposed = 0;
  first.vapor.children[0].material.addEventListener("dispose", () => disposed++);
  context.probe.rocket();
  assert.equal(disposed, 1);
});
test("manual camera stays near the stack at orbital coordinates", () => {
  const s = {planetRadius: 6371000, x: 900000, y: 6490000, theta: 0.4, stage: 0};
  const nav = {map: false, yaw: 0.7, pitch: 0.3, distance: 140, fov: 40};
  const a = context.probe.manualCamera(s, nav);
  const b = context.probe.manualCamera({...s, x: s.x + 15000, y: s.y + 7000}, nav);
  assert.ok(Math.abs(b.look.x - a.look.x - 15000) < 0.001);
  assert.ok(Math.abs(b.look.y - a.look.y - 7000) < 0.001);
  assert.ok(Math.abs(Math.hypot(a.pos.x-a.look.x,a.pos.y-a.look.y,a.pos.z-a.look.z)-140) < 0.001);
});
test("manual camera limits zoom and cannot go below the surface", () => {
  const s = {planetRadius: 6371000, x: 0, y: 6371001, theta: Math.PI / 2, stage: 0};
  for (const distance of [0.01, 140, 1e9]) {
    const view = context.probe.manualCamera(s, {map:false,yaw:0.2,pitch:-1.3,distance,fov:40});
    assert.ok(Math.hypot(view.pos.x,view.pos.y,view.pos.z) >= s.planetRadius+5);
    const span = Math.hypot(view.pos.x-view.look.x,view.pos.y-view.look.y,view.pos.z-view.look.z);
    assert.ok(span >= 44 && span <= 321, "zoom stays useful");
  }
});
test("manual map keeps Earth as its focus and camera outside the globe", () => {
  const s = {planetRadius:6371000,x:900000,y:6490000,theta:0,stage:1};
  const view = context.probe.manualCamera(s,{map:true,yaw:1.2,pitch:0.4,distance:2,fov:28});
  assert.equal(view.mode,"map");
  assert.equal(Math.hypot(view.look.x,view.look.y,view.look.z),0);
  assert.ok(Math.hypot(view.pos.x,view.pos.y,view.pos.z)>=s.planetRadius*2);
});
console.log("\n" + passed + " passed, " + failed + " failed");
process.exitCode = failed ? 1 : 0;
