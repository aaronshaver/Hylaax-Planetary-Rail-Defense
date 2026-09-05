// Real Canvas2D + animation-frame benchmark. Supply PLAYWRIGHT_MODULE if not installed locally.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const live=process.env.BENCH_LIVE==='1',viewport={width:Number(process.env.BENCH_WIDTH||1920),height:Number(process.env.BENCH_HEIGHT||1080)};
  const browser = await chromium.launch({channel:'msedge',headless:true});
  const page = await browser.newPage({viewport,deviceScaleFactor:Number(process.env.BENCH_DPR || 1)});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(live=>{window.__HYLAAX_TEST__=true;window.benchmarkRAF=window.requestAnimationFrame.bind(window);if(!live)window.requestAnimationFrame=()=>0;},live);
  await page.goto(pathToFileURL(path.resolve(process.env.BENCH_ROOT||'.','index.html')).href);
  await page.locator('#remindersContinue').click();
  const results = await page.evaluate(async(live)=>{
    if(live)window.__HYLAAX_TEST__=false;
    const api=window.__HYLAAX_TEST_API__;api.reset();
    const s=api.state;s.paused=false;s.base.hp=s.base.maxHp=100000;s.baseEnergy=100000;s.baseMaterial=100000;s.tracks.clear();s.selected=null;s.nextEncroachmentAt=999999;
    // Two opposing fronts on genuinely traversable terrain. High HP sustains combat.
    const enemyCells=[],allyCells=[];
    for(let r=-7;r<=-1;r++)for(let q=-7;q<=7;q++){
      if(r<=-3&&api.unitCanTraverse(q,r)&&!api.structureAt(q,r))enemyCells.push({q,r});
      if(r>=-2&&api.neutralizerCanTraverse(q,r))allyCells.push({q,r});
    }
    const distance=p=>api.hexDistance(p,{q:0,r:-3});enemyCells.sort((a,b)=>distance(a)-distance(b));allyCells.sort((a,b)=>distance(a)-distance(b));
    for(let i=0;i<100;i++){
      for(const [kind,cells] of [['enemy',enemyCells],['neutralizer',allyCells]]){
        const {q,r:rr}=cells[Math.floor(i/7)],slot=i%7;
        const p=api.enemyWorldPosition(q,rr,slot);
        const unit={id:`${kind}-${i+1000}`,type:kind,q,r:rr,slot,x:p.x,y:p.y,fromQ:q,fromR:rr,fromSlot:slot,toQ:q,toR:rr,toSlot:slot,progress:1,moveCount:0,speed:.418,hp:10000,maxHp:10000,bornAt:0,attackClock:0,nextPathAt:0,phase:i*1.7};
        (kind==='enemy'?s.enemies:s.neutralizers).push(unit);
      }
    }
    api.render();
    if(live)for(let i=0;i<120;i++)await new Promise(resolve=>window.benchmarkRAF(resolve));
    const summarize=values=>{const a=[...values].sort((x,y)=>x-y);return {median:+a[Math.floor(a.length*.5)].toFixed(2),p95:+a[Math.floor(a.length*.95)].toFixed(2),max:+a.at(-1).toFixed(2),over20ms:values.filter(x=>x>20).length};};
    const results={};
    for(const mode of ['stationary','pan-max','rapid-zoom','unseen-pan']){
      const renderTimes=[],simulationTimes=[],frames=[];let last=null;s.pointer.down=false;
      for(let i=0;i<180;i++){
        const frame=await new Promise(resolve=>window.benchmarkRAF(resolve));if(last!==null)frames.push(frame-last);last=frame;
        if(mode==='pan-max'){s.camera.zoom=.42;s.camera.x=Math.sin(i/30)*1800;s.pointer.down=true;s.pointer.moved=true;}
        if(mode==='rapid-zoom'){const next=.42+(1+Math.sin(i/10))*.865;api.queueCameraZoom(-Math.log(next/s.camera.zoom)/.0012,700,500);}
        if(mode==='unseen-pan'){s.camera.zoom=.42;s.camera.x=1800+i*12;s.camera.y=1500;s.pointer.down=true;s.pointer.moved=true;}
        if(!live){
          const start=performance.now();api.update(1/60);const sim=performance.now();api.render();const end=performance.now();
          simulationTimes.push(sim-start);renderTimes.push(end-sim);
          if(api.processTerrainChunkQueue)api.processTerrainChunkQueue();
        }
      }
      if(s.paused||s.gameOver||s.enemies.length!==100||s.neutralizers.length!==100)throw Error('Stress scene stopped running or lost units');
      results[mode]={...(!live?{renderMs:summarize(renderTimes),simulationMs:summarize(simulationTimes)}:{}),frameMs:summarize(frames),terrain:api.terrainLayerStats(),elapsed:s.elapsed};
    }
    s.camera.x=100;s.camera.y=100;s.camera.zoom=1.65;s.pointer.down=false;api.render();
    return results;
  },live);
  const label=process.argv[2]||'current';fs.mkdirSync('artifacts',{recursive:true});
  await page.screenshot({path:`artifacts/${label}.png`});
  fs.writeFileSync(`artifacts/${label}.json`,JSON.stringify({viewport,live,dpr:Number(process.env.BENCH_DPR||1),errors,results},null,2));
  console.log(JSON.stringify({errors,results},null,2));await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
