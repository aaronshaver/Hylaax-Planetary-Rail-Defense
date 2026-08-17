"use strict";

const assert = require("node:assert/strict");
const { describe, test, beforeEach } = require("node:test");
const { api } = require("./harness.js");

beforeEach(() => { api.reset(); });

describe("terrain generation", () => {
  test("tree hexes use stable one-, two-, and three-tree variants", () => {
    const variants = new Set();
    for(let q=-40;q<=40&&variants.size<3;q++)for(let r=-40;r<=40&&variants.size<3;r++){
      const first = api.terrainAt(q,r);
      if(first.type!=="trees")continue;
      assert.equal(api.terrainAt(q,r).variant,first.variant);
      variants.add(first.variant);
    }
    assert.deepEqual([...variants].sort(),[1,2,3]);
  });

  test("mountain hexes use stable single- and multi-peak variants", () => {
    const variants = new Set();
    for(let q=-60;q<=60&&variants.size<2;q++)for(let r=-60;r<=60&&variants.size<2;r++){
      const first = api.terrainAt(q,r);
      if(first.type!=="rock")continue;
      assert.equal(api.terrainAt(q,r).variant,first.variant);
      variants.add(first.variant);
    }
    assert.deepEqual([...variants].sort(),[1,2]);
  });

  test("water hexes use stable normal, light, and dark wave variants", () => {
    const variants = new Set();
    for(let q=-60;q<=60&&variants.size<3;q++)for(let r=-60;r<=60&&variants.size<3;r++){
      const first = api.terrainAt(q,r);
      if(first.type!=="water")continue;
      assert.equal(api.terrainAt(q,r).variant,first.variant);
      variants.add(first.variant);
    }
    assert.deepEqual([...variants].sort(),[1,2,3]);
  });

  test("guaranteed resource nodes remain available and typed", () => {
    assert.deepEqual({ ...api.terrainAt(7, -2) }, { type: "resource", resource: "material" });
    assert.deepEqual({ ...api.terrainAt(-4, 7) }, { type: "resource", resource: "energy" });
  });

  test("every generated resource node has a traversable approach to the larger clear area",()=>{
    let resources=0;
    for(let q=-55;q<=55;q++)for(let r=-55;r<=55;r++){
      if(api.terrainAt(q,r).type!=="resource")continue;
      resources++;
      assert.equal(api.resourceHasOpenApproach(q,r),true,`resource at ${q},${r} is trapped by impassable terrain`);
    }
    assert.ok(resources>4,"the scan should exercise generated nodes as well as guaranteed nodes");
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

  test("clearing a destroyed Mine returns nothing and preserves a Resource Node that still has resources",()=>{
    const state=api.state,node=api.resourceNodeAt(7,-2);api.setNodeAmount(node,73);
    const mine={id:"mine-destroyed",type:"mine",resource:node.resource,q:node.q,r:node.r,hp:1,maxHp:22};state.structures.set(node.id,mine);
    api.damageTarget(mine,1);const materialBefore=state.baseMaterial,energyBefore=state.baseEnergy;
    api.setMode("salvage");api.handleHexClick({q:node.q,r:node.r});
    assert.equal(state.ghosts.has(node.id),false);assert.equal(api.terrainAt(node.q,node.r).type,"resource");assert.equal(api.resourceNodeAt(node.q,node.r).amount,73);
    assert.equal(state.baseMaterial,materialBefore);assert.equal(state.baseEnergy,energyBefore);
  });

  test("clearing a destroyed Mine on an exhausted node clears the ground",()=>{
    const state=api.state,node=api.resourceNodeAt(7,-2);api.setNodeAmount(node,0);
    const mine={id:"mine-destroyed-empty",type:"mine",resource:node.resource,q:node.q,r:node.r,hp:1,maxHp:22};state.structures.set(node.id,mine);
    api.damageTarget(mine,1);api.setMode("salvage");api.handleHexClick({q:node.q,r:node.r});
    assert.equal(state.ghosts.has(node.id),false);assert.equal(api.terrainAt(node.q,node.r).type,"ground");
  });

  test("salvaging a healthy Mine leaves a Resource Node that still has resources",()=>{
    const state=api.state,node=api.resourceNodeAt(7,-2);api.setNodeAmount(node,51);
    const mine={id:"mine-healthy",type:"mine",resource:node.resource,q:node.q,r:node.r,hp:22,maxHp:22};state.structures.set(node.id,mine);state.tracks.set("6,-2",{q:6,r:-2,hp:1,maxHp:1,links:new Set()});
    const materialBefore=state.baseMaterial;api.salvageStructure(mine);
    assert.equal(state.structures.has(node.id),false);assert.equal(api.terrainAt(node.q,node.r).type,"resource");assert.equal(api.resourceNodeAt(node.q,node.r).amount,51);assert.equal(state.baseMaterial,materialBefore+6);
  });
});
