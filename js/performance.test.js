"use strict";
const assert=require("node:assert/strict");
const {test,beforeEach}=require("node:test");
const {api,elements,makeEnemy}=require("./harness.js");
beforeEach(()=>api.reset());

test("an unreachable search yields at its expansion budget and eventually terminates",()=>{
  const search=api.createEnemyPathSearch({q:0,r:0},{q:20,r:0},1);
  const passable=(q,r)=>Math.abs(q)<=12&&Math.abs(r)<=12;
  let result=false,calls=0;
  while(result===false&&calls++<100){
    const previous=search.explored;result=api.advanceEnemyPathSearch(search,passable,()=>1,17);
    assert.ok(search.explored-previous<=17);
  }
  assert.equal(result,null);assert.ok(calls>1&&calls<100);
});

test("resuming a search preserves the same route as a complete search",()=>{
  const start={q:0,r:0},goal={q:12,r:0},passable=(q,r)=>q!==6||r===4;
  const expected=api.findEnemyPath(start,goal,passable,1,()=>1);
  const search=api.createEnemyPathSearch(start,goal,1);let result=false;
  for(let i=0;result===false&&i<100;i++)result=api.advanceEnemyPathSearch(search,passable,()=>1,8);
  assert.deepEqual(result,expected);
});

test("neutralizer searches share an expansion budget, including pending searches",()=>{
  const budget={remaining:2,nodesRemaining:8},passable=(q,r)=>q!==7||r===10;
  const first={id:"neutralizer-budget-a",q:0,r:0},second={id:"neutralizer-budget-b",q:1,r:0};
  assert.equal(api.cachedNeutralizerPathStep(first,{q:14,r:0},passable,budget),false);
  assert.equal(budget.nodesRemaining,0);
  assert.equal(api.cachedNeutralizerPathStep(second,{q:14,r:0},passable,budget),false);
  assert.equal(second.pathSearch.search.explored,0);
});

test("200 units submit cached sprites without live body paths or shadow blurs",()=>{
  const context=elements.get("gameCanvas").context;
  api.state.enemies=Array.from({length:100},(_,i)=>makeEnemy(`e-${i}`,i%10,Math.floor(i/10),i%7));
  api.state.neutralizers=api.state.enemies.map(e=>({...e,id:`n-${e.id}`,type:"neutralizer"}));
  context.drawImageCalls.length=0;context.fillCalls.length=0;context.strokeCalls.length=0;
  api.drawEnemies();api.drawNeutralizers();
  assert.equal(context.drawImageCalls.length,200);assert.equal(context.fillCalls.length,0);assert.equal(context.strokeCalls.length,0);
  const sprites=new Set(context.drawImageCalls.map(call=>call.args[0]));assert.equal(sprites.size,6);
  context.drawImageCalls.length=0;api.drawEnemies();api.drawNeutralizers();
  assert.ok(context.drawImageCalls.every(call=>sprites.has(call.args[0])));
});

test("terrain chunk preparation is bounded and cached zooms reuse prepared terrain",()=>{
  api.ensureTerrainLayer();let previous=api.terrainLayerStats();
  for(let i=0;i<300&&previous.pendingChunks;i++){
    api.processTerrainChunkQueue();const current=api.terrainLayerStats();
    assert.ok(current.chunkBuilds-previous.chunkBuilds<=2);assert.ok(current.chunkPixels<=24*1024*1024);previous=current;
  }
  assert.equal(previous.pendingChunks,0);
  api.state.camera.zoom=.42;api.ensureTerrainLayer();
  const first=api.terrainLayerStats();api.state.camera.zoom=1;api.ensureTerrainLayer();api.state.camera.zoom=.42;api.ensureTerrainLayer();
  assert.equal(api.terrainLayerStats().chunkBuilds,first.chunkBuilds,"wheel rendering must not synchronously bake chunks");
});

test("terrain content changes cannot reuse a stale gesture preview",()=>{
  api.ensureTerrainLayer();const before=api.terrainLayerStats().builds;
  api.queueCameraZoom(-20,512,384);api.state.mapSeed++;
  api.ensureTerrainLayer();assert.equal(api.terrainLayerStats().builds,before+1);
});

test("incremental Creep navigation converges to the complete field",()=>{
  api.state.enemies=[makeEnemy("field-unit",5,-1)];
  const expected=api.rebuildEnemyNavigation();
  api.resetEnemyNavigation();let actual=api.ensureEnemyNavigation(true);
  assert.ok(actual.distances.size<expected.distances.size,"cold field construction must yield before exploring the whole region");
  for(let i=0;i<100;i++)actual=api.ensureEnemyNavigation(true);
  assert.deepEqual(actual.distances,expected.distances);
  assert.equal(actual.builds,1,"continuations should not restart the field");
});

test("sparse static layers allocate pixels only around their artwork",()=>{
  api.state.tracks.clear();api.state.structures.clear();api.state.ghosts.clear();api.state.trains=[];api.render();
  const layers=api.staticWorldLayers;
  for(const name of ["tracks","structures","ghosts","stops","supply"]){assert.equal(layers[name].canvas.width,1);assert.equal(layers[name].canvas.height,1);}
  assert.ok(layers.base.canvas.width<512&&layers.base.canvas.height<384,"a small Base must not allocate a full-screen texture");
  const builds=api.staticWorldLayerStats().base.builds;
  api.state.camera.x+=40;api.render();
  assert.equal(api.staticWorldLayerStats().base.builds,builds,"the cropped bitmap retains the original overscan coverage");
});

test("panning a cropped layer out of view and back does not lose its content",()=>{
  api.render();api.state.camera.x=10000;api.render();assert.equal(api.staticWorldLayers.base.view.layerWidth,0);
  api.centerMapOnBase();assert.ok(api.staticWorldLayers.base.view.layerWidth>0);
});
