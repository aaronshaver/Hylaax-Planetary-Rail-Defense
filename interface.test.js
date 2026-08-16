"use strict";

const assert = require("node:assert/strict");
const { describe, test, beforeEach } = require("node:test");
const { api, makeEnemy } = require("./harness.js");

beforeEach(() => { api.reset(); });

describe("interface formatting", () => {
  test("survival time includes readable unit spacing", () => {
    assert.equal(api.formatSurvivalTime(7384), "02h 03m 04s");
  });

  test("Hive selection includes its former inspect details", () => {
    const hive = api.createHive(4, 4, 2);
    api.state.selected = { type: "hive", id: hive.id };
    const html = api.selectionHtml();
    assert.match(html, /Level 2 Hive/);
    assert.match(html, /2 Creeps per batch/);
    assert.match(html, /1 in 2 expansion chance/);
    assert.doesNotMatch(html, /production choice/);
  });

  test("clicking a Bio-hostile selects it and shows its hit points", () => {
    const enemy = makeEnemy("enemy-selected",3,2);
    api.state.enemies.push(enemy);

    api.handleHexClick({q:3,r:2});

    assert.deepEqual({ ...api.state.selected },{type:"enemy",id:enemy.id});
    const html = api.selectionHtml();
    assert.match(html,/Bio-hostile/);
    assert.match(html,/HIT POINTS/);
    assert.match(html,/1 \/ 1/);
  });
});
