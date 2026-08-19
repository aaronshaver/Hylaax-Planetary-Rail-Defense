"use strict";

const assert = require("node:assert/strict");
const { describe, test, beforeEach } = require("node:test");
const { api } = require("./harness.js");

beforeEach(() => { api.reset(); });

describe("world state and selection", () => {
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

  test("Center Map on Base preserves zoom and centers the camera on the Base",()=>{
    api.state.camera={x:875,y:-430,zoom:1.7};const expected=api.axialToWorld(api.state.base.q,api.state.base.r);
    assert.deepEqual({...api.centerMapOnBase()},{...expected});assert.equal(api.state.camera.x,expected.x);assert.equal(api.state.camera.y,expected.y);assert.equal(api.state.camera.zoom,1.7);
  });
});
