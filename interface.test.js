"use strict";

const assert = require("node:assert/strict");
const { describe, test, beforeEach } = require("node:test");
const { api } = require("./harness.js");

beforeEach(() => { api.reset(); });

describe("interface formatting", () => {
  test("survival time includes readable unit spacing", () => {
    assert.equal(api.formatSurvivalTime(7384), "02h 03m 04s");
  });

  test("Hive selection stays concise", () => {
    const hive = api.createHive(4, 4, 2);
    api.state.selected = { type: "hive", id: hive.id };
    const html = api.selectionHtml();
    assert.match(html, /Level 2 Hive/);
    assert.doesNotMatch(html, /production choice|Creep batch/);
  });
});
