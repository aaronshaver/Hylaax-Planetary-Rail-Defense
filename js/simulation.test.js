"use strict";

const assert = require("node:assert/strict");
const { describe, test, beforeEach } = require("node:test");
const { api } = require("./harness.js");

beforeEach(() => { api.reset(); });

describe("fixed-step simulation", () => {
  test("elapsed time advances in fixed 60 Hz ticks", () => {
    const ticks = api.advanceSimulation(1 / 30);
    assert.equal(ticks, 2);
    assert.ok(Math.abs(api.state.elapsed - 1 / 30) < 1e-9);
  });

  test("paused games do not accumulate simulation time", () => {
    api.state.paused = true;
    assert.equal(api.advanceSimulation(1), 0);
    assert.equal(api.state.elapsed, 0);
  });
});
