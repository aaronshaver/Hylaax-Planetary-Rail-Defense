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
