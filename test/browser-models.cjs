"use strict";
const {chromium}=require('playwright');
const assert=require('assert');
const path=require('path');
const fs=require('fs');
const {pathToFileURL}=require('url');
const root=path.join(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto(pathToFileURL(path.join(root,'PAD-7.html')).href);
  await page.waitForFunction(()=>Pad7Optical.ready);
  await page.evaluate(()=>{THREE.Scene.prototype.onAfterRender=function(r,s,c){window.capture={scene:s,camera:c}}});
  await page.waitForFunction(()=>window.capture);
  fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
  for(const preset of ['sparrow','heavy','kestrel']) {
   await page.locator('[data-preset="'+preset+'"]').click();
   await page.waitForTimeout(250);
   const data=await page.evaluate(()=>{
    const assembly=capture.scene.getObjectByName('vehicle-assembly');
    const box=new THREE.Box3().setFromObject(assembly),center=box.getCenter(new THREE.Vector3()).project(capture.camera);
    let fins=0,bells=0;assembly.traverse(o=>{if(o.name==='swept-fin')fins++;if(o.name==='engine-bell')bells++});
    return {fins,bells,center:[center.x,center.y],size:box.getSize(new THREE.Vector3()).toArray()};
   });
   assert.equal(data.fins,4);assert.equal(data.bells,preset==='heavy'?6:preset==='sparrow'?1:2);
   assert.ok(data.center.every(n=>Math.abs(n)<0.6),'complete assembly framed');
   await page.screenshot({path:path.join(root,'artifacts','model-'+preset+'.png')});
  }
  await page.keyboard.press('4');
  await page.locator('#addStage').click();await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>capture.scene.getObjectByName('vehicle-assembly').children.length),3,'STACK-added stage has its own model');
  await page.locator('#dropStage').click();await page.keyboard.press('1');
  await page.waitForFunction(()=>capture.scene.getObjectByName('vehicle-assembly').children.length===2);
  await page.evaluate(()=>{window.originalUpper=capture.scene.getObjectByName('stage-1');window.originalLower=capture.scene.getObjectByName('stage-0');window.upperMesh=originalUpper.getObjectByName('pressure-vessel')});
  await page.getByRole('button',{name:'ARM COUNTDOWN',exact:true}).click();await page.getByRole('button',{name:'COMMIT',exact:true}).click();
  for(let n=0;n<4;n++)await page.locator('#warpBtn').click();
  await page.waitForFunction(()=>Pad7Room.state.stage===1,{}, {timeout:60000});
  await page.locator('#photoBtn').click();
  const separation=await page.evaluate(()=>({upperSame:capture.scene.getObjectByName('stage-1')===originalUpper,meshSame:originalUpper.getObjectByName('pressure-vessel')===upperMesh,detached:originalLower.parent!==originalUpper.parent,age:Pad7Room.state.debris[0].age,boosterMeshes:originalLower.children.length}));
  assert.ok(separation.upperSame&&separation.meshSame&&separation.detached);assert.ok(separation.boosterMeshes>20);
  await page.screenshot({path:path.join(root,'artifacts','model-separation.png')});
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  assert.ok(await page.evaluate(()=>Pad7Room.state.debris[0].age)>separation.age,'detached booster continues its physics trajectory');
  await page.locator('[data-preset="heavy"]').click();
  await page.getByRole('button',{name:'ARM COUNTDOWN',exact:true}).click();await page.getByRole('button',{name:'COMMIT',exact:true}).click();
  await page.waitForFunction(()=>Pad7Room.physics.altitude(Pad7Room.state)>5);
  assert.equal(await page.evaluate(()=>capture.scene.getObjectByName('engine-exhaust').children.filter(c=>c.material?.uniforms?.smoke?.value===0&&c.visible).length),15,'all five engines have a filled plume');
  await page.screenshot({path:path.join(root,'artifacts','model-heavy-launch.png')});
  await page.setViewportSize({width:420,height:680});
  for(const preset of ['sparrow','heavy','kestrel']) {
   await page.locator('[data-preset="'+preset+'"]').click();await page.waitForTimeout(150);
   const framed=await page.evaluate(()=>{
    const box=new THREE.Box3().setFromObject(capture.scene.getObjectByName('vehicle-assembly'));
    const bottom=new THREE.Vector3(0,box.min.y,0).project(capture.camera),top=new THREE.Vector3(0,box.max.y,0).project(capture.camera);
    return Math.abs(bottom.y)<0.97&&Math.abs(top.y)<0.97;
   });assert.ok(framed,preset+' fits the narrow optical window');
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: three distinct assemblies, full staged hardware, persistent upper stage, five Heavy plumes, all mobile silhouettes; zero console errors');
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
