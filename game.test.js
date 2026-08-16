"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { performance } = require("node:perf_hooks");
const { describe, test, beforeEach } = require("node:test");

class ClassListMock {
  constructor() { this.values = new Set(); }
  add(...names) { names.forEach(name => this.values.add(name)); }
  remove(...names) { names.forEach(name => this.values.delete(name)); }
  toggle(name, force) {
    if (force === true) { this.values.add(name); return true; }
    if (force === false) { this.values.delete(name); return false; }
    if (this.values.has(name)) { this.values.delete(name); return false; }
    this.values.add(name); return true;
  }
  contains(name) { return this.values.has(name); }
}

function makeCanvasContext() {
  const values = { font: "10px sans-serif", globalAlpha: 1 };
  const methods = {
    measureText: text => ({ width: String(text).length * 7 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} })
  };
  return new Proxy(values, {
    get(target, property) {
      if (property in target) return target[property];
      if (property in methods) return methods[property];
      return () => {};
    },
    set(target, property, value) { target[property] = value; return true; }
  });
}

class ElementMock {
  constructor(tagName = "div", id = "") {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.classList = new ClassListMock();
    this.dataset = {};
    this.style = {};
    this.children = [];
    this.hidden = false;
    this.disabled = false;
    this.textContent = "";
    this.innerHTML = "";
    this.width = 1024;
    this.height = 768;
  }
  addEventListener() {}
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); }
  focus() {}
  blur() {}
  setPointerCapture() {}
  closest() { return null; }
  matches() { return false; }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1024, height: 768 }; }
}

class CanvasMock extends ElementMock {
  constructor(id = "") { super("canvas", id); this.context = makeCanvasContext(); }
  getContext() { return this.context; }
}

class AudioContextMock {
  constructor() { this.currentTime = 0; this.state = "running"; this.destination = {}; }
  resume() {}
  createOscillator() {
    return { type: "sine", frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() { return this; }, start() {}, stop() {} };
  }
  createGain() {
    return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() { return this; } };
  }
}

function loadGame() {
  const root = __dirname;
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
  const elements = new Map(ids.map(id => [id, id === "gameCanvas" ? new CanvasMock(id) : new ElementMock("div", id)]));
  const document = {
    hidden: false,
    body: new ElementMock("body", "body"),
    getElementById(id) { if (!elements.has(id)) elements.set(id, new ElementMock("div", id)); return elements.get(id); },
    createElement(tagName) { return tagName.toLowerCase() === "canvas" ? new CanvasMock() : new ElementMock(tagName); },
    querySelectorAll() { return []; },
    addEventListener() {}
  };
  const window = {
    __HYLAAX_TEST__: true,
    devicePixelRatio: 1,
    document,
    performance,
    AudioContext: AudioContextMock,
    webkitAudioContext: AudioContextMock,
    addEventListener() {}
  };
  window.window = window;
  const context = vm.createContext({
    window, document, console, performance,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
    setTimeout: () => 0,
    clearTimeout() {}
  });
  vm.runInContext(fs.readFileSync(path.join(root, "game.js"), "utf8"), context, { filename: "game.js" });
  assert.ok(window.__HYLAAX_TEST_API__, "game.js did not expose its test interface");
  return { api: window.__HYLAAX_TEST_API__, elements };
}

const harness = loadGame();
const api = harness.api;

function moveTrain(train, q, r) {
  const point = api.axialToWorld(q, r);
  train.q = q; train.r = r; train.x = point.x; train.y = point.y;
  train.route = []; train.stepFrom = null; train.stepTo = null; train.progress = 0;
}

function makeTrack(q, r, links = []) {
  return { q, r, hp: 1, maxHp: 1, links: new Set(links) };
}

function makeEnemy(id, q, r) {
  const point = api.axialToWorld(q, r);
  return { id, q, r, x: point.x, y: point.y, fromQ: q, fromR: r, toQ: q, toR: r, progress: 1, speed: api.constants.ENEMY_SPEED, attackClock: 0, nextPathAt: 0, phase: 0 };
}

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

  test("survival time uses the compact hour-minute-second format", () => {
    assert.equal(api.formatSurvivalTime(7384), "02h03m04s");
  });
});

describe("resource logistics", () => {
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
  });
});

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

  test("Combat Trains can hit Hives at range 6", () => {
    const state = api.state;
    const train = state.trains[0];
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

describe("messages and enemy navigation", () => {
  test("nearby activity messages stack in the defined priority order", () => {
    const state = api.state;
    api.showWorldActivity({ q: 1, r: 0, type: "turret" }, "Train A: Loaded Turret with Energy");
    api.showWorldActivity({ q: 0, r: 1, type: "mine" }, "Train A: Mined Energy");
    api.showWorldActivity({ q: 0, r: 0, type: "base" }, "Train A: Repaired Base");
    const layout = api.worldMessageLayout();
    assert.equal(layout.map(entry => entry.item.message).join("|"), "Train A: Repaired Base|Train A: Mined Energy|Train A: Loaded Turret with Energy");
    assert.ok(layout[0].y < layout[1].y && layout[1].y < layout[2].y);
  });

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
