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

function findOpenRun(length=5){
  for(let q=-18;q<=18;q++)for(let r=-18;r<=18;r++)for(const [dq,dr] of api.constants.DIRECTIONS){
    const cells=Array.from({length},(_,index)=>({q:q+dq*index,r:r+dr*index}));
    if(cells.every(cell=>api.neutralizerCanTraverse(cell.q,cell.r)))return cells;
  }
  return null;
}

describe("Neutralizer buildings, gates, and ally units",()=>{
  test("a two-hex orange Neutralizer building costs 50 C and 50 E, immediately produces its first ally, and shows the one-time Gate note",()=>{
    const state=api.state,train=addTestTrain(),site=findNeutralizerSite();assert.ok(site);installLiveStop(train,site.stop);state.baseMaterial=200;state.baseEnergy=200;
    const building=api.buildNeutralizer(site.q,site.r);assert.ok(building);
    assert.equal(building.footprint.length,2);assert.equal(building.hp,200);assert.equal(building.maxHp,200);assert.equal(building.material,10);assert.equal(building.energy,10);assert.equal(building.maxMaterial,20);assert.equal(building.maxEnergy,20);assert.equal(state.neutralizers.length,1,"the initial 20 C and 20 E should immediately fund the first ally");assert.match(api.selectionHtml(),/Each produced neutralizer consumes 10 of each resource/);
    assert.equal(state.baseMaterial,150);assert.equal(state.baseEnergy,150);assert.equal(state.paused,true);assert.equal(elements.get("neutralizerGateDialog").hidden,false);
    const html=require("node:fs").readFileSync(require("node:path").join(__dirname,"index.html"),"utf8");assert.match(html,/If you build walls surrounding your base, note that gates can be used to let neutralizers \(blue ally units\) pass through[\s\S]*Creeps cannot pass through gates\./i);
    assert.equal(api.dismissNeutralizerGateNotice(),true);assert.equal(state.paused,false);assert.equal(api.showNeutralizerGateNotice(),false,"the note must appear only once per game");

    const context=elements.get("gameCanvas").context;context.textCalls.length=0;api.drawStructures();const letters=context.textCalls.filter(call=>call.text==="N");assert.equal(letters.length,2);assert.ok(letters.every(call=>call.fillStyle==="#f3f7f8"&&call.font==="900 16.5px ui-monospace, monospace"));
  });

  test("a stopped build/mine train fills both stores and the building spends 10 C and 10 E per ally",()=>{
    const state=api.state,train=addTestTrain(),site=findNeutralizerSite();assert.ok(site);installLiveStop(train,site.stop);state.baseMaterial=200;state.baseEnergy=200;const building=api.buildNeutralizer(site.q,site.r);api.dismissNeutralizerGateNotice();
    state.neutralizers=[];building.material=0;building.energy=0;train.wagons[0].amount=10;train.wagons[1].amount=10;api.updateAutomaticLogistics();
    assert.equal(building.material,10);assert.equal(building.energy,10);assert.ok(state.worldMessages.some(message=>message.message==="Train A: Supplied neutralizer building"));
    api.updateNeutralizerProduction(8.99);assert.equal(state.neutralizers.length,0,"subsequent base production should take nine seconds");
    api.updateNeutralizerProduction(.01);
    assert.equal(state.neutralizers.length,1);assert.equal(building.material,0);assert.equal(building.energy,0);assert.equal(state.neutralizers[0].hp,1);assert.equal(Object.hasOwn(building,"productionPulseUntil"),false);
  });

  test("salvaging returns 50 construction material plus stored C, and stored E but not construction-cost E",()=>{
    const state=api.state,train=addTestTrain(),site=findNeutralizerSite();assert.ok(site);installLiveStop(train,site.stop);state.baseMaterial=200;state.baseEnergy=200;const building=api.buildNeutralizer(site.q,site.r);api.dismissNeutralizerGateNotice();building.material=3;building.energy=4;
    state.particles=[];const materialBefore=state.baseMaterial,energyBefore=state.baseEnergy;api.salvageStructure(building);
    assert.equal(state.baseMaterial,materialBefore+53);assert.equal(state.baseEnergy,energyBefore+4);assert.equal(state.particles.length,16,"both building hexes should receive the salvage effect");
  });

  test("Neutralizers and Creeps shoot each other for one damage per second",()=>{
    const state=api.state,ally=makeNeutralizer("neutralizer-combat",10,10),creep=makeEnemy("enemy-combat",11,10),shotCalls=[],originalShot=api.sounds.shot;state.neutralizers=[ally];state.enemies=[creep];state.hives.clear();api.sounds.shot=()=>shotCalls.push(true);
    try{api.updateNeutralizers(1,()=>0);}finally{api.sounds.shot=originalShot;}assert.equal(state.enemies.length,0);assert.equal(state.creepsNeutralized,1);assert.ok(state.projectiles.some(projectile=>projectile.color==="#48baff"));assert.equal(shotCalls.length,1,"a neutralizer should use the shared fixed-turret firing sound for each shot");

    const nextAlly=makeNeutralizer("neutralizer-target",10,10),nextCreep=makeEnemy("enemy-attacker",11,10),hitCalls=[],originalHit=api.sounds.hit;state.neutralizers=[nextAlly];state.enemies=[nextCreep];api.sounds.hit=()=>hitCalls.push(true);
    try{api.updateEnemies(1);}finally{api.sounds.hit=originalHit;}assert.equal(state.neutralizers.length,0,"an adjacent creep should kill a base one-HP neutralizer");assert.equal(hitCalls.length,0,"Creep shots against Neutralizer allies should not use the building-impact sound");
  });

  test("approaching Creeps and Neutralizers stop in adjacent hexes and fight with a visible beam",()=>{
    const state=api.state;state.hives.clear();state.structures.clear();state.tracks.clear();state.trains=[];
    const ally=makeNeutralizer("neutralizer-approaching",2,0),creep=makeEnemy("enemy-approaching",4,0);state.neutralizers=[ally];state.enemies=[creep];api.resetEnemyNavigation();
    api.updateNeutralizers(api.constants.SIMULATION_STEP);assert.deepEqual({q:ally.toQ,r:ally.toR},{q:3,r:0});
    api.updateEnemies(api.constants.SIMULATION_STEP);assert.equal(creep.progress,1,"the Creep should wait instead of entering or routing around the claimed middle hex");assert.deepEqual({q:creep.q,r:creep.r},{q:4,r:0});
    api.updateNeutralizers(3);assert.deepEqual({q:ally.q,r:ally.r},{q:3,r:0});assert.equal(api.hexDistance(ally,creep),1);
    state.projectiles=[];api.updateEnemies(1);const beam=state.projectiles.at(-1);assert.ok(beam);assert.ok(Math.hypot(beam.x2-beam.x1,beam.y2-beam.y1)>1,"adjacent combat should draw a visibly long beam");
  });

  test("neutralizers seek both Hives and Creeps without any Neutralizer building",()=>{
    const prepare=()=>{api.reset();const state=api.state;state.hives.clear();state.enemies=[];state.structures.clear();state.tracks.clear();state.trains=[];const unit=api.spawnNeutralizerAt(2,0);assert.ok(unit);assert.equal([...state.structures.values()].some(structure=>structure.type==="neutralizer-building"),false);return {state,unit};};
    {
      const {unit}=prepare(),hive=api.createHive(8,0,2);api.advanceSimulation(api.constants.SIMULATION_STEP);assert.ok(unit.progress<1);assert.equal(unit.targetId,hive.id);
    }
    {
      const {state,unit}=prepare(),creep=makeEnemy("enemy-buildingless-target",8,0);state.enemies=[creep];api.advanceSimulation(api.constants.SIMULATION_STEP);assert.ok(unit.progress<1);assert.equal(unit.targetId,creep.id);
    }
  });

  test("destroying the last Neutralizer building does not disable surviving neutralizers",()=>{
    const state=api.state;state.hives.clear();state.enemies=[];state.structures.clear();state.tracks.clear();state.trains=[];
    const building={id:"neutralizer-building-last",type:"neutralizer-building",q:-3,r:0,footprint:[{q:-3,r:0},{q:-3,r:1}],hp:200,maxHp:200,material:0,energy:0,maxMaterial:20,maxEnergy:20,productionClock:0};state.structures.set(api.key(building.q,building.r),building);
    const units=Array.from({length:7},()=>api.spawnNeutralizerAt(2,0));assert.ok(units.every(Boolean));api.damageTarget(building,building.hp);assert.equal([...state.structures.values()].some(structure=>structure.type==="neutralizer-building"),false);
    const hive=api.createHive(8,0,2);api.advanceSimulation(api.constants.SIMULATION_STEP);assert.ok(units.every(unit=>unit.progress<1),"every surviving neutralizer should begin crossing the clear field");assert.ok(units.every(unit=>unit.targetId===hive.id));
  });

  test("blocked early neutralizers cannot monopolize the path budget and freeze allies in open terrain",()=>{
    const state=api.state;state.hives.clear();state.enemies=[];state.structures.clear();state.tracks.clear();state.trains=[];
    const corridor=findOpenRun(8);assert.ok(corridor);let trappedAt=null;
    for(let q=-18;q<=18&&!trappedAt;q++)for(let r=-18;r<=18&&!trappedAt;r++)if(corridor.every(cell=>api.hexDistance({q,r},cell)>2)&&[{q,r},...api.neighbors(q,r)].every(cell=>api.neutralizerCanTraverse(cell.q,cell.r)))trappedAt={q,r};
    assert.ok(trappedAt);const trapped=[makeNeutralizer("neutralizer-trapped-1",trappedAt.q,trappedAt.r,0),makeNeutralizer("neutralizer-trapped-2",trappedAt.q,trappedAt.r,1)],open=makeNeutralizer("neutralizer-open",corridor[0].q,corridor[0].r);
    state.neutralizers=[...trapped,open];for(const cell of api.neighbors(trappedAt.q,trappedAt.r))state.structures.set(api.key(cell.q,cell.r),{id:`wall-${cell.q},${cell.r}`,type:"wall",q:cell.q,r:cell.r,hp:100,maxHp:100});
    const goal=corridor.at(-1);api.createHive(goal.q,goal.r,2);api.createHive(goal.q+1,goal.r,2);
    api.advanceSimulation(api.constants.SIMULATION_STEP*2);
    assert.ok(open.progress<1,"an ally with a clear route should receive a path search on the next tick");
  });

  test("a neutralizer remembers every recently unreachable Hive instead of alternating between two",()=>{
    const state=api.state;state.hives.clear();state.enemies=[];state.structures.clear();let trappedAt=null;
    for(let q=-18;q<=18&&!trappedAt;q++)for(let r=-18;r<=18&&!trappedAt;r++)if([{q,r},...api.neighbors(q,r)].every(cell=>api.neutralizerCanTraverse(cell.q,cell.r)))trappedAt={q,r};
    assert.ok(trappedAt);const unit=makeNeutralizer("neutralizer-failed-targets",trappedAt.q,trappedAt.r);state.neutralizers=[unit];
    for(const cell of api.neighbors(trappedAt.q,trappedAt.r))state.structures.set(api.key(cell.q,cell.r),{id:`wall-${cell.q},${cell.r}`,type:"wall",q:cell.q,r:cell.r,hp:100,maxHp:100});
    for(const position of [{q:trappedAt.q+5,r:trappedAt.r},{q:trappedAt.q,r:trappedAt.r+5},{q:trappedAt.q-5,r:trappedAt.r+5}])api.createHive(position.q,position.r,2);
    const targets=api.neutralizerTargetLookup();for(let attempt=0;attempt<3;attempt++)assert.equal(api.neutralizerNextStep(unit,api.neutralizerSpaceReservations(unit.id),new Map(),targets,{remaining:1}),null);
    assert.equal(Object.keys(unit.failedTargets).length,3,"all three failed targets should remain temporarily excluded");
    assert.equal(api.cachedNeutralizerTarget(unit,targets),null);
  });

  test("future Creep destinations prevent overlap without becoming global pathfinding obstacles",()=>{
    const creep=makeEnemy("enemy-moving-claim",8,0);creep.fromQ=8;creep.fromR=0;creep.toQ=7;creep.toR=0;creep.progress=.5;
    const index=api.unitHexIndex([creep]);assert.equal(api.indexedUnitsAt(index,8,0).includes(creep),true);assert.equal(api.indexedUnitsAt(index,7,0).includes(creep),false,"pathfinding occupancy should contain only the current visible hex");assert.equal(api.indexedUnitsAt(index.destinations,7,0).includes(creep),true,"the local convergence check should retain the destination claim separately");
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

  test("the spatial unit index preserves full narrow-passage pathfinding",()=>{
    const state=api.state;state.hives.clear();state.structures.clear();const corridor=findOpenRun();assert.ok(corridor);
    const start=corridor[0],exit=corridor[1],goal=corridor.at(-1),ally=makeNeutralizer("neutralizer-corridor",start.q,start.r),creep=makeEnemy("enemy-corridor",goal.q,goal.r);
    state.neutralizers=[ally];state.enemies=[creep];
    for(const position of api.neighbors(start.q,start.r))if(api.key(position.q,position.r)!==api.key(exit.q,exit.r))state.structures.set(api.key(position.q,position.r),{id:`wall-${position.q},${position.r}`,type:"wall",q:position.q,r:position.r,hp:100,maxHp:100});
    const next=api.neutralizerNextStep(ally,api.neutralizerSpaceReservations(ally.id),api.unitHexIndex(state.enemies));
    assert.ok(next,"the full pathfinder should find the one-hex exit");assert.equal(api.key(next.q,next.r),api.key(exit.q,exit.r));
  });

  test("neutralizers reuse identical path searches and defer excess unique searches without dropping them",()=>{
    const state=api.state;state.hives.clear();state.structures.clear();const corridor=findOpenRun(8);assert.ok(corridor);const goal=corridor.at(-1),creep=makeEnemy("enemy-batch",goal.q,goal.r);state.enemies=[creep];state.neutralizers=[];
    const enemyIndex=api.unitHexIndex(state.enemies),targets=api.neutralizerTargetLookup(),budget={remaining:2};
    const first=makeNeutralizer("neutralizer-path-1",corridor[0].q,corridor[0].r),second=makeNeutralizer("neutralizer-path-2",corridor[1].q,corridor[1].r),third=makeNeutralizer("neutralizer-path-3",corridor[2].q,corridor[2].r);
    assert.ok(api.neutralizerNextStep(first,new Map(),enemyIndex,targets,budget));assert.ok(api.neutralizerNextStep(second,new Map(),enemyIndex,targets,budget));assert.equal(budget.remaining,0);
    assert.equal(api.neutralizerNextStep(third,new Map(),enemyIndex,targets,budget),false,"a third unique search should wait for another tick");
    const sameStart=makeNeutralizer("neutralizer-path-cache",corridor[0].q,corridor[0].r,1);assert.ok(api.neutralizerNextStep(sameStart,new Map(),enemyIndex,targets,budget),"an identical cached search should not consume the exhausted budget");assert.equal(budget.remaining,0);
    assert.ok(api.neutralizerNextStep(third,new Map(),enemyIndex,targets,{remaining:2}),"the deferred request should run when the next tick replenishes the budget");
    assert.equal(api.constants.NEUTRALIZER_PATH_SEARCHES_PER_TICK,2);
  });
});
