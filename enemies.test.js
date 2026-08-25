"use strict";

const assert = require("node:assert/strict");
const { describe, test, beforeEach } = require("node:test");
const { api, elements, moveTrain, makeEnemy, addTestTrain, performance } = require("./harness.js");

beforeEach(() => { api.reset(); });

describe("Hive and defense behavior", () => {
  test("Hive expansion always creates the parent's fixed lifetime level", () => {
    for(const level of api.constants.HIVE_LEVELS)for(const time of [0,180,480,9999])assert.equal(api.hiveExpansionLevel({level},time),level);
  });

  test("the game starts hive-free and the minute-one Level 1 Hive cycles when it appears",()=>{
    const state=api.reset({mapSeed:12345});
    assert.equal(state.hives.size,0);assert.equal(state.pendingHiveSpawns.length,0);assert.equal(state.enemies.length,0);
    state.elapsed=59.999;api.updateHives();assert.equal(state.hives.size,0);assert.equal(state.pendingHiveSpawns.length,0);
    state.elapsed=60;api.updateHives();assert.equal(state.hives.size,0);assert.equal(state.pendingHiveSpawns.length,1);
    const hiveOperation=state.pendingHiveSpawns[0];assert.equal(hiveOperation.kind,"timed");assert.equal(hiveOperation.level,1);assert.ok(hiveOperation.delaySeconds>=1&&hiveOperation.delaySeconds<=5);
    state.elapsed=hiveOperation.executeAt;api.updateHives();
    const hive=[...state.hives.values()][0];assert.equal(state.hives.size,1);assert.equal(hive.level,1);assert.equal(hive.spawnCount,1);assert.equal(hive.nextSpawnAt,120);assert.equal(state.pendingCreepBatches.length,1);assert.equal(state.enemies.length,0);
    const creepOperation=state.pendingCreepBatches[0];assert.ok(creepOperation.delaySeconds>=1&&creepOperation.delaySeconds<=5);
    state.elapsed=creepOperation.executeAt;api.updateHives();assert.equal(state.enemies.length,1);
  });

  test("a failed expansion roll spawns all 21 Creeps from a capped Level 21 Hive after its delay",()=>{
    const state=api.state;state.hives.clear();state.enemies=[];state.nextEncroachmentAt=Infinity;state.elapsed=60;
    const hive=api.createHive(12,0,34);assert.equal(hive.level,21);let spawnNumber=0;while(api.hiveReplicationRoll(hive,spawnNumber,21)&&spawnNumber<10000)spawnNumber++;
    const delay=api.creepSpawnDelaySeconds(hive,spawnNumber,60);hive.spawnCount=spawnNumber;hive.nextSpawnAt=60;api.updateHives();
    state.elapsed=60+delay;api.updateHives();
    assert.equal(state.hives.size,1);assert.equal(state.enemies.length,21);assert.equal(hive.productionPulseUntil,60+delay+.75);
  });

  test("a queued Creep batch is canceled when its source Hive is destroyed during the delay",()=>{
    const state=api.state;state.hives.clear();state.enemies=[];state.nextEncroachmentAt=Infinity;state.elapsed=60;
    const hive=api.createHive(12,0,1);let spawnNumber=0;
    while(api.creepSpawnDelaySeconds(hive,spawnNumber,60)===0&&spawnNumber<10000)spawnNumber++;
    const delay=api.creepSpawnDelaySeconds(hive,spawnNumber,60);assert.ok(delay>=1&&delay<=5);
    hive.spawnCount=spawnNumber;hive.nextSpawnAt=60;api.updateHives();assert.equal(state.pendingCreepBatches.length,1);
    api.damageTarget(hive,1);state.elapsed=60+delay;api.updateHives();
    assert.equal(state.hives.size,0);assert.equal(state.pendingCreepBatches.length,0);assert.equal(state.enemies.length,0);
  });

  test("a successful expansion queues a non-cancellable same-level Hive that cycles when it appears",()=>{
    const state=api.state;state.hives.clear();state.enemies=[];state.nextEncroachmentAt=Infinity;state.elapsed=480;
    const hive=api.createHive(12,0,3);let spawnNumber=0;while(!api.hiveReplicationRoll(hive,spawnNumber,3)&&spawnNumber<10000)spawnNumber++;
    hive.spawnCount=spawnNumber;hive.nextSpawnAt=480;api.updateHives();assert.equal(state.hives.size,1);assert.equal(state.pendingHiveSpawns.length,1);
    const queued=state.pendingHiveSpawns[0];assert.ok(queued.delaySeconds>=1&&queued.delaySeconds<=5);api.damageTarget(hive,hive.hp);state.elapsed=queued.executeAt;api.updateHives();
    assert.ok(state.hives.size>=1);assert.equal(state.enemies.length,0);
    const child=[...state.hives.values()].find(candidate=>candidate.sourceHiveId===hive.id);assert.ok(child);assert.equal(child.level,3);assert.equal(child.spawnCount,1);assert.equal(child.nextSpawnAt,540);assert.ok(api.hexDistance(hive,child)>=2&&api.hexDistance(hive,child)<=4);
  });

  test("all Hives due at a minute boundary execute during that boundary without staggering",()=>{
    const state=api.state;state.hives.clear();state.enemies=[];state.nextEncroachmentAt=Infinity;state.elapsed=60;
    for(const [q,r] of [[12,0],[0,12],[-12,12]]){const hive=api.createHive(q,r,2);let spawnNumber=0;while(api.hiveReplicationRoll(hive,spawnNumber,2))spawnNumber++;hive.spawnCount=spawnNumber;hive.nextSpawnAt=60;}
    api.updateHives();
    state.elapsed=65;api.updateHives();
    assert.equal(state.enemies.length,6);
  });

  test("Hive expansion prefers 2-4 hexes but continues outward through 7",()=>{
    const state=api.state;state.hives.clear();state.hiveBlockedLand.clear();state.nextEncroachmentAt=Infinity;state.elapsed=60;
    const hive=api.createHive(12,0,3);let spawnNumber=0;while(!api.hiveReplicationRoll(hive,spawnNumber,3)&&spawnNumber<10000)spawnNumber++;
    for(const candidate of api.hiveSpawnCandidates(hive,spawnNumber))if(candidate.distance<=4)state.hiveBlockedLand.add(api.key(candidate.q,candidate.r));
    const child=api.spawnHiveNear(hive,spawnNumber,3);assert.ok(child);assert.ok(api.hexDistance(hive,child)>=5&&api.hexDistance(hive,child)<=7);
  });

  test("a successful expansion roll falls back to the delayed Creep batch when no Hive hex exists through distance 7",()=>{
    const state=api.state;state.hives.clear();state.enemies=[];state.hiveBlockedLand.clear();state.nextEncroachmentAt=Infinity;state.elapsed=60;
    const hive=api.createHive(12,0,3);let spawnNumber=0;while(!api.hiveReplicationRoll(hive,spawnNumber,3)&&spawnNumber<10000)spawnNumber++;
    for(const candidate of api.hiveSpawnCandidates(hive,spawnNumber))state.hiveBlockedLand.add(api.key(candidate.q,candidate.r));
    const delay=api.creepSpawnDelaySeconds(hive,spawnNumber,60);hive.spawnCount=spawnNumber;hive.nextSpawnAt=60;api.updateHives();
    assert.equal(state.hives.size,1);state.elapsed=60+delay;api.updateHives();assert.equal(state.enemies.length,3);
  });

  test("Turrets prioritize a Hive over a closer Creep", () => {
    const state = api.state;
    const turret = { id: "turret-defense", type: "turret", q: 5, r: 0, hp: 18, maxHp: 18, energy: 3, maxEnergy: 20, cooldown: 0 };
    const hive = api.createHive(8, 0, 2, false, false);
    const enemy = makeEnemy("enemy-near", 5, 1);
    state.structures.set(api.key(turret.q, turret.r), turret);
    state.enemies = [enemy];

    api.updateStructures(0.5);

    assert.equal(hive.hp, 1);
    assert.equal(state.enemies.length, 1);
    assert.equal(turret.energy, 2);
  });

  test("fixed Turrets fire once per second for one damage and one Energy",()=>{
    const state=api.state;state.hives.clear();state.enemies=[];
    const turret={id:"turret-cadence",type:"turret",q:5,r:0,hp:18,maxHp:18,energy:3,maxEnergy:20,cooldown:0};state.structures.set("5,0",turret);
    const hive=api.createHive(6,0,13,false,false);

    api.updateStructures(0);
    assert.equal(hive.hp,12);assert.equal(turret.energy,2);assert.equal(turret.cooldown,1);
    api.updateStructures(.99);assert.equal(hive.hp,12);assert.equal(turret.energy,2);
    api.updateStructures(.01);assert.equal(hive.hp,11);assert.equal(turret.energy,1);
  });

  test("the first Turret or Artillery to run out of Energy pauses for one shared warning only",()=>{
    const state=api.state;state.hives.clear();state.enemies=[];state.structures.clear();
    const turret={id:"turret-empty-warning",type:"turret",q:5,r:0,hp:18,maxHp:18,energy:1,maxEnergy:20,cooldown:0};state.structures.set("5,0",turret);
    const hive=api.createHive(6,0,2,false,false);
    api.updateStructures(0);
    assert.equal(turret.energy,0);assert.equal(hive.hp,1);assert.equal(state.turretEnergyWarningShown,true);assert.equal(state.paused,true);assert.equal(elements.get("turretEnergyDialog").hidden,false);
    assert.equal(api.dismissTurretEnergyWarning(),true);assert.equal(state.paused,false);assert.equal(elements.get("turretEnergyDialog").hidden,true);
    turret.energy=1;turret.cooldown=0;api.updateStructures(0);
    assert.equal(turret.energy,0);assert.equal(elements.get("turretEnergyDialog").hidden,true,"later empty Turrets must not repeat the modal");
  });

  test("zero C or E can show one low-resource warning at five minutes, but never earlier or twice",()=>{
    const state=api.state;state.baseMaterial=300;state.baseEnergy=0;state.elapsed=299.999;
    assert.equal(api.showLowBaseResourceWarning(),false);assert.equal(state.lowBaseResourceWarningShown,false);assert.equal(elements.get("lowBaseResourceDialog").hidden,true);
    state.elapsed=300;assert.equal(api.showLowBaseResourceWarning(),true);assert.equal(state.lowBaseResourceWarningShown,true);assert.equal(state.paused,true);assert.equal(elements.get("lowBaseResourceDialog").hidden,false);
    assert.equal(api.dismissLowBaseResourceWarning(),true);assert.equal(state.paused,false);assert.equal(elements.get("lowBaseResourceDialog").hidden,true);
    state.baseEnergy=300;state.baseMaterial=0;assert.equal(api.showLowBaseResourceWarning(),false,"the warning is once per run even if the other resource later reaches zero");
  });

  test("Artillery can trigger the shared one-time Energy warning before a Turret",()=>{
    const state=api.state;state.hives.clear();state.structures.clear();
    const artillery={id:"artillery-empty-warning",type:"artillery",q:0,r:0,hp:36,maxHp:36,energy:10,maxEnergy:50,cooldown:0};state.structures.set("0,0",artillery);api.createHive(3,0,20);
    api.updateStructures(0);
    assert.equal(artillery.energy,0);assert.equal(state.turretEnergyWarningShown,true);assert.equal(elements.get("turretEnergyDialog").hidden,false);
    api.dismissTurretEnergyWarning();
    const turret={id:"turret-later-warning",type:"turret",q:2,r:0,hp:20,maxHp:20,energy:1,maxEnergy:20,cooldown:0};state.structures.set("2,0",turret);api.updateStructures(0);
    assert.equal(elements.get("turretEnergyDialog").hidden,true);
  });

  test("Turret shots use mellow low-gain triangle and sine tones",()=>{
    const calls=[],originalTone=api.sounds.tone;api.sounds.tone=(...args)=>calls.push(args);api.sounds.lastShot=-Infinity;
    try{api.sounds.shot();assert.deepEqual(calls.map(call=>call[2]),["triangle","sine"]);assert.ok(calls.every(call=>call[0]<500&&call[3]<=.018));}
    finally{api.sounds.tone=originalTone;}
  });

  test("an Artillery shell makes its own soft low thud once when it lands",()=>{
    const state=api.state,calls=[],originalImpact=api.sounds.artilleryImpact,originalTone=api.sounds.tone,originalHit=api.sounds.hit;let sharedHits=0;
    api.sounds.tone=(...args)=>calls.push(args);api.sounds.artilleryImpact=originalImpact;api.sounds.hit=()=>sharedHits++;
    try{
      api.createHive(8,0,13);
      state.projectiles=[{kind:"artillery-shell",centerQ:8,centerR:0,life:.1,maxLife:.7}];
      api.updateProjectiles(.05);assert.equal(calls.length,0,"the thud must not play while the shell is airborne");
      api.updateProjectiles(.05);assert.equal(calls.length,2);assert.equal(sharedHits,0,"Artillery impact must not layer in the shared hit sound");assert.ok(calls.every(call=>call[0]<=72&&call[3]<=.016));
      api.updateProjectiles(1);assert.equal(calls.length,2,"the impact must sound only once");
    }finally{api.sounds.artilleryImpact=originalImpact;api.sounds.tone=originalTone;api.sounds.hit=originalHit;}
  });

  test("Artillery lobs at Hives every three seconds for 10 Energy with delayed 8 center and 5 adjacent damage and no friendly fire",()=>{
    const state=api.state;state.hives.clear();state.enemies=[];state.structures.clear();state.trains=[];
    const artillery={id:"artillery-defense",type:"artillery",q:0,r:0,hp:36,maxHp:36,energy:40,maxEnergy:40,cooldown:0};
    const friendlyWall={id:"friendly-wall",type:"wall",q:8,r:-1,hp:100,maxHp:100};
    state.structures.set("0,0",artillery);state.structures.set("8,-1",friendlyWall);
    const friendlyTrain=addTestTrain();moveTrain(friendlyTrain,9,-1);
    const centerHive=api.createHive(8,0,13,false,false),splashHive=api.createHive(9,0,13,false,false),outerHive=api.createHive(10,0,13,false,false);
    const centerCreep=makeEnemy("enemy-center",8,0),splashCreep=makeEnemy("enemy-splash",8,1);centerCreep.hp=centerCreep.maxHp=10;splashCreep.hp=splashCreep.maxHp=10;state.enemies=[centerCreep,splashCreep];

    api.updateStructures(0);

    assert.equal(centerHive.hp,13);assert.equal(splashHive.hp,13,"damage waits for the shell to land");
    assert.equal(state.projectiles.at(-1).kind,"artillery-shell");assert.equal(artillery.energy,30);assert.equal(artillery.cooldown,3);

    api.updateStructures(api.constants.ARTILLERY_SHELL_FLIGHT_SECONDS);

    assert.equal(centerHive.hp,5);assert.equal(splashHive.hp,8);assert.equal(outerHive.hp,12);
    assert.equal(centerCreep.hp,2);assert.equal(splashCreep.hp,5);
    assert.equal(friendlyWall.hp,100);assert.equal(friendlyTrain.hp,50);
    assert.equal(artillery.energy,30);assert.equal(state.projectiles.at(-1).kind,"artillery-blast");assert.equal(state.projectiles.at(-1).maxLife,.75);

    api.updateStructures(2.29);assert.equal(centerHive.hp,5);assert.equal(artillery.energy,30);
    api.updateStructures(.01);assert.equal(centerHive.hp,5);assert.equal(artillery.energy,20);assert.equal(state.projectiles.at(-1).kind,"artillery-shell");
    api.updateStructures(api.constants.ARTILLERY_SHELL_FLIGHT_SECONDS-.01);assert.equal(state.hives.has(api.key(8,0)),false);
  });

  test("Artillery never targets Creeps directly",()=>{
    const state=api.state;state.hives.clear();state.enemies=[makeEnemy("artillery-only-creep",5,0)];state.structures.clear();
    const artillery={id:"artillery-hive-only",type:"artillery",q:0,r:0,hp:36,maxHp:36,energy:40,maxEnergy:40,cooldown:0};state.structures.set("0,0",artillery);

    assert.equal(api.fireArtillery(artillery),false);
    assert.equal(artillery.energy,40);assert.equal(state.projectiles.length,0);assert.equal(state.enemies.length,1);
  });

  test("Turret Trains can hit Hives at range 6", () => {
    const state = api.state;
    const train = addTestTrain();
    train.trainType = "combat";
    train.wagons = [train.wagons[1]];
    train.wagons[0].amount = 5;
    moveTrain(train, 0, 0);
    train.combatCooldown = 0;
    const hive = api.createHive(6, 0, 2, false, false);

    api.updateCombatTrains(0.5);

    assert.equal(hive.hp, 1);
    assert.equal(train.wagons[0].amount, 4);
    assert.equal(api.constants.COMBAT_TRAIN_RANGE, 6);
  });

  test("timed additions use the current Fibonacci time level for both level and count, capped at 21",()=>{
    const levels=[[0,0],[1,1],[2,2],[3,3],[4,3],[5,5],[8,8],[13,13],[14,13],[20,13],[21,21],[22,21],[189,21]];
    for(const [minute,level] of levels)assert.equal(api.hiveUnlockedLevel(minute*60),level,`minute ${minute} level`);
    const counts=[[0,0],[1,1],[2,2],[3,3],[4,3],[5,5],[8,8],[13,13],[14,13],[20,13],[21,21],[22,21],[189,21]];
    for(const [minute,count] of counts)assert.equal(api.encroachingHiveCount(minute*60),count,`minute ${minute} count`);
  });

  test("timed Hives appear at the minute boundary and immediately perform their first cycle",()=>{
    const state=api.state;state.hives.clear();state.enemies=[];state.nextEncroachmentAt=120;const anchors=api.playerConstructionAnchors();
    state.elapsed=119.999;api.updateHives();assert.equal(state.hives.size,0);
    state.elapsed=120;api.updateHives();assert.equal(state.pendingHiveSpawns.filter(operation=>operation.kind==="timed").length,2);state.elapsed=125;api.updateHives();const timed=[...state.hives.values()].filter(hive=>hive.encroachmentMinute===2);assert.equal(timed.length,2);assert.equal(state.enemies.length,0);
    for(const hive of timed){
      assert.equal(hive.level,2);assert.equal(hive.spawnCount,1);assert.equal(hive.nextSpawnAt,180);
      assert.ok(anchors.some(anchor=>{const distance=api.hexDistance(anchor,hive);return distance>=7&&distance<=20;}));assert.ok(anchors.every(anchor=>api.hexDistance(anchor,hive)>=api.constants.ENEMY_SPAWN_BUFFER));
    }
  });

  test("each timed addition phase adds its entire configured batch without a chance roll",()=>{
    const state=api.state;state.hives.clear();state.enemies=[];state.nextEncroachmentAt=300;state.elapsed=300;api.updateEncroachingHives();assert.equal(state.pendingHiveSpawns.filter(operation=>operation.kind==="timed").length,5);
    state.elapsed=305;api.runPendingHiveSpawns();const timed=[...state.hives.values()].filter(hive=>hive.encroachmentMinute===5);assert.equal(timed.length,5);assert.ok(timed.every(hive=>hive.level===5&&hive.spawnCount===1&&hive.nextSpawnAt===360));assert.equal(state.nextEncroachmentAt,360);
  });

  test("Hive and Creep spawn buffers include live constructions but ignore destroyed objects",()=>{
    const state=api.state;state.tracks.clear();state.structures.clear();state.trains=[];state.ghosts.clear();
    state.tracks.set("8,0",{q:8,r:0,hp:1,maxHp:1,links:new Set()});
    state.structures.set("0,8",{id:"mine-buffer",type:"mine",q:0,r:8,hp:22,maxHp:22});
    state.structures.set("9,9",{id:"destroyed-mine",type:"mine",q:9,r:9,hp:0,maxHp:22});
    state.ghosts.set("-8,0",{id:"-8,0",type:"ghost",objectType:"track",q:-8,r:0,links:[]});

    for(const anchor of [{q:8,r:0},{q:0,r:8}]){
      assert.equal(api.outsidePlayerConstructionBuffer(anchor.q+3,anchor.r),false);
      assert.equal(api.outsidePlayerConstructionBuffer(anchor.q+4,anchor.r),true);
    }
    assert.equal(api.playerConstructionAnchors().some(anchor=>anchor.q===-8&&anchor.r===0),false);
    assert.equal(api.playerConstructionAnchors().some(anchor=>anchor.q===9&&anchor.r===9),false);
    assert.equal(api.outsidePlayerConstructionBuffer(-8,0),true);
    for(const cell of api.structureFootprint(state.base))assert.equal(api.outsidePlayerConstructionBuffer(cell.q+3,cell.r),false);
    assert.equal(api.outsidePlayerConstructionBuffer(-4,0),true);
  });

  test("mountains block both Turrets and Turret Trains",()=>{
    let blocker=null;
    for(let q=-50;q<=50&&!blocker;q++)for(let r=-50;r<=50&&!blocker;r++)if(api.terrainAt(q,r).type==="rock")blocker={q,r};
    assert.ok(blocker);
    const start={q:blocker.q-1,r:blocker.r},target={q:blocker.q+1,r:blocker.r};
    assert.equal(api.hasClearShot(start,target),false);

    const state=api.state;state.hives.clear();state.enemies=[];
    const turret={id:"blocked-turret",type:"turret",...start,hp:18,maxHp:18,energy:3,maxEnergy:20,cooldown:0};
    state.structures.set(api.key(start.q,start.r),turret);
    const hive=api.createHive(target.q,target.r,2,false,false);
    api.updateStructures(.5);
    assert.equal(hive.hp,2);assert.equal(turret.energy,3);

    state.structures.clear();
    const train=addTestTrain("combat");moveTrain(train,start.q,start.r);train.wagons[0].amount=3;train.combatCooldown=0;
    api.updateCombatTrains(.5);
    assert.equal(hive.hp,2);assert.equal(train.wagons[0].amount,3);
  });

  test("trees no longer block Turret fire",()=>{let tree=null;for(let q=-50;q<=50&&!tree;q++)for(let r=-50;r<=50&&!tree;r++)if(api.terrainAt(q,r).type==="trees")tree={q,r};assert.ok(tree);assert.equal(api.hasClearShot({q:tree.q-1,r:tree.r},{q:tree.q+1,r:tree.r}),true);});

  test("Creeps and Neutralizers expire after two minutes with their normal thin death X",()=>{
    const state=api.state;state.hives.clear();let first=null,second=null;for(let q=8;q<30&&!second;q++)for(let r=-10;r<20&&!second;r++)if(api.isPassable(q,r)&&!api.structureAt(q,r)){if(!first)first={q,r};else if(api.hexDistance(first,{q,r})>1)second={q,r};}
    const creep=api.spawnEnemyAt(first.q,first.r),ally=api.spawnNeutralizerAt(second.q,second.r);assert.ok(creep&&ally);state.elapsed=89.999;assert.equal(api.expireCreeps(),0);assert.equal(api.expireNeutralizers(),0);state.elapsed=90;assert.equal(api.expireCreeps(),1);assert.equal(api.expireNeutralizers(),1);assert.equal(state.enemies.length,0);assert.equal(state.neutralizers.length,0);assert.ok(state.projectiles.some(item=>item.kind==="creep-death-x"));assert.ok(state.projectiles.some(item=>item.kind==="neutralizer-death-x"));
  });

  test("water is traversable at double path cost and half departure speed",()=>{
    let water=null;for(let q=-50;q<=50&&!water;q++)for(let r=-50;r<=50&&!water;r++)if(api.terrainAt(q,r).type==="water")water={q,r};assert.ok(water);assert.equal(api.unitCanTraverse(water.q,water.r),true);assert.equal(api.unitTraversalCost(water.q,water.r),2);
    const state=api.state;state.hives.clear();state.structures.clear();state.tracks.clear();const creep=api.spawnEnemyAt(water.q,water.r)||(()=>{const point=api.enemyWorldPosition(water.q,water.r,0),unit={id:"enemy-water",type:"enemy",...water,slot:0,x:point.x,y:point.y,fromQ:water.q,fromR:water.r,fromSlot:0,toQ:water.q+1,toR:water.r,toSlot:0,progress:0,moveCount:0,speed:api.constants.ENEMY_SPEED,hp:1,maxHp:1,bornAt:0,attackClock:0,nextPathAt:0,phase:0};state.enemies=[unit];return unit;})();creep.fromQ=water.q;creep.fromR=water.r;creep.toQ=water.q+1;creep.toR=water.r;creep.progress=0;api.updateEnemies(1);assert.ok(Math.abs(creep.progress-api.constants.ENEMY_SPEED/2)<1e-9);
  });

  test("water does not block a clear shot",()=>{
    let water=null;
    for(let q=-50;q<=50&&!water;q++)for(let r=-50;r<=50&&!water;r++)if(api.terrainAt(q,r).type==="water")water={q,r};
    assert.ok(water);
    assert.equal(api.hasClearShot({q:water.q-1,r:water.r},{q:water.q+1,r:water.r}),true);
  });

  test("a moving Creep's death burst uses its visible position instead of its previous tile",()=>{
    const state=api.state;state.hives.clear();state.enemies=[];state.particles=[];
    const turret={id:"death-position-turret",type:"turret",q:5,r:0,hp:18,maxHp:18,energy:1,maxEnergy:20,cooldown:0};
    const enemy=makeEnemy("enemy-moving",7,0),visible=api.axialToWorld(6,0);
    enemy.x=visible.x;enemy.y=visible.y;enemy.progress=.5;
    state.structures.set(api.key(turret.q,turret.r),turret);state.enemies=[enemy];

    api.updateStructures(0);

    assert.equal(state.enemies.length,0);
    assert.equal(state.particles.length,0);
    const deathFlash=state.projectiles.find(projectile=>projectile.kind==="creep-death-x");assert.ok(deathFlash);assert.equal(deathFlash.x,visible.x);assert.equal(deathFlash.y,visible.y);assert.equal(deathFlash.color,"#ff4354");
    assert.notDeepEqual(visible,api.axialToWorld(enemy.q,enemy.r));
  });
});

describe("enemy navigation", () => {
  test("Hive locations reject isolated land that Creeps cannot traverse back to the Base",()=>{
    const state=api.state;state.mapSeed=1;
    const isolated={q:16,r:-22};
    assert.equal(api.terrainAt(isolated.q,isolated.r).type,"land");
    assert.ok(api.neighbors(isolated.q,isolated.r).every(position=>!api.isPassable(position.q,position.r)),"fixture must remain a fully isolated land hex");
    assert.equal(api.terrainCanReachBase(isolated.q,isolated.r),false);
    assert.equal(api.hiveHexOpen(isolated.q,isolated.r),false);
  });

  test("the first timed Hive is placed on terrain connected to the Base",()=>{
    for(const mapSeed of [1,2,3,4,5]){
      const state=api.reset({mapSeed});state.elapsed=60;api.updateHives();
      assert.equal(state.pendingHiveSpawns.length,1);state.elapsed=state.pendingHiveSpawns[0].executeAt;api.updateHives();
      assert.equal(state.hives.size,1);
      for(const hive of state.hives.values())assert.equal(api.terrainCanReachBase(hive.q,hive.r),true,`map ${mapSeed} Hive ${hive.q},${hive.r}`);
    }
  });

  test("destroying any Train part names it as Destroyed, plays three low tones, and shakes the map",()=>{
    const state=api.state,train=addTestTrain("combat"),toastStack=require("./harness.js").elements.get("toastStack"),toneCalls=[];
    const originalTone=api.sounds.tone;api.sounds.tone=(...args)=>toneCalls.push(args);
    try{
      api.damageTarget(train.wagons[0],train.wagons[0].hp);
      assert.equal(toastStack.children.at(-1).textContent,"Turret train A: energy supply destroyed.");
      assert.equal(train.wagons.length,0);assert.equal(toneCalls.length,3);assert.deepEqual(toneCalls.map(call=>call[0]),[105,82,62]);
      assert.equal(state.screenShakeUntil,api.constants.TRAIN_LOSS_SHAKE_SECONDS);
      assert.notDeepEqual(api.screenShakeOffset(),{x:0,y:0});

      state.elapsed=.5;api.damageTarget(train,train.hp);
      assert.equal(toastStack.children.at(-1).textContent,"Turret train A: locomotive destroyed.");
      assert.equal(state.trains.includes(train),false);assert.equal(toneCalls.length,6);
      assert.equal(state.screenShakeUntil,.5+api.constants.TRAIN_LOSS_SHAKE_SECONDS);
    }finally{api.sounds.tone=originalTone;}
  });

  test("Creeps treat Walls as attackable blocking structures",()=>{
    const state=api.state;state.hives.clear();state.structures.clear();state.tracks.clear();state.trains=[];
    const wall={id:"wall-defense",type:"wall",q:5,r:0,hp:100,maxHp:100};state.structures.set("5,0",wall);
    state.enemies=[makeEnemy("enemy-wall",6,0)];

    api.updateEnemies(1);

    assert.equal(wall.hp,99);assert.equal(state.projectiles.length,1);
  });

  test("a Creep fires once per second and each shot deals one HP",()=>{
    const state=api.state;state.hives.clear();state.structures.clear();state.tracks.clear();state.trains=[];state.enemies=[makeEnemy("enemy-attacker",1,0)];state.projectiles=[];
    state.base.hp=100;

    api.updateEnemies(.5);api.updateEnemies(.49);
    assert.equal(state.base.hp,100);assert.equal(state.projectiles.length,0);

    api.updateEnemies(.01);
    assert.equal(state.base.hp,99);assert.equal(state.projectiles.length,1);

    api.updateEnemies(1);
    assert.equal(state.base.hp,98);assert.equal(state.projectiles.length,2);
    assert.equal(api.constants.CREEP_ATTACK_INTERVAL,1);assert.equal(api.constants.CREEP_ATTACK_DAMAGE,1);
  });

  test("Creep attacks against player-built structures keep their impact sound",()=>{
    const state=api.state;state.hives.clear();state.structures.clear();state.tracks.clear();state.trains=[];const wall={id:"wall-sound",type:"wall",q:5,r:0,hp:100,maxHp:100};state.structures.set("5,0",wall);state.enemies=[makeEnemy("enemy-wall-sound",6,0)];
    const hitCalls=[],originalHit=api.sounds.hit;api.sounds.hit=()=>hitCalls.push(true);
    try{api.updateEnemies(1);}finally{api.sounds.hit=originalHit;}
    assert.equal(wall.hp,99);assert.equal(hitCalls.length,1);
  });

  test("combat beam rendering is capped independently at 25 per side",()=>{
    const state=api.state;state.projectiles=[];const beam={x1:0,y1:0,x2:10,y2:10,life:.09,maxLife:.09};
    for(let index=0;index<40;index++){api.addCombatBeam("creep-beam",{...beam,color:"#ff3348"});api.addCombatBeam("neutralizer-beam",{...beam,color:"#48baff"});}
    assert.equal(state.projectiles.filter(projectile=>projectile.kind==="creep-beam").length,25);assert.equal(state.projectiles.filter(projectile=>projectile.kind==="neutralizer-beam").length,25);assert.equal(api.constants.COMBAT_BEAM_RENDER_CAP,25);
    api.addUnitDeathFlash("creep-death-x",5,5,"#ff4354");assert.equal(state.projectiles.length,51,"death markers should not consume either beam allowance");
  });

  test("unit death X rendering is capped independently at 25 per side",()=>{
    const state=api.state;state.projectiles=[];
    for(let index=0;index<40;index++){api.addUnitDeathFlash("creep-death-x",index,0,"#ff4354");api.addUnitDeathFlash("neutralizer-death-x",index,10,"#4bbcff");}
    assert.equal(state.projectiles.filter(projectile=>projectile.kind==="creep-death-x").length,25);assert.equal(state.projectiles.filter(projectile=>projectile.kind==="neutralizer-death-x").length,25);assert.equal(api.constants.COMBAT_DEATH_FLASH_RENDER_CAP,25);
    api.addCombatBeam("creep-beam",{x1:0,y1:0,x2:10,y2:10,life:.09,maxLife:.09,color:"#ff3348"});assert.equal(state.projectiles.length,51,"death markers should not consume either beam allowance");
  });

  test("pathfinding can route around an impassable hex", () => {
    const blocked = new Set(["1,0"]);
    const step = api.findEnemyStep({ q: 0, r: 0 }, { q: 4, r: 0 }, (q, r) => !blocked.has(api.key(q, r)));
    assert.ok(step);
    assert.equal(api.hexDistance({ q: 0, r: 0 }, step), 1);
    assert.notEqual(api.key(step.q, step.r), "1,0");
  });

  test("a hex reserves seven distinct Creep positions and rejects an eighth",()=>{
    const state=api.state;state.enemies=[];
    for(let slot=0;slot<api.constants.CREEP_HEX_CAPACITY;slot++)state.enemies.push(makeEnemy(`enemy-${slot+1}`,6,2,slot));
    const reservations=api.enemySpaceReservations();
    assert.equal(reservations.get(api.key(6,2)).size,7);
    assert.equal(api.enemyHexHasRoom(reservations,6,2),false);
    assert.equal(api.chooseEnemySpaceSlot(reservations,6,2,{id:"enemy-99",moveCount:0}),null);

    api.releaseEnemySpace(reservations,6,2,4);
    assert.equal(api.chooseEnemySpaceSlot(reservations,6,2,{id:"enemy-99",moveCount:0}),4);
  });

  test("a Creep falls back to the next-best navigation hex when the best hex is full",()=>{
    const state=api.state;state.tracks.clear();state.structures.clear();state.trains=[];state.enemies=[];
    const mover=makeEnemy("enemy-100",4,0,0),blockers=[];
    for(let slot=0;slot<api.constants.CREEP_HEX_CAPACITY;slot++)blockers.push(makeEnemy(`enemy-${200+slot}`,3,0,slot));
    state.enemies=[mover,...blockers];api.resetEnemyNavigation();api.rebuildEnemyNavigation();
    const next=api.nextEnemyNavigationStep(mover,api.enemySpaceReservations(mover.id));
    assert.ok(next,"a neighboring hex with room should be selected");
    assert.notEqual(api.key(next.q,next.r),api.key(3,0));
    assert.ok(Number.isInteger(next.slot)&&next.slot>=0&&next.slot<7);
  });

  test("unit spatial indexes and reservation maps persist while units change hexes",()=>{
    const state=api.state,enemy=makeEnemy("enemy-persistent-index",8,0,2);state.enemies=[enemy];const firstIndex=api.unitHexIndex(state.enemies),firstReservations=api.enemySpaceReservations();assert.equal(api.indexedUnitsAt(firstIndex,8,0)[0],enemy);assert.equal(firstReservations.get(api.key(8,0)).has(2),true);
    const point=api.enemyWorldPosition(9,0,3);enemy.q=enemy.fromQ=enemy.toQ=9;enemy.r=enemy.fromR=enemy.toR=0;enemy.slot=enemy.fromSlot=enemy.toSlot=3;enemy.x=point.x;enemy.y=point.y;enemy.progress=1;
    const nextIndex=api.unitHexIndex(state.enemies),nextReservations=api.enemySpaceReservations();assert.equal(nextIndex,firstIndex);assert.equal(nextReservations,firstReservations);assert.equal(api.indexedUnitsAt(nextIndex,8,0).length,0);assert.equal(api.indexedUnitsAt(nextIndex,9,0)[0],enemy);assert.equal(nextReservations.get(api.key(9,0)).has(3),true);
  });

  test("600 Creeps share one navigation field and reserve distinct destination hexes", () => {
    const state = api.state;
    state.tracks.clear();
    state.structures.clear();
    state.trains = [];
    state.enemies = [];
    for (let q = -24; q <= 24 && state.enemies.length < 600; q++) {
      for (let r = -24; r <= 24 && state.enemies.length < 600; r++) {
        if (api.hexDistance({ q, r }, state.base) < 6 || !api.isPassable(q, r)) continue;
        state.enemies.push(makeEnemy(`enemy-${state.enemies.length + 1}`, q, r));
      }
    }
    assert.equal(state.enemies.length, 600);
    api.resetEnemyNavigation();
    const initialStart = performance.now();
    api.rebuildEnemyNavigation();
    const initialMs = performance.now() - initialStart;
    const firstStats = api.enemyNavigationStats();

    const steadyStart = performance.now();
    api.ensureEnemyNavigation();
    api.updateEnemies(1 / 60);
    const steadyMs = performance.now() - steadyStart;
    const secondStats = api.enemyNavigationStats();
    const destinationCounts=new Map(),reservedSpaces=[];
    for(const enemy of state.enemies){
      const moving=enemy.progress<1,q=moving?enemy.toQ:enemy.q,r=moving?enemy.toR:enemy.r,slot=moving?enemy.toSlot:enemy.slot,positionKey=api.key(q,r);
      destinationCounts.set(positionKey,(destinationCounts.get(positionKey)||0)+1);reservedSpaces.push(`${positionKey}:${slot}`);
    }

    assert.equal(firstStats.builds, 1);
    assert.equal(secondStats.builds, 1, "steady ticks should reuse the shared navigation field");
    assert.ok([...destinationCounts.values()].every(count=>count<=api.constants.CREEP_HEX_CAPACITY),"no destination hex may exceed seven Creeps");
    assert.equal(new Set(reservedSpaces).size,reservedSpaces.length,"Creeps sharing a hex must reserve different positions");
    console.log(`Shared-navigation stress test: 600 Creeps; ${initialMs.toFixed(1)} ms initial build, ${steadyMs.toFixed(1)} ms steady tick`);
  });
});
