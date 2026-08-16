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
});
