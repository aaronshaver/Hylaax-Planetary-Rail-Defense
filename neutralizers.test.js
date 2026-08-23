"use strict";

const assert=require("node:assert/strict");
const {describe,test,beforeEach}=require("node:test");
const {api,elements,addTestTrain,moveTrain,makeTrack,makeEnemy}=require("./harness.js");

beforeEach(()=>{api.reset();elements.get("neutralizerGateDialog").hidden=true;elements.get("neutralizerGateDialog").classList.add("d-none");});

function findNeutralizerSite(){
  for(let q=-18;q<=18;q++)for(let r=-18;r<=18;r++){
    const footprint=api.neutralizerPlacementFootprint(q,r);if(!footprint||api.distanceToStructure({q,r},api.state.base)<6)continue;
    const stop=api.footprintPerimeter(footprint).find(position=>api.isPassable(position.q,position.r)&&!api.structureAt(position.q,position.r));
    if(stop)return {q,r,footprint,stop};
  }
  return null;
}

function installLiveStop(train,position){
  moveTrain(train,position.q,position.r);api.state.tracks.set(api.key(position.q,position.r),makeTrack(position.q,position.r));train.schedule=[{...position}];train.scheduleComplete=true;train.route=[];train.stepFrom=null;return train;
}

function makeNeutralizer(id,q,r,slot=0){
  const point=api.enemyWorldPosition(q,r,slot),maxHp=api.neutralizerHitPoints();
  return {id,type:"neutralizer",q,r,slot,x:point.x,y:point.y,fromQ:q,fromR:r,fromSlot:slot,toQ:q,toR:r,toSlot:slot,progress:1,moveCount:0,speed:api.constants.NEUTRALIZER_SPEED,hp:maxHp,maxHp,attackClock:0,nextPathAt:0,phase:0};
}

describe("Neutralizer buildings, gates, and ally units",()=>{
  test("a two-hex orange Neutralizer building costs 50 C and 50 E, immediately produces its first ally, and shows the one-time Gate note",()=>{
    const state=api.state,train=addTestTrain(),site=findNeutralizerSite();assert.ok(site);installLiveStop(train,site.stop);state.baseMaterial=200;state.baseEnergy=200;
    const building=api.buildNeutralizer(site.q,site.r);assert.ok(building);
    assert.equal(building.footprint.length,2);assert.equal(building.hp,200);assert.equal(building.maxHp,200);assert.equal(building.material,15);assert.equal(building.energy,15);assert.equal(building.maxMaterial,20);assert.equal(building.maxEnergy,20);assert.equal(state.neutralizers.length,1,"the initial 20 C and 20 E should immediately fund the first ally");assert.match(api.selectionHtml(),/Each produced neutralizer consumes 5 of each resource/);
    assert.equal(state.baseMaterial,150);assert.equal(state.baseEnergy,150);assert.equal(state.paused,true);assert.equal(elements.get("neutralizerGateDialog").hidden,false);
    const html=require("node:fs").readFileSync(require("node:path").join(__dirname,"index.html"),"utf8");assert.match(html,/Note: if you build walls surrounding your base building,[\s\S]*Creeps cannot pass through gates\./i);
    assert.equal(api.dismissNeutralizerGateNotice(),true);assert.equal(state.paused,false);assert.equal(api.showNeutralizerGateNotice(),false,"the note must appear only once per game");

    const context=elements.get("gameCanvas").context;context.textCalls.length=0;api.drawStructures();const letters=context.textCalls.filter(call=>call.text==="N");assert.equal(letters.length,2);assert.ok(letters.every(call=>call.fillStyle==="#f3f7f8"&&call.font==="900 16.5px ui-monospace, monospace"));
  });

  test("a stopped build/mine train fills both stores and the building spends 5 C and 5 E per ally",()=>{
    const state=api.state,train=addTestTrain(),site=findNeutralizerSite();assert.ok(site);installLiveStop(train,site.stop);state.baseMaterial=200;state.baseEnergy=200;const building=api.buildNeutralizer(site.q,site.r);api.dismissNeutralizerGateNotice();
    state.neutralizers=[];building.material=0;building.energy=0;train.wagons[0].amount=10;train.wagons[1].amount=10;api.updateAutomaticLogistics();
    assert.equal(building.material,10);assert.equal(building.energy,10);assert.ok(state.worldMessages.some(message=>message.message==="Train A: Supplied neutralizer building"));
    api.updateNeutralizerProduction(6.99);assert.equal(state.neutralizers.length,0,"subsequent base production should take seven seconds");
    api.updateNeutralizerProduction(.01);
    assert.equal(state.neutralizers.length,1);assert.equal(building.material,5);assert.equal(building.energy,5);assert.equal(state.neutralizers[0].hp,1);assert.equal(Object.hasOwn(building,"productionPulseUntil"),false);
  });

  test("salvaging returns 50 construction material plus stored C, and stored E but not construction-cost E",()=>{
    const state=api.state,train=addTestTrain(),site=findNeutralizerSite();assert.ok(site);installLiveStop(train,site.stop);state.baseMaterial=200;state.baseEnergy=200;const building=api.buildNeutralizer(site.q,site.r);api.dismissNeutralizerGateNotice();building.material=3;building.energy=4;
    state.particles=[];const materialBefore=state.baseMaterial,energyBefore=state.baseEnergy;api.salvageStructure(building);
    assert.equal(state.baseMaterial,materialBefore+53);assert.equal(state.baseEnergy,energyBefore+4);assert.equal(state.particles.length,16,"both building hexes should receive the salvage effect");
  });

  test("Neutralizers and Creeps shoot each other for one damage per second",()=>{
    const state=api.state,ally=makeNeutralizer("neutralizer-combat",10,10),creep=makeEnemy("enemy-combat",11,10),shotCalls=[],originalShot=api.sounds.shot;state.neutralizers=[ally];state.enemies=[creep];state.hives.clear();api.sounds.shot=()=>shotCalls.push(true);
    try{api.updateNeutralizers(1,()=>0);}finally{api.sounds.shot=originalShot;}assert.equal(state.enemies.length,0);assert.equal(state.creepsNeutralized,1);assert.ok(state.projectiles.some(projectile=>projectile.color==="#48baff"));assert.equal(shotCalls.length,1,"a neutralizer should use the shared fixed-turret firing sound for each shot");

    const nextAlly=makeNeutralizer("neutralizer-target",10,10),nextCreep=makeEnemy("enemy-attacker",11,10);state.neutralizers=[nextAlly];state.enemies=[nextCreep];api.updateEnemies(1);assert.equal(state.neutralizers.length,0,"an adjacent creep should kill a base one-HP neutralizer");
  });

  test("simultaneously ready one-HP Creeps and Neutralizers resolve with a 50/50 initiative roll",()=>{
    const state=api.state;
    {
      const allyWinner=makeNeutralizer("ally-winner",10,10),creepLoser=makeEnemy("creep-loser",11,10);
      state.neutralizers=[allyWinner];state.enemies=[creepLoser];state.hives.clear();
      api.updateNeutralizers(1,()=>.49);api.updateEnemies(1);
      assert.equal(state.enemies.length,0);assert.equal(state.neutralizers.length,1,"a roll below 0.5 should let the neutralizer fire first");

      const allyLoser=makeNeutralizer("ally-loser",10,10),creepWinner=makeEnemy("creep-winner",11,10);
      state.neutralizers=[allyLoser];state.enemies=[creepWinner];
      api.updateNeutralizers(1,()=>.5);api.updateEnemies(1);
      assert.equal(state.neutralizers.length,0);assert.equal(state.enemies.length,1,"a roll at or above 0.5 should let the creep fire first");
    }
  });

  test("Neutralizers use seven reserved positions per hex",()=>{
    const state=api.state;state.neutralizers=Array.from({length:7},(_,slot)=>makeNeutralizer(`neutralizer-slot-${slot}`,12,12,slot));const reservations=api.neutralizerSpaceReservations();
    assert.equal(reservations.get("12,12").size,7);assert.equal(api.enemyHexHasRoom(reservations,12,12),false);assert.equal(api.chooseEnemySpaceSlot(reservations,12,12,{id:"neutralizer-eighth",moveCount:0}),null);
  });

  test("Neutralizers use a small center triangle instead of the Creep center circle",()=>{
    const state=api.state,context=elements.get("gameCanvas").context,unit=makeNeutralizer("neutralizer-visual",12,12);state.neutralizers=[unit];context.fillCalls=[];context.scaleCalls=[];api.drawNeutralizers();
    const marker=context.fillCalls.find(call=>call.fillStyle==="#8fd9ff");assert.ok(marker);assert.deepEqual(marker.path.map(step=>step.command),["moveTo","lineTo","lineTo","closePath"]);assert.equal(marker.path.some(step=>step.command==="arc"),false);
    assert.deepEqual(context.scaleCalls.at(-1),{x:api.constants.CREEP_RENDER_SCALE,y:api.constants.CREEP_RENDER_SCALE});const originalPhase=unit.phase;api.updateNeutralizers(.5);assert.equal(unit.phase,originalPhase,"neutralizer visuals should not pulse or flash over time");
  });

  test("Gates match Walls but allow only allied Neutralizers to traverse",()=>{
    const state=api.state,train=addTestTrain(),site=findNeutralizerSite();assert.ok(site);const target=site.footprint[0];installLiveStop(train,site.stop);state.baseMaterial=200;state.baseEnergy=200;const gate=api.buildGate(target.q,target.r);assert.ok(gate);assert.equal(gate.hp,100);assert.equal(state.baseMaterial,170);assert.equal(api.neutralizerCanTraverse(target.q,target.r),true);
    const creep=makeEnemy("gate-attacker",site.footprint[1].q,site.footprint[1].r);state.enemies=[creep];assert.equal(api.adjacentEnemyTarget(creep),gate,"a creep should target the blocking gate instead of passing through it");
    state.structures.clear();const wall={id:"wall-block",type:"wall",q:target.q,r:target.r,hp:100,maxHp:100};state.structures.set(api.key(target.q,target.r),wall);assert.equal(api.neutralizerCanTraverse(target.q,target.r),false);
  });

  test("Track is passable to both sides, remains a Creep attack target, and is ignored as a target by Neutralizers",()=>{
    const state=api.state;state.tracks.clear();state.structures.clear();state.hives.clear();let position=null;for(let q=8;q<18&&!position;q++)for(let r=8;r<18&&!position;r++)if(api.isPassable(q,r))position={q,r};assert.ok(position);
    const track=makeTrack(position.q,position.r);state.tracks.set(api.key(position.q,position.r),track);const creep=api.spawnEnemyAt(position.q,position.r);assert.ok(creep,"a creep may occupy live track");assert.equal(api.adjacentEnemyTarget(creep),track,"a creep on track may attack that track");assert.equal(api.neutralizerCanTraverse(position.q,position.r),true);
    state.enemies=[];assert.equal(api.neutralizerTargets(makeNeutralizer("neutralizer-track",position.q+1,position.r)).includes(track),false);
  });

  test("live player buildings reject allied occupancy while destroyed wreckage can be occupied",()=>{
    const state=api.state,train=addTestTrain(),site=findNeutralizerSite();assert.ok(site);installLiveStop(train,site.stop);const blocker=makeNeutralizer("neutralizer-builder-block",site.q,site.r);state.neutralizers=[blocker];const materialBefore=state.baseMaterial;api.buildGate(site.q,site.r);assert.equal(state.structures.size,0);assert.equal(state.baseMaterial,materialBefore);assert.equal(elements.get("toastStack").children.at(-1).textContent,"Cannot build in a hex occupied by a neutralizer.");
    state.neutralizers=[];state.baseMaterial=200;state.baseEnergy=200;const building=api.buildNeutralizer(site.q,site.r);api.dismissNeutralizerGateNotice();state.particles=[];api.damageTarget(building,building.hp);const ghost=state.ghosts.get(api.key(site.q,site.r));assert.equal(ghost.footprint.length,2);assert.equal(state.particles.length,16,"destruction should affect both building hexes");assert.ok(api.spawnEnemyAt(site.q,site.r),"a creep may occupy a destroyed building hex");
  });
});
