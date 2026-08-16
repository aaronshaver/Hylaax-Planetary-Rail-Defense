"use strict";

const assert = require("node:assert/strict");
const { describe, test, beforeEach } = require("node:test");
const { api } = require("./harness.js");

beforeEach(() => { api.reset(); });

describe("rendering caches", () => {
  test("nearby activity messages stack in the defined priority order", () => {
    api.showWorldActivity({ q: 1, r: 0, type: "turret" }, "Train A: Loaded Turret with Energy");
    api.showWorldActivity({ q: 0, r: 1, type: "mine" }, "Train A: Mined Energy");
    api.showWorldActivity({ q: 0, r: 0, type: "base" }, "Train A: Repaired Base");
    const layout = api.worldMessageLayout();
    assert.equal(layout.map(entry => entry.item.message).join("|"), "Train A: Repaired Base|Train A: Mined Energy|Train A: Loaded Turret with Energy");
    assert.ok(layout[0].y < layout[1].y && layout[1].y < layout[2].y);
  });

  test("the terrain layer is reused until its signature changes", () => {
    api.ensureTerrainLayer();
    const first = api.terrainLayerStats();
    assert.ok(first.cells > 0);
    api.ensureTerrainLayer();
    const second = api.terrainLayerStats();
    assert.equal(second.builds, first.builds);
    assert.equal(second.cells, first.cells);
  });
});
