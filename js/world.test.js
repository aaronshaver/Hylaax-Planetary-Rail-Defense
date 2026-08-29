"use strict";

const assert = require("node:assert/strict");
const { describe, test, beforeEach } = require("node:test");
const { api } = require("./harness.js");

beforeEach(() => { api.reset(); });

describe("world state and selection", () => {
  test("a fresh game starts with the same camera center as Center Map on Base",()=>{
    const expected=api.structureWorldCenter(api.state.base);
    assert.equal(api.state.camera.x,expected.x);assert.equal(api.state.camera.y,expected.y);
  });

  test("select resolves the Base from world state", () => {
    api.select("base", "base");
    assert.equal(api.getSelected().type, "base");
    assert.deepEqual({ ...api.fromKey(api.key(3, -2)) }, { q: 3, r: -2 });
  });

  test("live structures and ghosts are indexed under every footprint hex",()=>{
    const state=api.state,building={id:"indexed-research",type:"research",q:8,r:8,footprint:[{q:8,r:8},{q:9,r:8},{q:8,r:9}],hp:300,maxHp:300};
    state.structures.set("8,8",building);
    for(const cell of building.footprint)assert.equal(api.structureAt(cell.q,cell.r),building);
    assert.equal(state.structures.byHex.size,3);

    state.structures.delete("8,8");
    for(const cell of building.footprint)assert.equal(api.structureAt(cell.q,cell.r),null);
    const ghost={...building,id:"8,8",type:"ghost",objectType:"research"};state.ghosts.set(ghost.id,ghost);
    for(const cell of ghost.footprint)assert.equal(api.ghostAt(cell.q,cell.r),ghost);

    state.ghosts.delete(ghost.id);
    for(const cell of ghost.footprint)assert.equal(api.ghostAt(cell.q,cell.r),null);
  });

  test("changing tools updates the active world mode", () => {
    api.setMode("track");
    assert.equal(api.state.mode, "track");
    api.setMode("select");
    assert.equal(api.state.mode, "select");
  });

  test("clicking Select Object enters Select mode with a fresh selection",()=>{
    api.select("base","base");api.setMode("turret");
    assert.ok(api.state.selected);
    api.setMode("select",true);
    assert.equal(api.state.mode,"select");assert.equal(api.state.selected,null);
  });

  test("Center Map on Base preserves zoom and centers the camera on the Base",()=>{
    api.state.camera={x:875,y:-430,zoom:1.7};const expected=api.structureWorldCenter(api.state.base);
    assert.deepEqual({...api.centerMapOnBase()},{...expected});assert.equal(api.state.camera.x,expected.x);assert.equal(api.state.camera.y,expected.y);assert.equal(api.state.camera.zoom,1.7);
  });
});
