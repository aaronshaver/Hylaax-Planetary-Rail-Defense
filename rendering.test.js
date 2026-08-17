"use strict";

const assert = require("node:assert/strict");
const { describe, test, beforeEach } = require("node:test");
const { api, elements, makeEnemy } = require("./harness.js");

beforeEach(() => { api.reset(); });

describe("rendering caches", () => {
  test("nearby activity messages stack in the defined priority order", () => {
    api.showWorldActivity({ q: 1, r: 0, type: "turret" }, "Train A: Supplied Turret with Energy");
    api.showWorldActivity({ q: 0, r: 1, type: "mine" }, "Train A: Mined Energy");
    api.showWorldActivity({ q: 0, r: 0, type: "base" }, "Train A: Repaired Base");
    const layout = api.worldMessageLayout();
    assert.equal(layout.map(entry => entry.item.message).join("|"), "Train A: Repaired Base|Train A: Mined Energy|Train A: Supplied Turret with Energy");
    assert.ok(layout[0].y < layout[1].y && layout[1].y < layout[2].y);
  });

  test("world activity messages use white text with a green outline",()=>{
    const context=elements.get("gameCanvas").context;
    api.showWorldActivity({q:2,r:2,type:"mine"},"Train A: Mined Energy");
    context.textCalls.length=0;context.strokeCalls.length=0;

    api.drawWorldMessages();

    assert.equal(context.textCalls.find(call=>call.text==="Train A: Mined Energy").fillStyle,"#f3f7f8");
    assert.ok(context.strokeCalls.some(call=>call.strokeStyle==="#70bd77"&&call.lineWidth===1));
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

  test("live Track never uses the legacy dark-red damaged rendering",()=>{
    const context=elements.get("gameCanvas").context,track=[...api.state.tracks.values()][0];
    track.hp=.5;context.strokeCalls.length=0;context.fillCalls.length=0;

    api.render();

    assert.equal(context.strokeCalls.some(call=>call.strokeStyle==="#743b40"||call.strokeStyle==="#a84c52"),false);
    assert.equal(context.fillCalls.some(call=>call.fillStyle==="#a84c52"),false);
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

  test("a Hive draws a brief bright-red production pulse",()=>{
    const hive=api.createHive(4,3,2),context=elements.get("gameCanvas").context;
    hive.productionPulseUntil=api.state.elapsed+.75;context.strokeCalls.length=0;

    api.drawHives();
    assert.ok(context.strokeCalls.some(call=>call.strokeStyle==="#ff4054"&&call.lineWidth>2.5));

    api.state.elapsed=.76;context.strokeCalls.length=0;api.drawHives();
    assert.equal(context.strokeCalls.some(call=>call.strokeStyle==="#ff4054"),false);
  });

  test("a lost Base renders as a muted destroyed icon",()=>{
    const context=elements.get("gameCanvas").context;
    api.state.base.hp=0;api.state.gameOver=true;context.textCalls.length=0;

    api.drawBase();

    const baseLabel=context.textCalls.find(call=>call.text==="B");
    assert.equal(baseLabel.fillStyle,"#aeb8bb");
    assert.notEqual(baseLabel.fillStyle,"#f4cf69");
  });

  test("fixed Turrets omit the gray gun and constructed Mines use a triangular roof",()=>{
    const context=elements.get("gameCanvas").context,state=api.state;
    const turret={id:"turret-art",type:"turret",q:2,r:1,hp:18,maxHp:18,energy:10,maxEnergy:20,cooldown:0};
    const mine={id:"mine-art",type:"mine",resource:"material",q:7,r:-2,hp:22,maxHp:22};
    state.structures.set(api.key(turret.q,turret.r),turret);state.structures.set(api.key(mine.q,mine.r),mine);
    context.strokeCalls.length=0;context.fillCalls.length=0;context.fillRectCalls.length=0;
    api.drawStructures();
    assert.equal(context.strokeCalls.some(call=>call.strokeStyle==="#b7c6c9"&&call.lineWidth===4),false);
    assert.ok(context.strokeCalls.some(call=>call.strokeStyle==="#b879ff"&&call.path.some(item=>item.command==="arc"&&item.r===13)),"fixed Turret outline should be purple");
    assert.ok(context.fillCalls.some(call=>call.path.filter(item=>item.command==="lineTo").length===2&&call.path.some(item=>item.command==="closePath")),"Mine should render a filled triangular roof");
    assert.equal(context.fillCalls.some(call=>call.path.some(item=>item.command==="arc"&&item.r===7)),false,"Turret must not have a center circle");
    const minePoint=api.axialToWorld(mine.q,mine.r);
    assert.equal(context.fillRectCalls.some(call=>call.x===minePoint.x-13&&call.y===minePoint.y-7&&call.width===26&&call.height===14),false,"Mine must not have a center rectangle");
  });

  test("Train cars render without brown connector strokes",()=>{
    const context=elements.get("gameCanvas").context;
    const { addTestTrain }=require("./harness.js");addTestTrain("builder");
    context.strokeCalls.length=0;api.drawTrains();
    assert.equal(context.strokeCalls.some(call=>call.strokeStyle==="#79502f"),false);
  });

  test("each Train car keeps its circular Train-code badge without inter-car connectors",()=>{
    const context=elements.get("gameCanvas").context;
    const { addTestTrain }=require("./harness.js");addTestTrain("builder");
    context.textCalls.length=0;context.fillCalls.length=0;context.strokeCalls.length=0;api.drawTrains();
    assert.deepEqual(context.textCalls.map(call=>call.text),["S","S","L","A","A","A"]);
    assert.equal(context.fillCalls.filter(call=>call.fillStyle==="rgba(9,14,17,.96)"&&call.path.some(item=>item.command==="arc"&&item.r===8)).length,3);
    assert.equal(context.strokeCalls.some(call=>call.strokeStyle==="#79502f"||call.strokeStyle==="#b88a50"),false);
  });

  test("Turret Trains have a purple locomotive with no visible weapon or center mount",()=>{
    const context=elements.get("gameCanvas").context;
    const { addTestTrain }=require("./harness.js");addTestTrain("combat");
    context.strokeCalls.length=0;context.fillRectCalls.length=0;api.drawTrains();
    assert.equal(context.strokeCalls.some(call=>call.strokeStyle==="#83edf2"&&call.lineWidth===4),false);
    assert.ok(context.fillRectCalls.some(call=>call.fillStyle==="#684079"&&call.width===28&&call.height===18));
  });

  test("Walls render as light gray brickwork with a centered W",()=>{
    const context=elements.get("gameCanvas").context,state=api.state;
    const wall={id:"wall-art",type:"wall",q:5,r:2,hp:100,maxHp:100};
    state.structures.set(api.key(wall.q,wall.r),wall);context.textCalls.length=0;context.fillRectCalls.length=0;context.strokeCalls.length=0;

    api.drawStructures();

    const point=api.axialToWorld(wall.q,wall.r),label=context.textCalls.find(call=>call.text==="W"&&call.x===point.x&&call.y===point.y+.5);
    assert.ok(label);assert.equal(label.fillStyle,"#f3f7f8");
    assert.ok(context.fillRectCalls.some(call=>call.x===point.x-17&&call.y===point.y-13&&call.width===34&&call.height===26&&call.fillStyle==="#747d81"));
    assert.ok(context.strokeCalls.some(call=>call.strokeStyle==="#4f595d"&&call.path.length>=10),"Wall should include visible brick joints");
  });

  test("Build Wall previews its three-hex repair range around the hovered tile",()=>{
    const context=elements.get("gameCanvas").context,state=api.state;
    state.mode="wall";state.hover={q:4,r:2};context.strokeCalls.length=0;

    api.drawTurretRanges();

    const boundary=context.strokeCalls.filter(call=>call.strokeStyle==="rgba(230,185,74,.5)"&&call.lineWidth===1.4);
    assert.equal(boundary.length,18,"a radius-three hex has 18 boundary tiles");
  });

  test("a selected Wall keeps showing its three-hex repair range",()=>{
    const context=elements.get("gameCanvas").context,state=api.state;
    const wall={id:"wall-selected-range",type:"wall",q:3,r:-1,hp:100,maxHp:100};
    state.structures.set(api.key(wall.q,wall.r),wall);state.mode="select";state.hover=null;state.selected={type:"structure",id:wall.id};context.strokeCalls.length=0;

    api.drawTurretRanges();

    const boundary=context.strokeCalls.filter(call=>call.strokeStyle==="rgba(96,213,219,.34)"&&call.lineWidth===1.4);
    assert.equal(boundary.length,18,"selected Wall range should persist without a placement hover");
  });

  test("Artillery renders a centered A and a selected 12-hex range",()=>{
    const context=elements.get("gameCanvas").context,state=api.state;
    const artillery={id:"artillery-art",type:"artillery",q:4,r:-2,hp:36,maxHp:36,energy:30,maxEnergy:30,cooldown:0};
    state.structures.set(api.key(artillery.q,artillery.r),artillery);state.selected={type:"structure",id:artillery.id};context.textCalls.length=0;context.strokeCalls.length=0;

    api.drawStructures();
    const point=api.axialToWorld(artillery.q,artillery.r),label=context.textCalls.find(call=>call.text==="A"&&call.x===point.x&&call.y===point.y+.5);
    assert.ok(label);assert.equal(label.fillStyle,"#fff4ea");

    context.strokeCalls.length=0;api.drawTurretRanges();
    assert.equal(context.strokeCalls.filter(call=>call.strokeStyle==="rgba(96,213,219,.34)"&&call.lineWidth===1.4).length,72,"a radius-12 hex has 72 boundary tiles");
  });

  test("particles and projectile effects render beneath unit bodies and labels",()=>{
    const source=api.render.toString(),effects=source.indexOf("drawEffects()"),hives=source.indexOf("drawHives()"),structures=source.indexOf("drawStructures()"),trains=source.indexOf("drawTrains()"),enemies=source.indexOf("drawEnemies()");
    assert.ok(effects>=0);
    assert.ok(effects<hives&&effects<structures&&effects<trains&&effects<enemies);
  });

  test("seven Creeps render at seven separated positions within one hex",()=>{
    const context=elements.get("gameCanvas").context;
    api.state.enemies=Array.from({length:7},(_,slot)=>makeEnemy(`enemy-${slot+1}`,5,2,slot));
    context.translateCalls.length=0;context.scaleCalls.length=0;api.drawEnemies();
    assert.equal(new Set(context.translateCalls.map(call=>`${call.x.toFixed(4)},${call.y.toFixed(4)}`)).size,7);
    assert.equal(context.scaleCalls.length,7);
    assert.ok(context.scaleCalls.every(call=>call.x<=api.constants.CREEP_RENDER_SCALE*1.08&&call.y===call.x));
  });
});
