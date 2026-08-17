"use strict";

const assert = require("node:assert/strict");
const { describe, test, beforeEach } = require("node:test");
const { api, moveTrain, addTestTrain } = require("./harness.js");

beforeEach(() => { api.reset(); addTestTrain(); });

describe("resource logistics", () => {
  test("the Base reports Energy loaded into a Train",()=>{
    const state=api.state,train=state.trains[0];
    moveTrain(train,1,0);train.fuel=10;train.wagons[0].amount=1;train.wagons[1].amount=0;state.baseEnergy=50;

    api.serviceBaseLogistics(train);

    assert.equal(train.fuel,20);
    assert.equal(train.wagons[1].amount,30);
    assert.ok(state.worldMessages.some(item=>item.message==="Train A: Loaded Energy from Base"));
  });

  test("the Base accepts each resource only up to 100", () => {
    const state = api.state;
    const train = state.trains[0];
    moveTrain(train, 1, 0);
    train.fuel = train.maxFuel;
    train.wagons[0].amount = 30;
    train.wagons[1].amount = 30;
    state.baseMaterial = 90;
    state.baseEnergy = 99;
    train.wasNearBase = false;

    api.updateAutomaticLogistics();

    assert.equal(state.baseMaterial, 100);
    assert.equal(state.baseEnergy, 100);
    assert.equal(train.wagons[0].amount, 20);
    assert.equal(train.wagons[1].amount, 29);
    assert.equal(api.constants.BASE_UNLOAD_TARGET, 100);
  });

  test("a Turret receives Energy before the nearby Base", () => {
    const state = api.state;
    const train = state.trains[0];
    moveTrain(train, 1, 0);
    train.fuel = train.maxFuel;
    train.wagons[0].amount = 0;
    train.wagons[1].amount = 20;
    train.wasNearBase = false;
    state.baseEnergy = 90;
    const turret = { id: "turret-priority", type: "turret", q: 1, r: -1, hp: 18, maxHp: 18, energy: 12, maxEnergy: 20, cooldown: 0 };
    state.structures.set(api.key(turret.q, turret.r), turret);

    api.updateAutomaticLogistics();

    assert.equal(turret.energy, 20);
    assert.equal(state.baseEnergy, 100);
    assert.equal(train.wagons[1].amount, 2);
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
    const state=api.state,train=state.trains[0];moveTrain(train,6,0);train.wagons[1].amount=20;
    const artillery={id:"artillery-supply",type:"artillery",q:7,r:0,hp:36,maxHp:36,energy:10,maxEnergy:30,cooldown:0};state.structures.set("7,0",artillery);

    api.updateAutomaticLogistics();

    assert.equal(artillery.energy,30);assert.equal(train.wagons[1].amount,0);
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
