"use strict";

const assert = require("node:assert/strict");
const { describe, test, beforeEach } = require("node:test");
const { api } = require("./harness.js");

beforeEach(() => { api.reset(); });

describe("terrain generation", () => {
  test("guaranteed resource nodes remain available and typed", () => {
    assert.deepEqual({ ...api.terrainAt(7, -2) }, { type: "resource", resource: "material" });
    assert.deepEqual({ ...api.terrainAt(-4, 7) }, { type: "resource", resource: "energy" });
  });

  test("salvaging an exhausted Mine clears its resource node into ground", () => {
    const node = api.resourceNodeAt(7, -2);
    assert.ok(node.amount >= api.constants.NODE_MIN_CAPACITY);
    assert.ok(node.amount <= api.constants.NODE_MAX_CAPACITY);

    const mine = { id: "mine-exhausted", type: "mine", resource: node.resource, q: node.q, r: node.r, hp: 22, maxHp: 22 };
    api.state.structures.set(api.key(mine.q, mine.r), mine);
    api.state.tracks.set(api.key(6, -2), { q: 6, r: -2, hp: 1, maxHp: 1, links: new Set() });
    api.setNodeAmount(node, 0);

    api.salvageStructure(mine);

    assert.equal(api.state.structures.has(api.key(mine.q, mine.r)), false);
    assert.equal(api.state.clearedResourceNodes.has(api.key(node.q, node.r)), true);
    assert.equal(api.state.nodeResources.has(api.key(node.q, node.r)), false);
    assert.equal(api.terrainAt(7, -2).type, "ground");
    assert.deepEqual({ ...api.state.selected }, { type: "base", id: "base" });
  });
});
