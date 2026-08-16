"use strict";

const assert = require("node:assert/strict");
const { describe, test, beforeEach } = require("node:test");
const { api, moveTrain, makeTrack } = require("./harness.js");

beforeEach(() => { api.reset(); });

describe("repairs, ghosts, and schedules", () => {
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
    assert.match(api.selectionHtml(), /Destroyed Track with Train Stop A1 \(Train A\)/);
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
    assert.equal(train.nextEnergyWarningAt, 2.5);
    state.elapsed = 2.4;
    assert.equal(api.showTrainEnergyWarning(train), false);
    state.elapsed = 2.5;
    assert.equal(api.showTrainEnergyWarning(train), true);
    assert.equal(state.worldMessages.length, 1);
  });
});
