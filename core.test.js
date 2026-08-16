"use strict";

const assert = require("node:assert/strict");
const { describe, test, beforeEach } = require("node:test");
const { api } = require("./harness.js");

beforeEach(() => { api.reset(); });

describe("geometry and initial state", () => {
  test("hex conversion and distance are stable", () => {
    assert.equal(api.hexDistance({ q: 0, r: 0 }, { q: 3, r: -2 }), 3);
    for (const hex of [{ q: 0, r: 0 }, { q: 7, r: -4 }, { q: -8, r: 3 }]) {
      const roundTrip = api.worldToAxial(...Object.values(api.axialToWorld(hex.q, hex.r)));
      assert.equal(`${roundTrip.q},${roundTrip.r}`, `${hex.q},${hex.r}`);
    }
  });

  test("a new game has a full locomotive and two empty dedicated wagons", () => {
    const state = api.state;
    const train = state.trains[0];
    assert.equal(state.tracks.size, 3);
    assert.equal(state.baseMaterial, 100);
    assert.equal(train.fuel, train.maxFuel);
    assert.equal(train.wagons.map(wagon => wagon.role).join(","), "material,energy");
    assert.equal(train.wagons.map(wagon => wagon.amount).join(","), "0,0");
    assert.equal(api.constants.TRACK_HIT_POINTS, 1);
  });

  test("Train names use the Build/Mine and Turret labels", () => {
    assert.equal(api.trainName(0,"builder"),"Build/Mine Train A");
    assert.equal(api.trainName(1,"combat"),"Turret Train B");
  });
});
