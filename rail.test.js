"use strict";

const assert = require("node:assert/strict");
const { describe, test, beforeEach } = require("node:test");
const { api, elements, moveTrain, makeTrack, addTestTrain } = require("./harness.js");

beforeEach(() => { api.reset(); addTestTrain(); });

describe("repairs, ghosts, and schedules", () => {
  test("a fixed Turret requires non-destroyed Track within three hexes",()=>{
    const state=api.state;state.tracks.clear();state.ghosts.clear();state.structures.clear();
    let target=null;
    for(let q=-10;q<=10&&!target;q++)for(let r=-10;r<=10&&!target;r++)if(api.terrainAt(q,r).type==="ground"&&api.hexDistance({q,r},state.base)>4)target={q,r};
    assert.ok(target);
    const trackPosition={q:target.q+3,r:target.r},trackKey=api.key(trackPosition.q,trackPosition.r);
    state.ghosts.set(trackKey,{id:trackKey,type:"ghost",objectType:"track",...trackPosition,hp:0,maxHp:1,links:[]});
    const materialBefore=state.baseMaterial,energyBefore=state.baseEnergy;

    api.buildTurret(target.q,target.r);

    assert.equal(state.structures.size,0,"destroyed Track must not enable Turret placement");
    assert.equal(state.baseMaterial,materialBefore);assert.equal(state.baseEnergy,energyBefore);

    state.ghosts.clear();state.tracks.set(trackKey,makeTrack(trackPosition.q,trackPosition.r));
    assert.equal(api.liveTrackWithinRange(target),true,"three hexes is allowed");
    assert.equal(api.liveTrackWithinRange({q:target.q-1,r:target.r}),false,"four hexes is outside the limit");
    api.buildTurret(target.q,target.r);

    assert.equal(state.structures.size,1);
    assert.equal([...state.structures.values()][0].type,"turret");
  });

  test("a Wall costs 12 Construction Material and 1 Energy and requires live Track within three hexes",()=>{
    const state=api.state;state.tracks.clear();state.ghosts.clear();state.structures.clear();state.trains=[];
    let target=null;
    for(let q=-12;q<=12&&!target;q++)for(let r=-12;r<=12&&!target;r++)if(api.terrainAt(q,r).type==="ground"&&api.hexDistance({q,r},state.base)>5)target={q,r};
    assert.ok(target);
    const trackPosition={q:target.q+3,r:target.r},trackKey=api.key(trackPosition.q,trackPosition.r),materialBefore=state.baseMaterial,energyBefore=state.baseEnergy;
    state.ghosts.set(trackKey,{id:trackKey,type:"ghost",objectType:"track",...trackPosition,hp:0,maxHp:1,links:[]});

    api.buildWall(target.q,target.r);
    assert.equal(state.structures.size,0,"destroyed Track must not enable Wall placement");
    assert.equal(state.baseMaterial,materialBefore);assert.equal(state.baseEnergy,energyBefore);

    state.ghosts.clear();state.tracks.set(trackKey,makeTrack(trackPosition.q,trackPosition.r));api.buildWall(target.q,target.r);
    const wall=[...state.structures.values()][0];
    assert.equal(wall.type,"wall");assert.equal(wall.hp,100);assert.equal(wall.maxHp,100);
    assert.equal(state.baseMaterial,materialBefore-12);assert.equal(state.baseEnergy,energyBefore-1);
  });

  test("Artillery costs 75 Construction Material and 75 Energy and is built with 36 HP and 40 stored Energy",()=>{
    const state=api.state;state.tracks.clear();state.ghosts.clear();state.structures.clear();state.trains=[];
    state.baseEnergy=150;
    let target=null;
    for(let q=-12;q<=12&&!target;q++)for(let r=-12;r<=12&&!target;r++)if(api.terrainAt(q,r).type==="ground"&&api.hexDistance({q,r},state.base)>5)target={q,r};
    assert.ok(target);
    const trackPosition={q:target.q+3,r:target.r},trackKey=api.key(trackPosition.q,trackPosition.r),materialBefore=state.baseMaterial,energyBefore=state.baseEnergy;
    state.tracks.set(trackKey,makeTrack(trackPosition.q,trackPosition.r));

    api.buildArtillery(target.q,target.r);

    const artillery=[...state.structures.values()][0];
    assert.equal(artillery.type,"artillery");assert.equal(artillery.hp,36);assert.equal(artillery.maxHp,36);
    assert.equal(artillery.energy,40);assert.equal(artillery.maxEnergy,40);
    assert.equal(state.baseMaterial,materialBefore-75);assert.equal(state.baseEnergy,energyBefore-75);
  });

  test("a Train at its own Stop instantly repairs a damaged Wall within three hexes",()=>{
    const state=api.state,train=state.trains[0];moveTrain(train,0,0);train.schedule=[{q:0,r:0}];train.scheduleComplete=true;train.route=[];train.wagons[0].amount=20;
    const wall={id:"damaged-wall",type:"wall",q:0,r:3,hp:80,maxHp:100};state.structures.set(api.key(wall.q,wall.r),wall);

    assert.equal(api.updateAutomaticRepair(train),true);
    assert.equal(wall.hp,100);assert.equal(train.wagons[0].amount,0);
    assert.ok(state.worldMessages.some(item=>item.message==="Train A: Repaired Wall"));

    wall.hp=90;train.wagons[0].amount=10;train.repairHoldUntil=0;train.schedule=[];
    assert.equal(api.updateAutomaticRepair(train),false,"an idle Train that is not at its Stop must not use the extended Wall range");
    assert.equal(wall.hp,90);
  });

  test("automatic repair priority is Track, Base, Turret, Artillery, Mine, then Wall",()=>{
    const state=api.state,train=state.trains[0];moveTrain(train,0,0);train.schedule=[{q:0,r:0}];train.scheduleComplete=true;train.route=[];train.wagons[0].amount=6;
    state.tracks.clear();state.structures.clear();state.base.hp=99;
    const track=makeTrack(1,0);track.hp=0;state.tracks.set("1,0",track);
    const turret={id:"priority-turret",type:"turret",q:0,r:1,hp:17,maxHp:18,energy:0,maxEnergy:20,cooldown:0};
    const artillery={id:"priority-artillery",type:"artillery",q:-1,r:1,hp:35,maxHp:36,energy:0,maxEnergy:40,cooldown:0};
    const mine={id:"priority-mine",type:"mine",resource:"material",q:-1,r:0,hp:21,maxHp:22};
    const wall={id:"priority-wall",type:"wall",q:0,r:-1,hp:99,maxHp:100};
    for(const structure of [turret,artillery,mine,wall])state.structures.set(api.key(structure.q,structure.r),structure);

    const expected=[track,state.base,turret,artillery,mine,wall];
    for(const target of expected){
      const before=target.hp;train.repairHoldUntil=0;
      assert.equal(api.updateAutomaticRepair(train),true);
      assert.equal(target.hp,before+1);
    }
    assert.deepEqual(expected.map(api.repairPriority),[0,1,2,3,4,5]);
  });

  test("destroyed Walls leave rebuildable 100 HP Wall ghosts",()=>{
    const state=api.state,train=state.trains[0];moveTrain(train,0,0);train.wagons[0].amount=12;
    const wall={id:"wall-doomed",type:"wall",q:1,r:0,hp:1,maxHp:100};state.structures.set("1,0",wall);

    api.damageTarget(wall,1);
    assert.equal(state.structures.has("1,0"),false);assert.equal(state.ghosts.get("1,0").objectType,"wall");
    api.updateAutomaticRebuild();
    const rebuilt=state.structures.get("1,0");assert.equal(rebuilt.type,"wall");assert.equal(rebuilt.hp,100);assert.equal(rebuilt.maxHp,100);
  });

  test("destroyed Artillery leaves a rebuildable 36 HP unpowered ghost",()=>{
    const state=api.state,train=state.trains[0];moveTrain(train,0,0);train.wagons[0].amount=30;
    const artillery={id:"artillery-doomed",type:"artillery",q:1,r:0,hp:36,maxHp:36,energy:40,maxEnergy:40,cooldown:0};state.structures.set("1,0",artillery);

    api.damageTarget(artillery,36);
    assert.equal(state.structures.has("1,0"),false);assert.equal(state.ghosts.get("1,0").objectType,"artillery");
    api.updateAutomaticRebuild();
    const rebuilt=state.structures.get("1,0");assert.equal(rebuilt.type,"artillery");assert.equal(rebuilt.hp,36);assert.equal(rebuilt.energy,0);
  });

  test("the player can replace wreckage directly with any construction allowed on its terrain",()=>{
    const cases=[
      {type:"turret",ghostType:"wall",cost:{material:10,energy:5},build:api.buildTurret},
      {type:"wall",ghostType:"artillery",cost:{material:12,energy:1},build:api.buildWall},
      {type:"artillery",ghostType:"turret",cost:{material:75,energy:75},build:api.buildArtillery}
    ];
    for(const item of cases){
      api.reset();const state=api.state;state.tracks.clear();state.structures.clear();state.ghosts.clear();state.trains=[];state.baseMaterial=500;state.baseEnergy=500;
      let target=null;
      for(let q=-15;q<=15&&!target;q++)for(let r=-15;r<=15&&!target;r++)if(api.terrainAt(q,r).type==="ground"&&api.hexDistance({q,r},state.base)>5)target={q,r};
      assert.ok(target);state.tracks.set(api.key(target.q+1,target.r),makeTrack(target.q+1,target.r));
      const ghostKey=api.key(target.q,target.r);state.ghosts.set(ghostKey,{id:ghostKey,type:"ghost",objectType:item.ghostType,...target});
      const materialBefore=state.baseMaterial,energyBefore=state.baseEnergy;item.build(target.q,target.r);
      assert.equal(state.ghosts.has(ghostKey),false,`${item.type} wreckage should be replaced`);
      assert.equal(state.structures.get(ghostKey).type,item.type);
      assert.equal(state.baseMaterial,materialBefore-item.cost.material);assert.equal(state.baseEnergy,energyBefore-item.cost.energy);
    }

    api.reset();const state=api.state;state.tracks.clear();state.structures.clear();state.ghosts.clear();state.trains=[];
    const node=api.resourceNodeAt(7,-2),mineKey=api.key(node.q,node.r);state.tracks.set("6,-2",makeTrack(6,-2));
    state.ghosts.set(mineKey,{id:mineKey,type:"ghost",objectType:"wall",q:node.q,r:node.r});
    const materialBefore=state.baseMaterial;api.buildMine(node.q,node.r);
    assert.equal(state.ghosts.has(mineKey),false);assert.equal(state.structures.get(mineKey).type,"mine");assert.equal(state.baseMaterial,materialBefore-8);
  });

  test("a non-Mine cannot replace wreckage on a Resource Node that still has resources",()=>{
    const state=api.state,node=api.resourceNodeAt(7,-2),nodeKey=api.key(node.q,node.r);state.trains=[];state.structures.clear();state.ghosts.clear();state.tracks.clear();state.baseMaterial=500;state.baseEnergy=500;
    state.tracks.set("6,-2",makeTrack(6,-2));state.ghosts.set(nodeKey,{id:nodeKey,type:"ghost",objectType:"turret",q:node.q,r:node.r});
    const materialBefore=state.baseMaterial,energyBefore=state.baseEnergy;api.buildArtillery(node.q,node.r);
    assert.equal(state.structures.has(nodeKey),false);assert.equal(state.ghosts.has(nodeKey),true);assert.equal(state.baseMaterial,materialBefore);assert.equal(state.baseEnergy,energyBefore);
    api.buildMine(node.q,node.r);assert.equal(state.ghosts.has(nodeKey),false);assert.equal(state.structures.get(nodeKey).type,"mine");
  });

  test("an exhausted Resource Node and its wreckage can be replaced by another construction",()=>{
    const state=api.state,node=api.resourceNodeAt(7,-2),nodeKey=api.key(node.q,node.r);state.trains=[];state.structures.clear();state.ghosts.clear();state.tracks.clear();state.baseMaterial=500;state.baseEnergy=500;
    api.setNodeAmount(node,0);state.tracks.set("6,-2",makeTrack(6,-2));state.ghosts.set(nodeKey,{id:nodeKey,type:"ghost",objectType:"mine",resource:node.resource,q:node.q,r:node.r});
    api.buildArtillery(node.q,node.r);
    assert.equal(state.ghosts.has(nodeKey),false);assert.equal(state.structures.get(nodeKey).type,"artillery");assert.equal(api.terrainAt(node.q,node.r).type,"ground");
  });

  test("Build Track can replace non-Track wreckage without a separate clear action",()=>{
    const state=api.state;state.trains=[];state.tracks.clear();state.ghosts.clear();
    state.tracks.set("0,0",makeTrack(0,0));state.ghosts.set("1,0",{id:"1,0",type:"ghost",objectType:"wall",q:1,r:0});state.trackStart={q:0,r:0};
    api.layTrack(1,0);
    assert.equal(state.ghosts.has("1,0"),false);assert.equal(state.tracks.has("1,0"),true);assert.equal(api.tracksAreLinked({q:0,r:0},{q:1,r:0}),true);
  });

  test("the player can rebuild destroyed Track directly without losing its links",()=>{
    const state=api.state;state.tracks.clear();state.ghosts.clear();
    state.tracks.set("0,0",makeTrack(0,0));state.tracks.set("2,0",makeTrack(2,0));
    const ghost={id:"1,0",type:"ghost",objectType:"track",q:1,r:0,hp:0,maxHp:1,links:["0,0","2,0"]};state.ghosts.set(ghost.id,ghost);
    const materialBefore=state.baseMaterial;api.placeTrackOverGhost(ghost);
    assert.equal(state.ghosts.has("1,0"),false);assert.deepEqual([...state.tracks.get("1,0").links].sort(),["0,0","2,0"]);assert.equal(state.baseMaterial,materialBefore-1);
  });

  test("Salvage/Clear removes destroyed Walls without returning resources",()=>{
    const state=api.state;state.structures.clear();state.ghosts.clear();state.trains=[];
    const wall={id:"wall-to-clear",type:"wall",q:4,r:0,hp:1,maxHp:100};state.structures.set("4,0",wall);api.damageTarget(wall,1);
    const materialBefore=state.baseMaterial,energyBefore=state.baseEnergy;api.setMode("salvage");api.handleHexClick({q:4,r:0});
    assert.equal(state.ghosts.has("4,0"),false);assert.equal(state.baseMaterial,materialBefore);assert.equal(state.baseEnergy,energyBefore);
  });

  test("salvaging healthy Track reports its one Construction Material return",()=>{
    const state=api.state;state.trains=[];state.tracks.clear();
    state.tracks.set("4,0",makeTrack(4,0));const materialBefore=state.baseMaterial;
    api.setMode("salvage");api.handleHexClick({q:4,r:0});
    assert.equal(state.tracks.has("4,0"),false);assert.equal(state.baseMaterial,materialBefore+1);
    assert.equal(elements.get("toastStack").children.at(-1).textContent,"Salvaged 1 Construction Material.");
  });

  test("invalid Salvage/Clear targets use the concise shared message",()=>{
    const state=api.state;api.setMode("salvage");api.handleHexClick({q:state.base.q,r:state.base.r});
    assert.equal(elements.get("toastStack").children.at(-1).textContent,"Cannot Salvage/Clear this type of Object");
  });

  test("Salvage/Clear has no Track-distance limit",()=>{
    const state=api.state;state.tracks.clear();state.structures.clear();state.baseMaterial=0;state.baseEnergy=0;
    const wall={id:"remote-wall",type:"wall",q:20,r:-15,hp:100,maxHp:100};state.structures.set(api.key(wall.q,wall.r),wall);
    api.salvageStructure(wall);
    assert.equal(state.structures.size,0);assert.equal(state.baseMaterial,8);

    const ghost={id:"-18,14",type:"ghost",objectType:"wall",q:-18,r:14};state.ghosts.set(ghost.id,ghost);
    assert.equal(api.clearGhost(ghost),true);assert.equal(state.ghosts.size,0);
  });

  test("Track has no fractional damaged state and is destroyed by any damage",()=>{
    const state=api.state;state.tracks.clear();
    const track=makeTrack(4,0);state.tracks.set("4,0",track);

    api.damageTarget(track,.01);

    assert.equal(track.hp,0);
    assert.equal(state.tracks.has("4,0"),false);
    assert.equal(state.ghosts.get("4,0").objectType,"track");
    assert.equal(state.ghosts.get("4,0").hp,0);
  });

  test("a newly deployed Turret Train starts with 10 Energy in its wagon",()=>{
    const state=api.state;state.trains=[];state.tracks.clear();
    state.tracks.set("1,0",makeTrack(1,0,["2,0"]));state.tracks.set("2,0",makeTrack(2,0,["1,0"]));
    state.deploymentPaid=true;state.deploymentTrainType="combat";

    api.deployTrain(2,0);api.deployTrain(1,0);

    assert.equal(state.trains.length,1);
    assert.equal(state.trains[0].trainType,"combat");
    assert.equal(state.trains[0].wagons.length,1);
    assert.equal(state.trains[0].wagons[0].type,"energy");
    assert.equal(state.trains[0].wagons[0].amount,10);
    assert.equal(state.trains[0].hp,50);
    assert.equal(state.trains[0].maxHp,50);
    assert.ok(state.trains[0].wagons.every(wagon=>wagon.hp===50&&wagon.maxHp===50));
  });

  test("a Build/Mine Train renders immediately when deployed while the tutorial-like game state is paused",()=>{
    const state=api.state,context=elements.get("gameCanvas").context;state.paused=true;state.trains=[];state.tracks.clear();
    state.tracks.set("1,0",makeTrack(1,0,["2,0"]));state.tracks.set("2,0",makeTrack(2,0,["1,0","3,0"]));state.tracks.set("3,0",makeTrack(3,0,["2,0"]));
    state.deploymentPaid=true;state.deploymentTrainType="builder";context.textCalls.length=0;

    api.deployTrain(3,0);api.deployTrain(1,0);

    assert.equal(state.trains.length,1);assert.equal(state.trains[0].trainType,"builder");
    assert.ok(context.textCalls.some(call=>call.text==="L"),"successful paused deployment should synchronously render the Locomotive");
    assert.deepEqual({...state.selected},{type:"train",id:state.trains[0].id});
  });

  test("Track costs one carried Construction Material and repairs to 1 HP", () => {
    const state = api.state;
    const train = state.trains[0];
    moveTrain(train, 0, 0);
    train.scheduleComplete = true;
    train.route = [{ q: 1, r: 0 }];
    train.wagons[0].amount = 1;
    state.tracks.clear();
    const track = makeTrack(1, 0);
    track.hp = 0;
    state.tracks.set(api.key(track.q, track.r), track);

    assert.equal(api.updateAutomaticRepair(train), true);
    assert.equal(track.hp, 1);
    assert.equal(train.wagons[0].amount, 0);
    assert.equal(train.repairHoldUntil, 1);
    assert.ok(state.worldMessages.some(item => item.message === "Train A: Repaired Track"));
  });

  test("structure repairs can be partial and pause the Train for one second", () => {
    const state = api.state;
    const train = state.trains[0];
    moveTrain(train, 0, 0);
    train.scheduleComplete = true;
    train.route = [{ q: 0, r: 1 }];
    train.wagons[0].amount = 5;
    const turret = { id: "damaged-turret", type: "turret", q: 1, r: 0, hp: 10, maxHp: 18, energy: 0, maxEnergy: 20, cooldown: 0 };
    state.structures.set(api.key(turret.q, turret.r), turret);

    assert.equal(api.updateAutomaticRepair(train), true);
    assert.equal(turret.hp, 15);
    assert.equal(train.wagons[0].amount, 0);
    assert.equal(train.repairHoldUntil, state.elapsed + 1);
    assert.ok(state.worldMessages.some(item => item.message === "Train A: Partially Repaired: Turret"));
  });

  test("rebuilding destroyed Track preserves its Train Stop", () => {
    const state = api.state;
    const train = state.trains[0];
    moveTrain(train, 0, 1);
    train.wagons[0].amount = 1;
    train.schedule = [{ q: 1, r: 0 }];
    state.tracks.clear();
    state.tracks.set("0,0", makeTrack(0, 0, ["1,0"]));
    state.tracks.set("2,0", makeTrack(2, 0, ["1,0"]));
    state.ghosts.set("1,0", { id: "1,0", type: "ghost", objectType: "track", q: 1, r: 0, links: ["0,0", "2,0"] });

    api.updateAutomaticRebuild();

    assert.ok(state.tracks.has("1,0"));
    assert.equal(state.tracks.get("1,0").hp, 1);
    assert.equal(state.ghosts.has("1,0"), false);
    assert.equal(api.scheduleStopAt(1, 0).index, 0);
    assert.ok(state.worldMessages.some(item => item.message === "Train A: Rebuilt Track"));
  });

  test("a Stop can be added directly to destroyed Track", () => {
    const state = api.state;
    const train = state.trains[0];
    state.ghosts.set("4,0", { id: "4,0", type: "ghost", objectType: "track", q: 4, r: 0, links: [] });
    state.mode = "schedule";
    state.scheduleTrainId = train.id;
    train.schedule = [];

    api.addScheduleStop(train, 4, 0);

    assert.equal(train.schedule.length, 1);
    assert.equal(`${train.schedule[0].q},${train.schedule[0].r}`, "4,0");
    state.selected = { type: "ghost", id: "4,0" };
    assert.match(api.selectionHtml(), /Destroyed Stop A1 \(Build\/Mine Train A\)/);
  });

  test("selected Stops include the full Train type and name", () => {
    const state = api.state;
    const train = state.trains[0];
    train.code = "B";
    train.name = api.trainName(1,"combat");
    train.schedule = [{q:4,r:0}];
    const track = makeTrack(4,0);
    state.tracks.set("4,0",track);
    state.selected = {type:"track",id:"4,0"};

    assert.match(api.selectionHtml(),/Stop B1 \(Turret Train B\)/);
  });

  test("a depleted Train warning is throttled instead of being spammed", () => {
    const state = api.state;
    const train = state.trains[0];
    train.fuel = 0;
    train.wagons[1].amount = 0;
    train.energyDepleted = true;

    assert.equal(api.showTrainEnergyWarning(train), true);
    assert.equal(api.showTrainEnergyWarning(train), false);
    assert.equal(state.worldMessages.length, 1);
    assert.equal(state.worldMessages[0].message,"Train A: Ran Out of Energy");
    assert.equal(train.nextEnergyWarningAt, 2.5);
    state.elapsed = 2.4;
    assert.equal(api.showTrainEnergyWarning(train), false);
    state.elapsed = 2.5;
    assert.equal(api.showTrainEnergyWarning(train), true);
    assert.equal(state.worldMessages.length, 1);
  });
});
