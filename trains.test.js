"use strict";

const assert = require("node:assert/strict");
const { describe, test, beforeEach } = require("node:test");
const { api, moveTrain, addTestTrain } = require("./harness.js");

beforeEach(() => { api.reset(); addTestTrain(); });

function positionTrain(train,positions){
  api.trainSegments(train).forEach((segment,index)=>{const position=positions[index],point=api.axialToWorld(position.q,position.r);Object.assign(segment,position,{x:point.x,y:point.y});});
  train.stepFrom=null;train.stepTo=null;train.progress=0;train.route=[];
}

describe("resource logistics", () => {
  test("all ten hexes around the four-cell Base service Trains",()=>{
    const state=api.state,train=state.trains[0],perimeter=api.basePerimeter();assert.equal(perimeter.length,10);
    for(const stop of perimeter){
      moveTrain(train,stop.q,stop.r);train.wasNearBase=false;train.fuel=train.maxFuel;train.wagons[0].amount=1;train.wagons[1].amount=0;state.baseMaterial=0;state.baseEnergy=0;
      api.updateAutomaticLogistics();assert.equal(state.baseMaterial,1,`${stop.q},${stop.r} should service the Base`);
    }
  });

  test("a Train that runs out of Energy snaps every car to its nearest complete hex",()=>{
    const train=api.state.trains[0],from=[{q:8,r:0},{q:7,r:0},{q:6,r:0}],to=[{q:9,r:0},{q:8,r:0},{q:7,r:0}];
    positionTrain(train,from);train.stepFrom=from;train.stepTo=to;train.progress=.7;
    api.trainSegments(train).forEach((segment,index)=>{const start=api.axialToWorld(from[index].q,from[index].r),end=api.axialToWorld(to[index].q,to[index].r);segment.x=(start.x+end.x)/2;segment.y=(start.y+end.y)/2;});

    train.fuel=0;train.wagons[1].amount=0;train.energyDepleted=true;
    assert.equal(api.updateEmergencyTrainRefueling(),0);
    assert.equal(api.snapTrainToGrid(train).map(position=>`${position.q},${position.r}`).join("|"),to.map(position=>`${position.q},${position.r}`).join("|"));
    assert.equal(train.stepFrom,null);assert.equal(train.stepTo,null);assert.equal(train.progress,0);
    api.trainSegments(train).forEach((segment,index)=>{const point=api.axialToWorld(to[index].q,to[index].r);assert.equal(segment.q,to[index].q);assert.equal(segment.r,to[index].r);assert.equal(segment.x,point.x);assert.equal(segment.y,point.y);});
  });

  test("a passing Train gives half its loaded Energy to a depleted Train before supplying defenses",()=>{
    const state=api.state,receiver=state.trains[0],donor=addTestTrain();
    positionTrain(receiver,[{q:10,r:0},{q:9,r:0},{q:8,r:0}]);positionTrain(donor,[{q:8,r:0},{q:7,r:0},{q:6,r:0}]);
    receiver.fuel=0;receiver.energyDepleted=true;receiver.wagons[1].amount=0;
    donor.wagons[1].amount=9;
    const turret={id:"refuel-priority-turret",type:"turret",q:8,r:-1,hp:18,maxHp:18,energy:0,maxEnergy:20,cooldown:0};state.structures.set(api.key(turret.q,turret.r),turret);

    api.updateAutomaticLogistics();

    assert.equal(receiver.fuel,4);assert.equal(receiver.energyDepleted,false);
    assert.equal(donor.wagons[1].amount,0);assert.equal(turret.energy,5,"the emergency transfer must receive half before the Turret gets the remainder");
    assert.ok(state.worldMessages.some(item=>item.message==="Train B: Fueled Train A with Energy"));
  });

  test("the Base reports Energy loaded into a Train",()=>{
    const state=api.state,train=state.trains[0];
    moveTrain(train,2,0);train.fuel=10;train.wagons[0].amount=1;train.wagons[1].amount=0;state.baseEnergy=50;

    api.serviceBaseLogistics(train);

    assert.equal(train.fuel,20);
    assert.equal(train.wagons[1].amount,30);
    assert.ok(state.worldMessages.some(item=>item.message==="Train A: Loaded Energy for Fuel from Base"));
  });

  test("the Base accepts each resource only up to 110", () => {
    const state = api.state;
    const train = state.trains[0];
    moveTrain(train, 2, 0);
    train.fuel = train.maxFuel;
    train.wagons[0].amount = 30;
    train.wagons[1].amount = 30;
    state.baseMaterial = 90;
    state.baseEnergy = 99;
    train.wasNearBase = false;

    api.updateAutomaticLogistics();

    assert.equal(state.baseMaterial, 110);
    assert.equal(state.baseEnergy, 110);
    assert.equal(train.wagons[0].amount, 10);
    assert.equal(train.wagons[1].amount, 19);
    assert.equal(api.constants.BASE_UNLOAD_TARGET, 110);
  });

  test("a Turret receives Energy before the nearby Base", () => {
    const state = api.state;
    const train = state.trains[0];
    moveTrain(train, 2, 0);
    train.fuel = train.maxFuel;
    train.wagons[0].amount = 0;
    train.wagons[1].amount = 20;
    train.wasNearBase = false;
    state.baseEnergy = 90;
    const turret = { id: "turret-priority", type: "turret", q: 3, r: -1, hp: 18, maxHp: 18, energy: 12, maxEnergy: 20, cooldown: 0 };
    state.structures.set(api.key(turret.q, turret.r), turret);

    api.updateAutomaticLogistics();

    assert.equal(turret.energy, 20);
    assert.equal(state.baseEnergy, 102);
    assert.equal(train.wagons[1].amount, 0);
  });

  test("Turret supply checks locomotive distance, not wagon distance", () => {
    const state = api.state;
    const train = state.trains[0];
    moveTrain(train, 12, 10);
    train.wagons[1].q = 11; train.wagons[1].r = 10; train.wagons[1].amount = 20;
    const turret = { id: "turret-loco-range", type: "turret", q: 10, r: 10, hp: 18, maxHp: 18, energy: 0, maxEnergy: 20, cooldown: 0 };
    state.structures.set(api.key(turret.q, turret.r), turret);

    api.updateAutomaticLogistics();
    assert.equal(turret.energy, 0);

    moveTrain(train, 11, 10);
    api.updateAutomaticLogistics();
    assert.equal(turret.energy, 20);
  });

  test("a stopped Build/Mine Train supplies Artillery with Energy",()=>{
    const state=api.state,train=state.trains[0];moveTrain(train,6,0);train.wagons[1].amount=30;
    const artillery={id:"artillery-supply",type:"artillery",q:7,r:0,hp:36,maxHp:36,energy:10,maxEnergy:40,cooldown:0};state.structures.set("7,0",artillery);

    api.updateAutomaticLogistics();

    assert.equal(artillery.energy,40);assert.equal(train.wagons[1].amount,0);
    assert.ok(state.worldMessages.some(item=>item.message==="Train A: Supplied Artillery with Energy"));
  });

  test("Mines instantly fill the matching wagon from an adjacent locomotive", () => {
    const state = api.state;
    const train = state.trains[0];
    moveTrain(train, 6, -2);
    train.fuel = train.maxFuel;
    train.wagons[0].amount = 0;
    const mine = { id: "mine-material", type: "mine", resource: "material", q: 7, r: -2, hp: 22, maxHp: 22 };
    state.structures.set(api.key(mine.q, mine.r), mine);
    const before = api.resourceNodeAt(mine.q, mine.r).amount;

    api.updateAutomaticLogistics();

    assert.equal(train.wagons[0].amount, 30);
    assert.equal(api.resourceNodeAt(mine.q, mine.r).amount, before - 30);
    assert.equal(state.stats.materialMined,30);
    assert.equal(state.stats.energyMined,0);
    assert.ok(state.worldMessages.some(item => item.message === "Train A: Mined Construction Material"));
  });

  test("an Energy Mine refuels the locomotive before filling its wagon", () => {
    const state = api.state;
    const train = state.trains[0];
    moveTrain(train, 12, 3);
    train.fuel = 10;
    train.wagons[1].amount = 0;
    const mine = { id: "mine-energy", type: "mine", resource: "energy", q: 13, r: 3, hp: 22, maxHp: 22 };
    state.structures.set(api.key(mine.q, mine.r), mine);
    const before = api.resourceNodeAt(mine.q, mine.r).amount;

    api.updateAutomaticLogistics();

    assert.equal(train.fuel, 20);
    assert.equal(train.wagons[1].amount, 30);
    assert.equal(api.resourceNodeAt(mine.q, mine.r).amount, before - 40);
    assert.equal(state.stats.energyMined,40);
    assert.equal(state.stats.materialMined,0);
    assert.ok(state.worldMessages.some(item=>item.message==="Train A: Mined Energy"));
  });
});
