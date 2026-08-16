"use strict";

const assert = require("node:assert/strict");
const { describe, test, beforeEach } = require("node:test");
const { api, moveTrain, makeEnemy, addTestTrain, performance } = require("./harness.js");

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

  test("an original Hive's first production choice is always its Creep batch", () => {
    const state = api.state;
    state.hives.clear();
    state.enemies = [];
    const hive = api.createHive(2, 2, 2, true, true);
    hive.nextSpawnAt = 0;

    api.updateHives();

    assert.equal(state.hives.size, 1);
    assert.equal(state.enemies.length, 2);
    assert.equal(hive.forceFirstCreepBatch, false);
  });

  test("a Level 2 Hive can create a Level 3 Hive after three minutes", () => {
    const state = api.state;
    state.elapsed = 180;
    state.hives.clear();
    state.enemies = [];
    const hive = api.createHive(2, 2, 2, false, false);
    let spawnNumber = 0;
    while (!api.hiveReplicationRoll(hive, spawnNumber, 2) && spawnNumber < 10000) spawnNumber++;
    assert.ok(spawnNumber < 10000, "could not find a deterministic replication roll");
    hive.spawnCount = spawnNumber;
    hive.nextSpawnAt = 180;

    api.updateHives();

    assert.equal(state.hives.size, 2);
    const child = [...state.hives.values()].find(candidate => candidate.id !== hive.id);
    assert.equal(child.level, 3);
    assert.equal(state.enemies.length, 0);
    assert.ok(api.hexDistance(hive, child) >= 2, "new Hives must have at least one non-Hive hex between them");
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
});

describe("enemy navigation", () => {
  test("pathfinding can route around an impassable hex", () => {
    const blocked = new Set(["1,0"]);
    const step = api.findEnemyStep({ q: 0, r: 0 }, { q: 4, r: 0 }, (q, r) => !blocked.has(api.key(q, r)));
    assert.ok(step);
    assert.equal(api.hexDistance({ q: 0, r: 0 }, step), 1);
    assert.notEqual(api.key(step.q, step.r), "1,0");
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
    const reservedDestinations = state.enemies.map(enemy => api.key(enemy.toQ, enemy.toR));

    assert.equal(firstStats.builds, 1);
    assert.equal(secondStats.builds, 1, "steady ticks should reuse the shared navigation field");
    assert.equal(new Set(reservedDestinations).size, reservedDestinations.length, "Creeps must not reserve overlapping destination hexes");
    console.log(`Shared-navigation stress test: 600 Creeps; ${initialMs.toFixed(1)} ms initial build, ${steadyMs.toFixed(1)} ms steady tick`);
  });
});
