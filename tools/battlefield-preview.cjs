const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {pathToFileURL}=require('node:url');const path=require('node:path');const fs=require('node:fs');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1920,height:1080}});
  await page.addInitScript(()=>{window.__HYLAAX_TEST__=true;window.requestAnimationFrame=()=>0;});
  await page.goto(pathToFileURL(path.resolve('index.html')).href);await page.locator('#remindersContinue').click();
  await page.evaluate(()=>{
    const a=window.__HYLAAX_TEST_API__,s=a.reset();s.tracks.clear();s.selected=null;s.camera.x=180;s.camera.y=140;s.camera.zoom=1.45;
    for(let q=-5;q<=11;q++)s.tracks.set(a.key(q,3),{q,r:3,hp:1,maxHp:1,links:new Set([...(q>-5?[a.key(q-1,3)]:[]),...(q<11?[a.key(q+1,3)]:[])])});
    for(const [index,trainType,q,r] of [[0,'builder',1,3],[1,'combat',8,3]]){
      const point=a.axialToWorld(q,r),roles=trainType==='builder'?['material','energy']:['energy'];
      const wagons=roles.map((type,i)=>{const p=a.axialToWorld(q-i-1,r);return {id:`wagon-${index}-${i}`,q:q-i-1,r,x:p.x,y:p.y,type,role:type,heading:0,colorShade:i,hp:50,maxHp:50,amount:15,capacity:30};});
      s.trains.push({id:`train-${index}`,code:a.trainCode(index),trainType,colorShade:index,q,r,x:point.x,y:point.y,heading:0,wagons,hp:50,maxHp:50,fuel:20,maxFuel:20,schedule:[{q:index?10:-4,r:3}],route:[]});
    }
    const specs=[['turret',3,1],['artillery',6,1],['wall',-3,2],['gate',-3,3],['wall',-3,4],['research',2,6],['neutralizer-building',6,5]];
    for(const [type,q,r] of specs){const structure={id:`${type}-${q}`,type,q,r,hp:100,maxHp:100,energy:50,maxEnergy:50,material:30,maxMaterial:30};if(type==='research')structure.footprint=[{q,r},{q:q+1,r},{q,r:r+1}];if(type==='neutralizer-building')structure.footprint=[{q,r},{q:q+1,r}];s.structures.set(a.key(q,r),structure);}
    a.createHive(9,-4,5);
    for(let i=0;i<18;i++){
      const q=6+i%3,r=-2+Math.floor(i/6),slot=i%6,p=a.enemyWorldPosition(q,r,slot);s.enemies.push({id:`creep-${i}`,x:p.x,y:p.y,q,r,slot,hp:1,phase:i});
      const np=a.enemyWorldPosition(q-3,r+1,slot);s.neutralizers.push({id:`ally-${i}`,x:np.x,y:np.y,q:q-3,r:r+1,slot,hp:1,phase:i});
    }
    a.updateUI(true);a.render();
  });
  fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/battlefield-4.7.png'});
  await page.evaluate(()=>{const a=window.__HYLAAX_TEST_API__;a.state.camera.zoom=.42;a.render();});await page.screenshot({path:'artifacts/battlefield-overview-4.7.png'});
  // Natural terrain close-up without changing any map generation rules.
  await page.evaluate(()=>{const a=window.__HYLAAX_TEST_API__;let best=null,score=-1;for(let q=-22;q<22;q+=4)for(let r=-22;r<22;r+=4){let n=0;for(let dq=-5;dq<=5;dq++)for(let dr=-5;dr<=5;dr++){const t=a.terrainAt(q+dq,r+dr).type;n+=t==='trees'?1:0;}if(n>score){score=n;best={q,r};}}const p=a.axialToWorld(best.q,best.r);Object.assign(a.state.camera,{x:p.x,y:p.y,zoom:1.8});a.render();});
  await page.screenshot({path:'artifacts/forest-4.7.png'});await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
