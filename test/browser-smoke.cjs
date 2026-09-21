"use strict";

// Optional integration test. Uses installed Chrome and Playwright; never a play dependency.
const {chromium}=require('playwright');
const fs=require('fs');
const assert=require('assert');
const path=require('path');
const {pathToFileURL}=require('url');
process.chdir(path.join(__dirname,'..'));
fs.mkdirSync('artifacts',{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto(pathToFileURL(path.resolve('PAD-7.html')).href);
 await page.waitForFunction(()=>window.Pad7Optical.ready);
 async function instrument() {
  await page.evaluate(()=>{
   window.framesSeen=[];
   THREE.Scene.prototype.onAfterRender=function(renderer,scene,camera){
    window.capture={scene,camera};
    const rocket=scene.getObjectByName('padBlob').parent;
    const center=rocket.position.clone().project(camera);
    window.framesSeen.push({wall:performance.now(),alt:Pad7Room.physics.altitude(Pad7Room.state), mode:Pad7Room.ui.camera, center:[center.x,center.y], offset:[camera.position.x-Pad7Room.state.x,camera.position.y-Pad7Room.state.y,camera.position.z]});
   };
  });
 }
 await instrument();
 async function shot(name){await page.screenshot({path:'artifacts/'+name+'.png'});console.log(name,await page.evaluate(()=>({alt:Pad7Room.physics.altitude(Pad7Room.state),time:Pad7Room.state.t,mode:Pad7Room.ui.camera,phase:Pad7Room.ui.phase,warp:Pad7Room.ui.timeWarp})));}
 await shot('hold');
 await page.getByRole('button',{name:'ARM COUNTDOWN',exact:true}).click();
 await page.getByRole('button',{name:'COMMIT',exact:true}).click();
 await page.waitForFunction(()=>Pad7Room.physics.altitude(Pad7Room.state)>8);
 await shot('liftoff');
 for(let i=0;i<4;i++)await page.locator('#warpBtn').click();
 await page.waitForFunction(()=>Pad7Room.physics.altitude(Pad7Room.state)>3000,{},{timeout:60000}); await shot('chase');
 await page.waitForFunction(()=>Pad7Room.state.maxQPassed,{},{timeout:60000}); await shot('maxq');
 const flight=await page.evaluate(()=>framesSeen);
 const handover=flight.findIndex((f,i)=>i>0 && f.alt>=70 && flight[i-1].alt<70);
 assert.ok(handover>0,'AUTO handover observed');
 // Measure the first step against the subsequent transition, not a per-frame
 // metre limit that changes meaning when Chrome renders at 10 versus 60 fps.
 const settled=flight.find((f,i)=>i>handover&&f.wall-flight[handover].wall>=600);
 assert.ok(settled,'AUTO transition observed for 600 ms');
 const travel=(frame)=>Math.hypot(...frame.offset.map((n,i)=>n-flight[handover-1].offset[i]));
 assert.ok(travel(flight[handover])<travel(settled)*0.75,'AUTO offset must blend instead of cutting');
 assert.ok(flight.filter(f=>f.alt>70&&f.alt<100000).every(f=>Math.abs(f.center[0])<0.85&&Math.abs(f.center[1])<0.85),'stack stays framed at 25x');
 await page.waitForFunction(()=>Pad7Room.physics.altitude(Pad7Room.state)>100000, {}, {timeout:60000});
 await shot('auto-limb');
 const limbDistance=await page.evaluate(()=>capture.camera.position.distanceTo(capture.scene.getObjectByName('padBlob').parent.position));
 assert.ok(limbDistance<300,'AUTO stays close above the atmosphere');
 await page.keyboard.press('c'); await page.keyboard.press('c'); await page.keyboard.press('c'); await shot('site');
 await page.keyboard.press('c'); await page.keyboard.press('c');
 await page.waitForTimeout(1500); await shot('limb');
 await page.keyboard.press('c'); await shot('map');
 await page.keyboard.press('c');
 await page.waitForFunction(()=>Pad7Room.ui.missions.orbit, {}, {timeout:90000});
 await shot('auto-orbit');
 assert.ok(await page.evaluate(()=>capture.camera.position.length()>Pad7Room.state.planetRadius*2),'AUTO reveals the orbital map');
 await page.setViewportSize({width:420,height:680}); await page.reload(); await page.waitForFunction(()=>window.Pad7Optical.ready); await instrument(); await shot('mobile-hold');
 assert.ok(await page.locator('#ignite').isVisible());
 assert.ok(!(await page.locator('#warpBtn').isVisible()));
 await page.getByRole('button',{name:'ARM COUNTDOWN',exact:true}).click(); await page.getByRole('button',{name:'COMMIT',exact:true}).click();
 await page.waitForFunction(()=>Pad7Room.physics.altitude(Pad7Room.state)>10); await shot('mobile-launch');
 for (const selector of ['#warpBtn','#camBtn']) {
  const box=await page.locator(selector).boundingBox();
  assert.ok(box&&box.x>=0&&box.y>=0&&box.x+box.width<=420&&box.y+box.height<=680,selector+' pinned in viewport');
 }
 const mobile=await page.evaluate(()=>framesSeen.at(-1));
 assert.ok(mobile.center.every(n=>Math.abs(n)<0.85),'mobile stack framed');
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.waitForTimeout(150);
 const times=await page.evaluate(()=>capture.scene.getObjectByName('engine-exhaust').children.filter(c=>c.material&&c.material.uniforms&&c.material.uniforms.time).map(c=>c.material.uniforms.time.value));
 assert.equal(times.length,3);
 assert.ok(times.every(t=>t===0),'live reduced motion freezes flame shaders');
 console.log('ERRORS',errors); fs.writeFileSync('artifacts/browser-errors.json',JSON.stringify(errors));
 assert.deepEqual(errors,[],'Chrome console errors');
 console.log('PASS: file protocol, launch, 25x Max-Q framing, AUTO blend, AUTO limb and orbit reveal, camera cycle, mobile controls, reduced motion');
 } finally {
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
