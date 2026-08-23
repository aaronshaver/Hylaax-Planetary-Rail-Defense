"use strict";

const assert = require("node:assert/strict");
const { describe, test, beforeEach } = require("node:test");
const { api, elements, moveTrain, makeEnemy, addTestTrain, performance } = require("./harness.js");

beforeEach(() => { api.reset(); });

describe("Hive and defense behavior", () => {
  test("Hive expansion unlocks only one Fibonacci level at a time", () => {
    const hive2 = { level: 2 };
    const hive3 = { level: 3 };
    const hive5 = { level: 5 };
    assert.equal(api.hiveExpansionLevel(hive2, 179), 2);
    assert.equal(api.hiveExpansionLevel(hive2, 180), 3);
    assert.equal(api.hiveExpansionLevel(hive3, 300), 5);
    assert.equal(api.hiveExpansionLevel(hive5, 301), 5);
    assert.equal(api.hiveExpansionLevel(hive5, 480), 8);
  });

  test("an original Hive's first Creep batch receives one shared 1–15 second delay", () => {
    const state = api.state;
    state.hives.clear();
    state.enemies = [];
    const hive = api.createHive(2, 2, 2, true, true);
    hive.nextSpawnAt = 0;

    api.updateHives();

    assert.equal(state.hives.size, 1);
    assert.equal(state.enemies.length, 0);
    assert.equal(state.creepSpawnQueue.length, 1);
    assert.equal(state.creepSpawnQueue[0].count, 2);
    assert.ok(state.creepSpawnQueue.every(operation => Number.isInteger(operation.delay) && operation.delay >= 1 && operation.delay <= 15));
    assert.ok(state.creepSpawnQueue.every(operation => operation.executeAt === operation.delay));
    assert.equal(hive.forceFirstCreepBatch, false);
    const batchSpawnAt = state.creepSpawnQueue[0].executeAt;
    state.elapsed = batchSpawnAt - .001;
    assert.equal(api.processCreepSpawnQueue(), 0);
    assert.equal(state.enemies.length, 0);
    state.elapsed = batchSpawnAt;
    assert.equal(api.processCreepSpawnQueue(), 1);
    assert.equal(state.enemies.length, 2);
    assert.equal(hive.productionPulseUntil, batchSpawnAt + .75);
  });

  test("a Hive replication queues its child for an independent 1–15 second delay", () => {
    const state = api.state;
    state.elapsed = 180;
    state.nextEncroachmentAt=Infinity;
    state.hives.clear();
    state.enemies = [];
    const hive = api.createHive(2, 2, 2, false, false);
    let spawnNumber = 0;
    while (!api.hiveReplicationRoll(hive, spawnNumber, 2) && spawnNumber < 10000) spawnNumber++;
    assert.ok(spawnNumber < 10000, "could not find a deterministic replication roll");
    hive.spawnCount = spawnNumber;
    hive.nextSpawnAt = 180;

    api.updateHives();

    assert.equal(state.hives.size,1);assert.equal(state.hiveSpawnQueue.length,1);assert.equal(state.enemies.length,0);
    const queued=state.hiveSpawnQueue[0];assert.ok(Number.isInteger(queued.delay)&&queued.delay>=1&&queued.delay<=15);assert.equal(queued.executeAt,180+queued.delay);
    state.elapsed=queued.executeAt-.001;assert.equal(api.processHiveSpawnQueue(),0);assert.equal(state.hives.size,1);
    state.elapsed=queued.executeAt;assert.equal(api.processHiveSpawnQueue(),1);
    assert.equal(state.hives.size, 2);
    const child = [...state.hives.values()].find(candidate => candidate.id !== hive.id);
    assert.equal(child.level, 3);
    assert.equal(hive.productionPulseUntil,state.elapsed+.75);
    assert.ok(api.hexDistance(hive, child) >= 2, "new Hives must have at least one non-Hive hex between them");
  });

  test("simultaneously due Hives operate in randomized order with 50 to 200 ms staggering",()=>{
    const state=api.state;state.hives.clear();state.enemies=[];state.hiveProductionQueue=[];state.hiveProductionAvailableAt=0;state.nextEncroachmentAt=Infinity;state.elapsed=60;
    for(const [q,r] of [[12,0],[0,12],[-12,12]]){const hive=api.createHive(q,r,2,false,true);hive.nextSpawnAt=60;}

    api.updateHives();

    assert.equal(state.hiveProductionQueue.length,2,"only the first due Hive should operate immediately");assert.equal(state.enemies.length,0);assert.equal(state.creepSpawnQueue.length,1);assert.equal(state.creepSpawnQueue[0].count,2);
    const times=state.hiveProductionQueue.map(operation=>operation.executeAt),gaps=[times[0]-60,times[1]-times[0]];
    assert.ok(gaps.every(gap=>gap>=.05-1e-9&&gap<=.2+1e-9),`stagger gaps were ${gaps.join(", ")}`);
    state.elapsed=times[0]-1e-5;assert.equal(api.processHiveProductionQueue(),0);
    state.elapsed=times[0];assert.equal(api.processHiveProductionQueue(),1);assert.equal(state.hiveProductionQueue.length,1);
    state.elapsed=times[1];assert.equal(api.processHiveProductionQueue(),1);assert.equal(state.hiveProductionQueue.length,0);assert.equal(state.enemies.length,0);assert.equal(state.creepSpawnQueue.length,3);assert.ok(state.creepSpawnQueue.every(operation=>operation.count===2));
    assert.ok(state.creepSpawnQueue.every(operation=>Number.isInteger(operation.delay)&&operation.delay>=1&&operation.delay<=15));
    state.elapsed=Math.max(...state.creepSpawnQueue.map(operation=>operation.executeAt));assert.equal(api.processCreepSpawnQueue(),3);assert.equal(state.enemies.length,6);
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

  test("minute-added Hives queue independent 1–15 second delays before appearing",()=>{
    const state=api.state;
    state.hives.clear();state.enemies=[];
    const anchors=api.playerConstructionAnchors();
    state.elapsed=299.99;api.updateHives();
    assert.equal(state.hives.size,0);

    let successfulSeed=0;while(!api.encroachmentOccurs(300,successfulSeed))successfulSeed++;state.mapSeed=successfulSeed;
    state.elapsed=300;api.updateHives();
    assert.equal(state.hives.size,0);assert.equal(state.hiveSpawnQueue.length,1);const queued=state.hiveSpawnQueue[0];assert.ok(Number.isInteger(queued.delay)&&queued.delay>=1&&queued.delay<=15);assert.equal(queued.executeAt,300+queued.delay);
    state.elapsed=queued.executeAt;assert.equal(api.processHiveSpawnQueue(),1);api.updateHives();
    const hive=[...state.hives.values()].find(candidate=>candidate.encroaching);assert.ok(hive);
    assert.equal(hive.level,5);
    assert.equal(hive.encroachmentMinute,5);
    assert.equal(state.enemies.length,0,"the new Level 5 Hive should queue rather than immediately produce its five Creeps");
    assert.equal(state.creepSpawnQueue.length,1);assert.equal(state.creepSpawnQueue[0].count,5);
    assert.ok(state.creepSpawnQueue.every(operation=>Number.isInteger(operation.delay)&&operation.delay>=1&&operation.delay<=15));
    assert.equal(hive.nextSpawnAt,360,"future production stays synchronized to minute boundaries");
    assert.ok(anchors.some(anchor=>{const distance=api.hexDistance(anchor,hive);return distance>=6&&distance<=14;}));
    assert.ok(anchors.every(anchor=>api.hexDistance(anchor,hive)>=api.constants.ENEMY_SPAWN_BUFFER),"a new Hive must respect every construction's safety buffer");
    state.elapsed=state.creepSpawnQueue[0].executeAt;assert.equal(api.processCreepSpawnQueue(),1);assert.equal(state.enemies.length,5);
    assert.ok(state.enemies.every(enemy=>anchors.every(anchor=>api.hexDistance(anchor,enemy)>=api.constants.ENEMY_SPAWN_BUFFER)),"new Creeps must respect every construction's safety buffer");

    const expectedLevels=[[300,5],[360,5],[420,5],[480,8]];
    for(const [time,level] of expectedLevels){
      state.hives.clear();state.elapsed=time;
      state.hiveSpawnQueue=[];const scheduled=api.spawnEncroachingHive(time);
      assert.equal(scheduled.level,level);
      assert.ok(scheduled.delay>=1&&scheduled.delay<=15);
    }
  });

  test("starting at minute five, successful timed batches grow linearly and failed minutes do not carry forward",()=>{
    const state=api.state;state.hives.clear();state.enemies=[];state.nextEncroachmentAt=300;
    for(const time of [60,120,180,240])assert.equal(api.encroachingHiveCount(time),0);
    for(const [time,added] of [[300,1],[360,2],[420,3],[480,4],[540,5],[600,6]])assert.equal(api.encroachingHiveCount(time),added);

    let mixedSeed=0;while(api.encroachmentOccurs(300,mixedSeed)||!api.encroachmentOccurs(360,mixedSeed))mixedSeed++;state.mapSeed=mixedSeed;
    state.elapsed=300;api.updateEncroachingHives();assert.equal(state.hiveSpawnQueue.length,0,"a failed minute-five roll should queue no Hives");assert.equal(state.nextEncroachmentAt,360);
    state.elapsed=360;api.updateEncroachingHives();const scheduled=state.hiveSpawnQueue;
    assert.equal(scheduled.length,2,"minute six should queue only its own two-Hive batch");assert.ok(scheduled.every(operation=>operation.level===5&&operation.encroachmentMinute===6));
    assert.ok(scheduled.every(operation=>Number.isInteger(operation.delay)&&operation.delay>=1&&operation.delay<=15));assert.equal(new Set(scheduled.map(operation=>`${operation.q},${operation.r}`)).size,2);
  });

  test("each timed-Hive minute uses one stable approximately 50 percent event roll",()=>{
    for(const time of [300,360,420]){const outcomes=Array.from({length:1000},(_,seed)=>api.encroachmentOccurs(time,seed)),successes=outcomes.filter(Boolean).length;assert.ok(successes>=400&&successes<=600,`${time/60}-minute success count was ${successes}`);for(let seed=0;seed<100;seed++)assert.equal(api.encroachmentOccurs(time,seed),outcomes[seed]);}
  });

  test("Hive and Creep spawn buffers include live constructions but ignore destroyed objects",()=>{
    const state=api.state;state.tracks.clear();state.structures.clear();state.trains=[];state.ghosts.clear();
    state.tracks.set("8,0",{q:8,r:0,hp:1,maxHp:1,links:new Set()});
    state.structures.set("0,8",{id:"mine-buffer",type:"mine",q:0,r:8,hp:22,maxHp:22});
    state.ghosts.set("-8,0",{id:"-8,0",type:"ghost",objectType:"track",q:-8,r:0,links:[]});

    for(const anchor of [{q:8,r:0},{q:0,r:8}]){
      assert.equal(api.outsidePlayerConstructionBuffer(anchor.q+3,anchor.r),false);
      assert.equal(api.outsidePlayerConstructionBuffer(anchor.q+4,anchor.r),true);
    }
    assert.equal(api.playerConstructionAnchors().some(anchor=>anchor.q===-8&&anchor.r===0),false);
    assert.equal(api.outsidePlayerConstructionBuffer(-8,0),true);
    for(const cell of api.structureFootprint(state.base))assert.equal(api.outsidePlayerConstructionBuffer(cell.q+3,cell.r),false);
    assert.equal(api.outsidePlayerConstructionBuffer(-4,0),true);
  });

  test("mountains and trees block both Turrets and Turret Trains",()=>{
    let blocker=null;
    for(let q=-50;q<=50&&!blocker;q++)for(let r=-50;r<=50&&!blocker;r++)if(["rock","trees"].includes(api.terrainAt(q,r).type))blocker={q,r};
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
    assert.equal(state.particles.length,7);
    assert.ok(state.particles.every(particle=>particle.x===visible.x&&particle.y===visible.y));
    assert.notDeepEqual(visible,api.axialToWorld(enemy.q,enemy.r));
  });
});

describe("enemy navigation", () => {
  test("Hive locations reject isolated ground that Creeps cannot traverse back to the Base",()=>{
    const state=api.state;state.mapSeed=1;
    const isolated={q:16,r:-22};
    assert.equal(api.terrainAt(isolated.q,isolated.r).type,"ground");
    assert.ok(api.neighbors(isolated.q,isolated.r).every(position=>!api.isPassable(position.q,position.r)),"fixture must remain a fully isolated ground hex");
    assert.equal(api.terrainCanReachBase(isolated.q,isolated.r),false);
    assert.equal(api.hiveHexOpen(isolated.q,isolated.r),false);
  });

  test("every initial Hive is placed on terrain connected to the Base",()=>{
    for(const mapSeed of [1,2,3,4,5]){
      api.reset({mapSeed,seedHives:true});
      assert.equal(api.state.hives.size,api.constants.INITIAL_HIVE_COUNT);
      for(const hive of api.state.hives.values())assert.equal(api.terrainCanReachBase(hive.q,hive.r),true,`map ${mapSeed} Hive ${hive.q},${hive.r}`);
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
