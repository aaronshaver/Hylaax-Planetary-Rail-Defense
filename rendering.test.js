"use strict";

const assert = require("node:assert/strict");
const { describe, test, beforeEach } = require("node:test");
const { api, elements, makeEnemy } = require("./harness.js");

beforeEach(() => { api.reset(); });

describe("rendering caches", () => {
  test("all gray Track junction hubs render after every black rail bed",()=>{
    const context=elements.get("gameCanvas").context,state=api.state,{makeTrack}=require("./harness.js");state.tracks.clear();
    const a=makeTrack(1,0,["0,0"]),b=makeTrack(0,0,["1,0","-1,0"]),c=makeTrack(-1,0,["0,0"]);
    state.tracks.set("1,0",a);state.tracks.set("0,0",b);state.tracks.set("-1,0",c);context.paintCalls.length=0;api.drawTracks();
    const lastBed=context.paintCalls.map((call,index)=>({call,index})).filter(({call})=>call.kind==="stroke"&&call.strokeStyle==="#0a0d0f"&&call.lineWidth===15).at(-1)?.index;
    const firstHub=context.paintCalls.findIndex(call=>call.kind==="fill"&&call.fillStyle==="#0a0d0f"&&call.path.some(item=>item.command==="arc"&&item.r===7.5));
    assert.ok(lastBed>=0&&firstHub>lastBed,"no later rail bed may cover a surfaced junction hub");
  });

  test("Build Track glow uses wall-clock time and remains animated while paused",()=>{
    const state=api.state;state.mode="track";state.paused=true;state.elapsed=0;
    const first=api.trackGlowPhase(1000);state.elapsed=9999;
    assert.equal(api.trackGlowPhase(1000),first,"simulation time must not affect the pulse");
    assert.notEqual(api.trackGlowPhase(1250),first,"wall-clock time must advance the pulse");
    assert.equal(api.trackGlowAnimationActive(),true,"paused Track mode must request animation frames");
  });

  test("nearby activity messages stack in the defined priority order", () => {
    api.showWorldActivity({ q: 1, r: 0, type: "turret" }, "Train A: Supplied turret with energy");
    api.showWorldActivity({ q: 0, r: 1, type: "mine" }, "Train A: Mined energy");
    api.showWorldActivity({ q: 0, r: 0, type: "base" }, "Train A: Repaired base");
    const layout = api.worldMessageLayout();
    assert.equal(layout.map(entry => entry.item.message).join("|"), "Train A: Repaired base|Train A: Mined energy|Train A: Supplied turret with energy");
    assert.ok(layout[0].y < layout[1].y && layout[1].y < layout[2].y);
  });

  test("every Train Stop persistently draws supply lines without needing selection",()=>{
    const context=elements.get("gameCanvas").context,state=api.state;
    const {addTestTrain,makeTrack}=require("./harness.js"),train=addTestTrain(),stop={q:2,r:0};
    train.schedule=[stop];state.tracks.set("2,0",makeTrack(2,0));state.selected=null;
    const targets=[
      state.base,
      {id:"stop-turret",type:"turret",q:3,r:0,hp:18,maxHp:18,energy:0,maxEnergy:20},
      {id:"stop-artillery",type:"artillery",q:2,r:-1,hp:36,maxHp:36,energy:0,maxEnergy:40},
      {id:"stop-mine",type:"mine",q:3,r:-1,hp:22,maxHp:22,resource:"material"},
      {id:"stop-wall",type:"wall",q:5,r:0,hp:100,maxHp:100},
      {id:"stop-wall-range-five",type:"wall",q:7,r:0,hp:100,maxHp:100}
    ];
    for(const target of targets.slice(1))state.structures.set(api.key(target.q,target.r),target);
    state.structures.set("8,0",{id:"far-wall",type:"wall",q:8,r:0,hp:100,maxHp:100});
    state.structures.set("4,-1",{id:"far-turret",type:"turret",q:4,r:-1,hp:18,maxHp:18,energy:0,maxEnergy:20});
    context.strokeCalls.length=0;

    api.drawStopSupplyLines();

    const lines=context.strokeCalls.filter(call=>call.strokeStyle==="rgba(112,189,119,.44)"&&call.lineWidth===2.2),start=api.axialToWorld(stop.q,stop.r);
    assert.equal(lines.length,6,"Base, mine, turret, artillery, and walls up to five hexes away should connect");
    assert.ok(lines.every(call=>call.path.length===2&&call.path[0].command==="moveTo"&&call.path[0].x===start.x&&call.path[0].y===start.y),"every line should begin at the center of the Stop's Track hex");
    const endpoints=new Set(lines.map(call=>`${call.path[1].x},${call.path[1].y}`));
    for(const target of targets){const cell=target.type==="base"?api.nearestStructureCell(stop,target):target,point=api.axialToWorld(cell.q,cell.r);assert.ok(endpoints.has(`${point.x},${point.y}`),target.type);}
    assert.equal(lines.some(call=>call.path.length>2),false,"the former large hex outline must not be drawn");

    state.structures.delete("3,-1");context.strokeCalls.length=0;api.render();
    assert.equal(context.strokeCalls[0].strokeStyle,"rgba(112,189,119,.44)","persistent supply lines must render below every world object");
  });

  test("Train Stop bubbles are raised, larger, and solid medium green",()=>{
    const context=elements.get("gameCanvas").context,state=api.state,{addTestTrain,makeTrack}=require("./harness.js"),train=addTestTrain(),stop={q:1,r:0};
    train.schedule=[stop];state.tracks.set("1,0",makeTrack(1,0));context.textCalls.length=0;context.fillCalls.length=0;context.strokeCalls.length=0;

    api.drawTrainStops();

    const point=api.axialToWorld(stop.q,stop.r),label=context.textCalls.find(call=>call.text==="A1");
    assert.match(label.font,/11px/);assert.equal(label.x,point.x);assert.equal(label.y,point.y+19);assert.equal(label.fillStyle,"#fff");
    assert.ok(context.fillCalls.some(call=>call.fillStyle==="#3d8255"),"Stop bubble should use a solid medium-green fill");
    assert.equal(context.strokeCalls.length,0,"Stop bubble should not have an outline");
  });

  test("world activity messages use white text with a green outline",()=>{
    const context=elements.get("gameCanvas").context;
    api.showWorldActivity({q:2,r:2,type:"mine"},"Train A: Mined energy");
    context.textCalls.length=0;context.strokeCalls.length=0;

    api.drawWorldMessages();

    assert.equal(context.textCalls.find(call=>call.text==="Train A: Mined energy").fillStyle,"#f3f7f8");
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

  test("terrain compositing crops the overscanned bitmap to the visible viewport",()=>{
    const context=elements.get("gameCanvas").context;api.ensureTerrainLayer();context.drawImageCalls.length=0;

    api.drawTerrainLayer();

    const call=context.drawImageCalls.at(-1)?.args;assert.equal(call.length,9,"the terrain layer should use a source and destination crop");
    const [source,sourceX,sourceY,sourceWidth,sourceHeight,destinationX,destinationY,destinationWidth,destinationHeight]=call;
    assert.ok(sourceX>0&&sourceY>0,"the centered viewport should skip the overscan around its top and left edges");
    assert.ok(sourceWidth<source.width&&sourceHeight<source.height,"the full oversized bitmap must not be submitted for scaling");
    assert.deepEqual([destinationX,destinationY,destinationWidth,destinationHeight],[0,0,1024,768]);
  });

  test("zoom input is coalesced and reuses the overscanned terrain layer in both directions until the gesture settles",()=>{
    api.ensureTerrainLayer();const first=api.terrainLayerStats(),initialZoom=api.state.camera.zoom;

    api.queueCameraZoom(-40,512,384);api.queueCameraZoom(-40,512,384);

    assert.ok(api.state.camera.zoom>initialZoom);assert.equal(api.terrainLayerStats().builds,first.builds,"wheel input must not render synchronously");
    api.render();assert.equal(api.terrainLayerStats().builds,first.builds,"zoom-in frames should transform the covering cached terrain");
    assert.equal(api.finishZoomGesture(),true);api.render();assert.equal(api.terrainLayerStats().builds,first.builds+1,"settling should rebuild terrain once at final zoom");

    const zoomedIn=api.terrainLayerStats(),zoomedInLevel=api.state.camera.zoom;
    api.queueCameraZoom(40,512,384);api.queueCameraZoom(40,512,384);
    assert.ok(api.state.camera.zoom<zoomedInLevel);api.render();assert.equal(api.terrainLayerStats().builds,zoomedIn.builds,"modest zoom-out frames should remain inside the overscanned terrain");
    assert.equal(api.finishZoomGesture(),true);api.render();assert.equal(api.terrainLayerStats().builds,zoomedIn.builds+1,"zoom-out settling should rebuild once at final zoom");
  });

  test("pan input transforms the overscanned terrain and rebuilds once after the drag settles",()=>{
    api.ensureTerrainLayer();const first=api.terrainLayerStats(),state=api.state;
    state.pointer.down=true;state.pointer.startX=100;state.pointer.startY=100;state.pointer.camX=state.camera.x;state.pointer.camY=state.camera.y;

    assert.equal(api.queueCameraPan(120,110),true);assert.equal(api.queueCameraPan(140,125),true);

    assert.equal(state.camera.x,state.pointer.camX-40/state.camera.zoom);assert.equal(state.camera.y,state.pointer.camY-25/state.camera.zoom);
    assert.equal(api.terrainLayerStats().builds,first.builds,"pointer input must wait for the animation frame instead of rendering for every event");
    api.render();assert.equal(api.terrainLayerStats().builds,first.builds,"drag frames should transform the covering overscanned terrain");
    state.pointer.down=false;api.render();assert.equal(api.terrainLayerStats().builds,first.builds+1,"the settled camera should rebuild terrain once");
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
    hive.productionPulseUntil=api.state.elapsed+.75;context.strokeCalls.length=0;context.textCalls.length=0;

    api.drawHives();
    assert.ok(context.strokeCalls.some(call=>call.strokeStyle==="#ff4054"&&call.lineWidth>2.5));
    const hivePoint=api.axialToWorld(hive.q,hive.r),hiveBorder=context.strokeCalls.find(call=>call.strokeStyle==="#d33a51"&&call.lineWidth===2.2);
    assert.ok(hiveBorder.path.some(item=>item.command==="lineTo"&&Math.hypot(item.x-hivePoint.x,item.y-hivePoint.y)>22),"the hive's colored interior border should sit closer to the hex edge");
    const hiveLabel=context.textCalls.find(call=>call.text==="H");assert.equal(hiveLabel.fillStyle,"#ff8793");assert.equal(hiveLabel.font,"900 20px ui-monospace, monospace");

    api.state.elapsed=.76;context.strokeCalls.length=0;api.drawHives();
    assert.equal(context.strokeCalls.some(call=>call.strokeStyle==="#ff4054"),false);
  });

  test("a lost Base renders as a muted destroyed icon",()=>{
    const context=elements.get("gameCanvas").context;
    api.state.base.hp=0;api.state.gameOver=true;context.textCalls.length=0;

    api.drawBase();

    const baseLabels=context.textCalls.filter(call=>call.text==="B");
    assert.equal(baseLabels.length,4);assert.ok(baseLabels.every(label=>label.fillStyle==="#f3f7f8"&&label.font==="900 16.5px ui-monospace, monospace"));
  });

  test("the live Base renders one B on each of its four diamond cells",()=>{
    const context=elements.get("gameCanvas").context;context.textCalls.length=0;context.fillRectCalls.length=0;api.drawBase();
    const labels=context.textCalls.filter(call=>call.text==="B"&&call.fillStyle==="#f3f7f8"&&call.font==="900 16.5px ui-monospace, monospace");
    assert.equal(labels.length,4);
    const expected=new Set(api.structureFootprint(api.state.base).map(cell=>{const point=api.axialToWorld(cell.q,cell.r);return `${point.x},${point.y+.5}`;}));
    assert.deepEqual(new Set(labels.map(label=>`${label.x},${label.y}`)),expected);
    assert.equal(context.fillRectCalls.some(call=>call.width===34&&call.height===28),false,"Base cells should not use rectangular center panels");
  });

  test("Base, Turret, Artillery, Mine, Research, and Neutralizer buildings keep static glows in every resource state",()=>{
    const context=elements.get("gameCanvas").context,state=api.state,node=api.resourceNodeAt(7,-2);api.setNodeAmount(node,0);state.structures.clear();
    const structures=[
      {id:"glow-turret",type:"turret",q:10,r:10,hp:20,maxHp:20,energy:0,maxEnergy:20},
      {id:"glow-artillery",type:"artillery",q:12,r:10,hp:36,maxHp:36,energy:0,maxEnergy:50},
      {id:"glow-mine",type:"mine",resource:"material",q:node.q,r:node.r,hp:22,maxHp:22},
      {id:"glow-research",type:"research",q:16,r:10,hp:300,maxHp:300,footprint:[{q:16,r:10},{q:17,r:10},{q:16,r:11}]},
      {id:"glow-neutralizer",type:"neutralizer-building",q:20,r:10,hp:200,maxHp:200,material:15,energy:15,maxMaterial:20,maxEnergy:20,footprint:[{q:20,r:10},{q:21,r:10}]}
    ];
    for(const structure of structures)state.structures.set(api.key(structure.q,structure.r),structure);
    context.fillCalls.length=0;context.strokeCalls.length=0;api.drawBase();api.drawStructures();
    assert.ok(context.fillCalls.some(call=>call.fillStyle==="#24352c"&&call.shadowBlur===12&&call.shadowColor==="rgba(105,196,127,.28)"),"Base building should retain its green static glow");
    assert.ok(context.strokeCalls.some(call=>call.strokeStyle==="#69c47f"),"Base building outlines should use the green palette");
    assert.ok(context.fillCalls.some(call=>call.fillStyle==="#4b3028"&&call.shadowBlur===12&&call.shadowColor==="#ef9b54"&&call.path.some(item=>item.command==="arc"&&item.r===20)),"an empty Turret should retain its orange static glow");
    assert.ok(context.fillCalls.some(call=>call.fillStyle==="#4b3028"&&call.shadowBlur===12&&call.shadowColor==="#ef9b54"&&call.path.every(item=>item.command!=="arc")),"empty Artillery should retain its orange static glow");
    assert.ok(context.fillCalls.some(call=>call.fillStyle==="#34393c"&&call.shadowBlur===10&&call.shadowColor==="#70787c"),"an exhausted Mine should retain a static gray glow");
    assert.ok(context.fillCalls.some(call=>call.fillStyle==="#29233a"&&call.shadowBlur===12&&call.shadowColor==="rgba(184,121,255,.35)"),"Research should retain its purple static glow");
    assert.ok(context.fillCalls.some(call=>call.fillStyle==="#8b552f"&&call.shadowBlur===10&&call.shadowColor==="rgba(239,155,84,.35)"),"Neutralizer buildings should retain their orange static glow");
    assert.ok(context.strokeCalls.filter(call=>call.shadowColor==="#ff3848"&&call.shadowBlur>0).length>=2,"existing low-energy red warning pulses should remain");
  });

  test("building and resource-node letters share one medium very-light-gray style and larger circles",()=>{
    const context=elements.get("gameCanvas").context,state=api.state;
    const structures=[
      {id:"glyph-turret",type:"turret",q:10,r:10,hp:20,maxHp:20,energy:20,maxEnergy:20},
      {id:"glyph-artillery",type:"artillery",q:12,r:10,hp:36,maxHp:36,energy:50,maxEnergy:50},
      {id:"glyph-wall",type:"wall",q:14,r:10,hp:100,maxHp:100},
      {id:"glyph-research",type:"research",q:16,r:10,hp:300,maxHp:300,footprint:[{q:16,r:10},{q:17,r:10},{q:16,r:11}]}
    ];
    for(const structure of structures)state.structures.set(api.key(structure.q,structure.r),structure);
    context.textCalls.length=0;context.strokeCalls.length=0;api.drawBase();api.drawStructures();
    const material={q:7,r:-2},energy={q:-4,r:7};
    api.drawResourceNode(material.q,material.r,api.axialToWorld(material.q,material.r),"material");
    api.drawResourceNode(energy.q,energy.r,api.axialToWorld(energy.q,energy.r),"energy");

    const glyphs=context.textCalls.filter(call=>["B","T","A","W","R","C","E"].includes(call.text));
    assert.equal(glyphs.length,12);assert.ok(glyphs.every(call=>call.fillStyle==="#f3f7f8"&&call.font==="900 16.5px ui-monospace, monospace"));
    assert.ok(context.strokeCalls.some(call=>call.strokeStyle==="#ef9b54"&&call.path.some(item=>item.command==="arc"&&item.r===20)),"turret circle should use the larger radius and offensive orange");
    for(const color of ["#a28d5e","#568f92"])assert.ok(context.strokeCalls.some(call=>call.strokeStyle===color&&call.path.some(item=>item.command==="arc"&&item.r===20)),`${color} resource-node circle should use the larger radius`);
    const artilleryPoint=api.axialToWorld(12,10),artilleryOutline=context.strokeCalls.find(call=>call.strokeStyle==="#ef9b54"&&call.path.every(item=>item.command!=="arc"));
    assert.ok(artilleryOutline.path.some(item=>item.command==="lineTo"&&Math.hypot(item.x-artilleryPoint.x,item.y-artilleryPoint.y)>21),"artillery outline should sit closer to the hex edge");
  });

  test("fixed Turrets omit the gray gun and constructed Mines use a triangular roof",()=>{
    const context=elements.get("gameCanvas").context,state=api.state;
    const turret={id:"turret-art",type:"turret",q:2,r:1,hp:18,maxHp:18,energy:10,maxEnergy:20,cooldown:0};
    const mine={id:"mine-art",type:"mine",resource:"material",q:7,r:-2,hp:22,maxHp:22};
    state.structures.set(api.key(turret.q,turret.r),turret);state.structures.set(api.key(mine.q,mine.r),mine);
    context.strokeCalls.length=0;context.fillCalls.length=0;context.fillRectCalls.length=0;context.textCalls.length=0;
    api.drawStructures();
    assert.equal(context.strokeCalls.some(call=>call.strokeStyle==="#b7c6c9"&&call.lineWidth===4),false);
    assert.ok(context.strokeCalls.some(call=>call.strokeStyle==="#ef9b54"&&call.path.some(item=>item.command==="arc"&&item.r===20)),"fixed Turret outline should be orange and enlarged");
    assert.ok(context.fillCalls.some(call=>call.path.filter(item=>item.command==="lineTo").length===2&&call.path.some(item=>item.command==="closePath")),"Mine should render a filled triangular roof");
    const mineLabel=context.textCalls.find(call=>call.text==="M:C");assert.equal(mineLabel.font,"900 11px ui-monospace, monospace");assert.equal(mineLabel.fillStyle,"#f3f7f8","mine lettering should remain unchanged");
    assert.equal(context.fillCalls.some(call=>call.path.some(item=>item.command==="arc"&&item.r===7)),false,"Turret must not have a center circle");
    const minePoint=api.axialToWorld(mine.q,mine.r);
    assert.equal(context.fillRectCalls.some(call=>call.x===minePoint.x-13&&call.y===minePoint.y-7&&call.width===26&&call.height===14),false,"Mine must not have a center rectangle");
  });

  test("orange offensive buildings use distinct cached line textures",()=>{
    const context=elements.get("gameCanvas").context,state=api.state;
    const turret={id:"turret-texture",type:"turret",q:2,r:1,hp:20,maxHp:20,energy:10,maxEnergy:20,cooldown:0};
    const artillery={id:"artillery-texture",type:"artillery",q:5,r:1,hp:36,maxHp:36,energy:50,maxEnergy:50,cooldown:0};
    const neutralizer={id:"neutralizer-texture",type:"neutralizer-building",q:8,r:1,footprint:[{q:8,r:1},{q:8,r:2}],hp:200,maxHp:200,material:0,energy:0,maxMaterial:20,maxEnergy:20,productionClock:0};
    for(const structure of [turret,artillery,neutralizer])state.structures.set(api.key(structure.q,structure.r),structure);
    context.strokeCalls.length=0;api.drawStructures();

    const textures=context.strokeCalls.filter(call=>(call.strokeStyle==="#5e696c"||call.strokeStyle==="#3b4244")&&call.lineWidth===1.4);
    assert.equal(textures.length,4,"T and A should each have one texture, while both N cells should be textured");
    assert.equal(textures.filter(call=>call.strokeStyle==="#5e696c").length,2,"T and A should use the brighter texture color");
    assert.equal(textures.filter(call=>call.strokeStyle==="#3b4244").length,2,"both N cells should use the darker texture color");
    const segments=call=>Array.from({length:call.path.length/2},(_,index)=>({from:call.path[index*2],to:call.path[index*2+1]}));
    assert.equal(textures.filter(call=>segments(call).every(({from,to})=>from.x!==to.x&&from.y!==to.y)).length,1,"T should use diagonal texture lines");
    assert.equal(textures.filter(call=>segments(call).every(({from,to})=>from.x===to.x&&from.y!==to.y)).length,1,"A should use vertical texture lines");
    assert.equal(textures.filter(call=>segments(call).every(({from,to})=>from.x!==to.x&&from.y===to.y)).length,2,"N should use horizontal texture lines on both cells");
    assert.ok(textures.every(call=>call.path.length===8),"each textured cell should contain four tiny line segments");
  });

  test("a destroyed Mine suppresses its Resource Node's low-resource red pulse",()=>{
    const context=elements.get("gameCanvas").context,state=api.state,node=api.resourceNodeAt(7,-2);api.setNodeAmount(node,1);const point=api.axialToWorld(node.q,node.r);
    context.strokeCalls.length=0;api.drawResourceNode(node.q,node.r,point,node.type);assert.ok(context.strokeCalls.some(call=>call.shadowColor==="#ff3848"&&call.shadowBlur>0));
    state.ghosts.set(api.key(node.q,node.r),{id:api.key(node.q,node.r),type:"ghost",objectType:"mine",resource:node.type,q:node.q,r:node.r});context.strokeCalls.length=0;api.drawResourceNode(node.q,node.r,point,node.type);
    assert.equal(context.strokeCalls.some(call=>call.shadowColor==="#ff3848"&&call.shadowBlur>0),false);
  });

  test("destroyed graphics mirror live silhouettes and use a tiny lower X marker",()=>{
    const context=elements.get("gameCanvas").context,state=api.state;
    const turret={id:"2,1",type:"ghost",objectType:"turret",q:2,r:1},artillery={id:"4,1",type:"ghost",objectType:"artillery",q:4,r:1},track={id:"6,1",type:"ghost",objectType:"track",q:6,r:1,links:["7,1"]};
    state.ghosts.set(turret.id,turret);state.ghosts.set(artillery.id,artillery);state.ghosts.set(track.id,track);context.strokeCalls.length=0;context.fillCalls.length=0;context.textCalls.length=0;
    api.drawGhosts();
    const turretPoint=api.axialToWorld(turret.q,turret.r),artilleryPoint=api.axialToWorld(artillery.q,artillery.r);
    assert.ok(context.fillCalls.some(call=>call.path.some(item=>item.command==="arc"&&item.x===turretPoint.x&&item.y===turretPoint.y&&item.r===20)),"destroyed Turret should retain the enlarged live circular body");
    assert.equal(context.strokeCalls.some(call=>call.path.some(item=>item.command==="lineTo"&&item.x===turretPoint.x+17&&item.y===turretPoint.y-8)),false,"destroyed Turret must not restore the obsolete gun arm");
    const turretLabel=context.textCalls.find(call=>call.text==="T"&&call.x===turretPoint.x&&call.y===turretPoint.y+.5);
    assert.equal(turretLabel.fillStyle,"#f3f7f8","destroyed Turret should retain the standardized very-light-gray T with no cyan center effect");assert.equal(turretLabel.font,"900 16.5px ui-monospace, monospace");
    assert.equal([...context.fillCalls,...context.strokeCalls,...context.textCalls].some(call=>call.fillStyle==="#60d5db"||call.strokeStyle==="#60d5db"),false,"destroyed graphics must not add cyan center effects");
    assert.ok(context.textCalls.some(call=>call.text==="A"&&call.x===artilleryPoint.x&&call.y===artilleryPoint.y+.5));
    assert.ok(context.strokeCalls.some(call=>call.strokeStyle==="#697276"&&call.lineWidth===3),"destroyed Track should retain its cross ties");
    assert.ok(context.strokeCalls.some(call=>call.strokeStyle==="#a3adaf"&&call.lineWidth===2.6),"destroyed Track should retain its two rails");
    assert.ok(context.fillCalls.some(call=>call.fillStyle==="#252a2c"&&call.path.some(item=>item.command==="arc"&&item.r===7.5)),"destroyed Track should retain its circular rail hub");
    const markers=context.strokeCalls.filter(call=>call.strokeStyle==="#d77a7f"&&call.lineWidth===1);
    assert.equal(markers.length,3);assert.ok(markers.every(call=>call.path.every(item=>item.y>=Math.min(turretPoint.y,artilleryPoint.y)+18)),"wreckage markers should stay below center labels");
  });

  test("Train cars render without brown connector strokes",()=>{
    const context=elements.get("gameCanvas").context;
    const { addTestTrain }=require("./harness.js");addTestTrain("builder");
    context.strokeCalls.length=0;api.drawTrains();
    assert.equal(context.strokeCalls.some(call=>call.strokeStyle==="#79502f"),false);
  });

  test("each Train car uses a Train Stop-green circular badge with white Train-code text",()=>{
    const context=elements.get("gameCanvas").context;
    const { addTestTrain }=require("./harness.js");addTestTrain("builder");
    context.textCalls.length=0;context.fillCalls.length=0;context.strokeCalls.length=0;api.drawTrains();
    assert.deepEqual(context.textCalls.map(call=>call.text),["S","S","L","A","A","A"]);
    assert.equal(context.fillCalls.filter(call=>call.fillStyle==="#3d8255"&&call.path.some(item=>item.command==="arc"&&item.r===8)).length,3);
    assert.equal(context.strokeCalls.filter(call=>call.strokeStyle==="#fff"&&call.lineWidth===1&&call.path.some(item=>item.command==="arc"&&item.r===8)).length,3);
    assert.equal(context.textCalls.filter(call=>call.text==="A"&&call.fillStyle==="#fff"&&call.font==="900 10px ui-monospace, monospace").length,3);
    assert.equal(context.strokeCalls.some(call=>call.strokeStyle==="#79502f"||call.strokeStyle==="#b88a50"||call.strokeStyle==="#e6b94a"),false);
  });

  test("each Train car keeps its assigned subtle color shade",()=>{
    const context=elements.get("gameCanvas").context;
    const { addTestTrain }=require("./harness.js"),train=addTestTrain("builder");
    train.colorShade=0;train.wagons[0].colorShade=2;train.wagons[1].colorShade=0;context.fillRectCalls.length=0;

    api.drawTrains();
    const firstColors=context.fillRectCalls.filter(call=>call.width===28&&call.height===18).map(call=>call.fillStyle);
    assert.deepEqual(firstColors,["#a88a42","#2a666c","#872a32"]);

    context.fillRectCalls.length=0;api.drawTrains();
    assert.deepEqual(context.fillRectCalls.filter(call=>call.width===28&&call.height===18).map(call=>call.fillStyle),firstColors,"car shades should remain stable across renders");
  });

  test("Turret Trains have a three-shade orange locomotive with no visible weapon or center mount",()=>{
    const context=elements.get("gameCanvas").context;
    const { addTestTrain }=require("./harness.js"),train=addTestTrain("combat");
    context.strokeCalls.length=0;context.fillRectCalls.length=0;
    for(let shade=0;shade<3;shade++){train.colorShade=shade;api.drawTrains();}
    assert.equal(context.strokeCalls.some(call=>call.strokeStyle==="#83edf2"&&call.lineWidth===4),false);
    const locomotiveColors=context.fillRectCalls.filter(call=>call.width===28&&call.height===18&&api.constants.TRAIN_CAR_COLORS.combat.includes(call.fillStyle)).map(call=>call.fillStyle);
    assert.deepEqual(locomotiveColors,["#7c4a28","#9b5d32","#ba703c"]);assert.ok(context.fillRectCalls.filter(call=>api.constants.TRAIN_CAR_COLORS.combat.includes(call.fillStyle)).every(call=>call.shadowColor==="#ef9b54"&&call.shadowBlur===12));
  });

  test("Walls render as dark gray brickwork with a centered W",()=>{
    const context=elements.get("gameCanvas").context,state=api.state;
    const wall={id:"wall-art",type:"wall",q:5,r:2,hp:100,maxHp:100};
    state.structures.set(api.key(wall.q,wall.r),wall);context.textCalls.length=0;context.fillCalls.length=0;context.fillRectCalls.length=0;context.strokeCalls.length=0;

    api.drawStructures();

    const point=api.axialToWorld(wall.q,wall.r),label=context.textCalls.find(call=>call.text==="W"&&call.x===point.x&&call.y===point.y+.5);
    assert.ok(label);assert.equal(label.fillStyle,"#f3f7f8");assert.equal(label.font,"900 16.5px ui-monospace, monospace");
    const wallFace=context.fillCalls.find(call=>call.fillStyle==="#51585a");assert.ok(wallFace,"Wall should have a filled masonry face");
    assert.ok(wallFace.path.filter(item=>item.command==="lineTo").length>=5,"Wall face should fill a broad hexagonal silhouette");
    assert.equal(context.fillRectCalls.some(call=>call.fillStyle==="#51585a"),false,"Wall should no longer be a small rectangle");
    assert.ok(context.strokeCalls.some(call=>call.strokeStyle==="#373e41"&&call.path.length>=10),"Wall should include visible brick joints");
  });

  test("Build Wall previews its five-hex repair range around the hovered tile",()=>{
    const context=elements.get("gameCanvas").context,state=api.state;
    state.mode="wall";state.hover={q:4,r:2};context.strokeCalls.length=0;

    api.drawTurretRanges();

    const boundary=context.strokeCalls.filter(call=>call.strokeStyle==="rgba(230,185,74,.5)"&&call.lineWidth===1.4);
    assert.equal(boundary.length,30,"a radius-five hex has 30 boundary tiles");
  });

  test("a Wall never shows a blue range after placement or when selected",()=>{
    const context=elements.get("gameCanvas").context,state=api.state;
    const wall={id:"wall-selected-range",type:"wall",q:3,r:-1,hp:100,maxHp:100};
    state.structures.set(api.key(wall.q,wall.r),wall);state.mode="select";state.hover=null;state.selected={type:"structure",id:wall.id};context.strokeCalls.length=0;

    api.drawTurretRanges();

    const boundary=context.strokeCalls.filter(call=>call.strokeStyle==="rgba(96,213,219,.34)"&&call.lineWidth===1.4);
    assert.equal(boundary.length,0,"a selected Wall must not show a blue range");
  });

  test("a fixed Turret blue range appears only when selected in Select Object mode",()=>{
    const context=elements.get("gameCanvas").context,state=api.state;
    const turret={id:"turret-range",type:"turret",q:3,r:-1,hp:20,maxHp:20,energy:20,maxEnergy:20,cooldown:0,showRangeUntil:state.elapsed+3.5};
    state.structures.set(api.key(turret.q,turret.r),turret);state.mode="select";state.hover=null;state.selected=null;context.strokeCalls.length=0;

    api.drawTurretRanges();
    assert.equal(context.strokeCalls.filter(call=>call.strokeStyle==="rgba(96,213,219,.34)").length,0,"a build timer must not keep the range visible");

    state.selected={type:"structure",id:turret.id};context.strokeCalls.length=0;api.drawTurretRanges();
    assert.ok(context.strokeCalls.some(call=>call.strokeStyle==="rgba(96,213,219,.34)"),"selection should still show the Turret range");

    state.mode="turret";state.hover={q:5,r:2};context.strokeCalls.length=0;api.drawTurretRanges();
    assert.equal(context.strokeCalls.filter(call=>call.strokeStyle==="rgba(96,213,219,.34)").length,0,"Build Turret mode must never show the selected Turret's blue range");
    assert.ok(context.strokeCalls.some(call=>call.strokeStyle==="rgba(230,185,74,.5)"),"Build Turret mode should retain its orange placement range");
  });

  test("Artillery renders a centered A and a selected 11-hex range",()=>{
    const context=elements.get("gameCanvas").context,state=api.state;
    const artillery={id:"artillery-art",type:"artillery",q:4,r:-2,hp:36,maxHp:36,energy:40,maxEnergy:40,cooldown:0};
    state.structures.set(api.key(artillery.q,artillery.r),artillery);state.mode="select";state.selected={type:"structure",id:artillery.id};context.textCalls.length=0;context.strokeCalls.length=0;

    api.drawStructures();
    const point=api.axialToWorld(artillery.q,artillery.r),label=context.textCalls.find(call=>call.text==="A"&&call.x===point.x&&call.y===point.y+.5);
    assert.ok(label);assert.equal(label.fillStyle,"#f3f7f8");assert.equal(label.font,"900 16.5px ui-monospace, monospace");

    context.strokeCalls.length=0;api.drawTurretRanges();
    assert.equal(context.strokeCalls.filter(call=>call.strokeStyle==="rgba(96,213,219,.34)"&&call.lineWidth===1.4).length,66,"a radius-11 hex has 66 boundary tiles");

    state.mode="artillery";state.hover={q:6,r:-2};context.strokeCalls.length=0;api.drawTurretRanges();
    assert.equal(context.strokeCalls.filter(call=>call.strokeStyle==="rgba(96,213,219,.34)").length,0,"Build Artillery mode must never show the selected Artillery's blue range");
    assert.ok(context.strokeCalls.some(call=>call.strokeStyle==="rgba(230,185,74,.5)"),"Build Artillery mode should retain its orange placement range");
  });

  test("Artillery shells arc without a laser and impacts outline all three damage rings",()=>{
    const context=elements.get("gameCanvas").context,state=api.state;
    state.projectiles=[{kind:"artillery-shell",x1:0,y1:0,x2:100,y2:20,centerQ:3,centerR:1,life:.35,maxLife:.7}];context.fillCalls.length=0;context.strokeCalls.length=0;

    api.drawEffects();

    const shell=context.fillCalls.find(call=>call.path.some(item=>item.command==="arc"&&item.r===4.5));
    assert.ok(shell,"the shell should be rendered as a projectile");
    assert.ok(shell.path.find(item=>item.command==="arc").y<0,"the midpoint of the shell should rise above its straight path");
    assert.equal(context.strokeCalls.length,0,"the flying shell must not draw a laser line");

    state.projectiles=[{kind:"artillery-blast",q:3,r:1,life:.75,maxLife:.75}];context.strokeCalls.length=0;context.fillCalls.length=0;api.drawEffects();
    assert.equal(context.strokeCalls.filter(call=>call.strokeStyle==="#ff9d58"&&call.lineWidth===2.5).length,1);
    assert.equal(context.strokeCalls.filter(call=>call.strokeStyle==="#b84f22"&&call.lineWidth===2.5).length,6);
    assert.equal(context.strokeCalls.filter(call=>call.strokeStyle==="#692a19"&&call.lineWidth===2.5).length,12);
    assert.equal(context.fillCalls.length,19);
  });

  test("unit deaths draw one thin medium X in the defeated side's color",()=>{
    const context=elements.get("gameCanvas").context,state=api.state;state.projectiles=[{kind:"creep-death-x",x:20,y:30,color:"#ff4354",life:.28,maxLife:.28},{kind:"neutralizer-death-x",x:50,y:60,color:"#4bbcff",life:.28,maxLife:.28}];context.strokeCalls.length=0;
    api.drawEffects();const red=context.strokeCalls.find(call=>call.strokeStyle==="#ff4354"),blue=context.strokeCalls.find(call=>call.strokeStyle==="#4bbcff");
    for(const marker of [red,blue]){assert.ok(marker);assert.equal(marker.lineWidth,1.4);assert.deepEqual(marker.path.map(step=>step.command),["moveTo","lineTo","moveTo","lineTo"]);const xs=marker.path.map(step=>step.x),ys=marker.path.map(step=>step.y);assert.equal(Math.max(...xs)-Math.min(...xs),16);assert.equal(Math.max(...ys)-Math.min(...ys),16);}
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

  test("unit shadow blurs disable independently above 100 units and return at 100",()=>{
    const context=elements.get("gameCanvas").context,state=api.state,units=(kind,count)=>Array.from({length:count},(_,index)=>({...makeEnemy(`${kind}-${index}`,index%15,Math.floor(index/15),index%7),type:kind==="creep"?"enemy":"neutralizer"}));
    state.enemies=units("creep",101);state.neutralizers=units("neutralizer",100);context.fillCalls.length=0;api.drawEnemies();api.drawNeutralizers();
    assert.ok(context.fillCalls.filter(call=>call.fillStyle==="#b92838").every(call=>call.shadowBlur===0),"Creep shadows should be disabled at 101");assert.ok(context.fillCalls.filter(call=>call.fillStyle==="#258fc9").every(call=>call.shadowBlur===13),"Neutralizer shadows should remain at 100");
    state.enemies.pop();state.neutralizers.push({...makeEnemy("neutralizer-101",20,20,0),type:"neutralizer"});context.fillCalls.length=0;api.drawEnemies();api.drawNeutralizers();
    assert.ok(context.fillCalls.filter(call=>call.fillStyle==="#b92838").every(call=>call.shadowBlur===13),"Creep shadows should return at 100");assert.ok(context.fillCalls.filter(call=>call.fillStyle==="#258fc9").every(call=>call.shadowBlur===0),"Neutralizer shadows should be disabled at 101");assert.equal(api.constants.UNIT_SHADOW_RENDER_LIMIT,100);
  });
});
