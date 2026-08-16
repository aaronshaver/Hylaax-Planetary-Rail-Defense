"use strict";

const assert = require("node:assert/strict");
const { describe, test, beforeEach } = require("node:test");
const { api, elements } = require("./harness.js");

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

  test("Hives draw a raised larger H with their level at the bottom",()=>{
    const hive=api.createHive(4,3,5),point=api.axialToWorld(hive.q,hive.r),context=elements.get("gameCanvas").context;
    context.textCalls.length=0;

    api.drawHives();

    const hCall=context.textCalls.find(call=>call.text==="H"),levelCall=context.textCalls.find(call=>call.text==="5");
    assert.match(hCall.font,/20px/);
    assert.equal(hCall.y,point.y-4);
    assert.match(levelCall.font,/9px/);
    assert.equal(levelCall.x,point.x);
    assert.equal(levelCall.y,point.y+11);
  });

  test("a lost Base renders as a muted destroyed icon",()=>{
    const context=elements.get("gameCanvas").context;
    api.state.base.hp=0;api.state.gameOver=true;context.textCalls.length=0;

    api.drawBase();

    const baseLabel=context.textCalls.find(call=>call.text==="B");
    assert.equal(baseLabel.fillStyle,"#aeb8bb");
    assert.notEqual(baseLabel.fillStyle,"#f4cf69");
  });
});
