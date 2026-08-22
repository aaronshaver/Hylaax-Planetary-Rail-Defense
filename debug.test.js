"use strict";

const assert = require("node:assert/strict");
const { describe, test, beforeEach } = require("node:test");
const { api, elements, makeEnemy, makeTrack, addTestTrain } = require("./harness.js");

beforeEach(()=>api.reset());

describe("Debug menu",()=>{
  test("opens and closes without leaving its destructive tool active",()=>{
    api.setDebugMenuOpen(true);
    assert.equal(elements.get("debugMenu").hidden,false);
    assert.equal(elements.get("debugMenu").classList.contains("d-none"),false);
    assert.equal(elements.get("debugToggle").ariaExpanded,"true");

    api.setMode("debug-destroy");
    assert.equal(api.state.mode,"debug-destroy");
    assert.equal(elements.get("debugDestroyObject").classList.contains("active"),true);
    api.setMode("debug-add-creep");assert.equal(elements.get("debugAddCreep").classList.contains("active"),true);
    api.setDebugMenuOpen(false);
    assert.equal(api.state.mode,"select");
    assert.equal(elements.get("debugMenu").hidden,true);
    assert.equal(elements.get("debugToggle").ariaExpanded,"false");
  });

  test("Add Creep uses normal seven-slot Creep spawning on the chosen hex",()=>{
    const state=api.state;state.enemies=[];state.structures.clear();state.ghosts.clear();state.trains=[];
    let target=null;
    for(let q=-12;q<=12&&!target;q++)for(let r=-12;r<=12&&!target;r++)if(api.terrainAt(q,r).type==="ground"&&!state.tracks.has(api.key(q,r))&&api.hexDistance({q,r},state.base)>3)target={q,r};
    assert.ok(target);api.setMode("debug-add-creep");
    for(let index=0;index<api.constants.CREEP_HEX_CAPACITY;index++)assert.ok(api.handleHexClick(target));
    assert.equal(state.enemies.length,7);assert.deepEqual([...new Set(state.enemies.map(enemy=>enemy.slot))].sort((a,b)=>a-b),[0,1,2,3,4,5,6]);
    assert.equal(api.handleHexClick(target),undefined);assert.equal(state.enemies.length,7,"an eighth Creep must not overfill the hex");
  });

  test("adds 1,000 of every registered Base resource, including future resource types",()=>{
    const state=api.state,registry=api.constants.BASE_RESOURCE_TYPES;
    state.baseMaterial=12;state.baseEnergy=34;state.baseResearch=56;
    registry.push({key:"research",stateKey:"baseResearch",label:"Research"});
    try{
      assert.deepEqual({...api.addBaseResources()},{material:1000,energy:1000,research:1000});
      assert.equal(state.baseMaterial,1012);assert.equal(state.baseEnergy,1034);assert.equal(state.baseResearch,1056);
      state.selected={type:"base",id:"base"};assert.match(api.selectionHtml(),/RESEARCH/);assert.match(api.selectionHtml(),/1056/);
    }finally{
      registry.pop();delete state.baseResearch;
    }
  });

  test("adds 1,000 Research points without prematurely revealing the HUD",()=>{
    const state=api.state;state.researchPoints=25;state.researchUnlocked=false;
    assert.equal(api.addResearchPoints(),1000);assert.equal(state.researchPoints,1025);assert.equal(elements.get("researchPointsHud").textContent,0);
    state.researchUnlocked=true;api.updateUI(true);assert.equal(elements.get("researchPointsHud").textContent,1025);
  });

  test("Destroy Object uses normal destruction for structures, Track, Hives, and Creeps",()=>{
    const state=api.state;state.structures.clear();state.tracks.clear();state.hives.clear();state.enemies=[];
    const wall={id:"debug-wall",type:"wall",q:4,r:0,hp:100,maxHp:100};state.structures.set("4,0",wall);
    const track=makeTrack(5,0);state.tracks.set("5,0",track);
    const hive=api.createHive(6,0,3);
    const enemy=makeEnemy("debug-creep",7,0);state.enemies.push(enemy);
    api.setMode("debug-destroy");

    assert.equal(api.handleHexClick({q:wall.q,r:wall.r}),true);assert.equal(state.ghosts.get("4,0").objectType,"wall");assert.equal(state.particles.length,0,"wreckage should use its small X instead of frozen center particles");
    assert.equal(api.handleHexClick({q:track.q,r:track.r}),true);assert.equal(state.ghosts.get("5,0").objectType,"track");assert.equal(state.particles.length,0);
    assert.equal(api.handleHexClick({q:hive.q,r:hive.r}),true);assert.equal(state.hives.has("6,0"),false);assert.equal(state.hivesNeutralized,1);
    assert.equal(api.handleHexClick({q:7,r:0}),true);assert.equal(state.enemies.length,0);assert.equal(state.creepsNeutralized,1);
  });

  test("Destroy Object triggers the serious Train-loss tones and map shake",()=>{
    const state=api.state,train=addTestTrain("combat"),toneCalls=[],originalTone=api.sounds.tone,context=elements.get("gameCanvas").context;
    api.sounds.tone=(...args)=>toneCalls.push(args);
    try{
      state.paused=true;context.translateCalls.length=0;api.setMode("debug-destroy");
      assert.equal(api.handleHexClick({q:train.wagons[0].q,r:train.wagons[0].r}),true);
      assert.equal(train.wagons.length,0);assert.deepEqual(toneCalls.map(call=>call[0]),[105,82,62]);
      assert.equal(state.screenShakeUntil,api.constants.TRAIN_LOSS_SHAKE_SECONDS);
      assert.equal(api.screenShakeActive(),true);assert.ok(state.screenShakeUntilWallTime>Date.now());
      assert.ok(Math.hypot(context.translateCalls[0].x,context.translateCalls[0].y)>.01,"the first paused Debug render should already be shaken");
    }finally{api.sounds.tone=originalTone;}
  });

  test("Destroy Object can destroy the Base through the normal game-over path",()=>{
    api.setMode("debug-destroy");
    assert.equal(api.handleHexClick({q:0,r:0}),true);
    assert.equal(api.state.base.hp,0);assert.equal(api.state.gameOver,true);
    assert.equal(elements.get("debugDestroyObject").disabled,true);assert.equal(elements.get("debugAddCreep").disabled,true);assert.equal(elements.get("debugAddBaseResources").disabled,true);assert.equal(elements.get("debugAddResearchPoints").disabled,true);
  });
});
