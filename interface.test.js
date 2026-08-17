"use strict";

const assert = require("node:assert/strict");
const { describe, test, beforeEach } = require("node:test");
const { api, elements, makeEnemy, addTestTrain } = require("./harness.js");

beforeEach(() => { api.reset(); });

describe("interface formatting", () => {
  test("construction tools disable and re-enable at their exact Base costs",()=>{
    const state=api.state;
    const cases=[
      ["trackTool",api.constants.COSTS.track],
      ["turretTool",api.constants.COSTS.turret],
      ["mineTool",api.constants.COSTS.mine],
      ["wallTool",api.constants.COSTS.wall],
      ["artilleryTool",api.constants.COSTS.artillery]
    ];
    for(const [id,cost] of cases){
      state.baseMaterial=cost.material;state.baseEnergy=cost.energy;api.updateUI(true);
      assert.equal(elements.get(id).disabled,false,`${id} should enable at its exact cost`);
      state.baseMaterial=cost.material-1;api.updateUI(true);
      assert.equal(elements.get(id).disabled,true,`${id} should disable when short on Construction Material`);
      if(cost.energy){state.baseMaterial=cost.material;state.baseEnergy=cost.energy-1;api.updateUI(true);assert.equal(elements.get(id).disabled,true,`${id} should disable when short on Energy`);}
    }

    state.baseMaterial=0;state.baseEnergy=0;api.updateUI(true);
    for(const id of ["trackTool","turretTool","mineTool","wallTool","artilleryTool"])assert.equal(elements.get(id).disabled,true,id);
    assert.equal(elements.get("selectTool").disabled,false);
    assert.equal(elements.get("salvageTool").disabled,false);

    state.baseMaterial=100;state.baseEnergy=100;api.updateUI(true);
    for(const id of ["trackTool","turretTool","mineTool","wallTool","artilleryTool"])assert.equal(elements.get(id).disabled,false,id);
  });

  test("unaffordable construction modes cannot be entered and an active one exits when funds fall short",()=>{
    const state=api.state;
    state.baseMaterial=100;state.baseEnergy=99;
    assert.equal(api.setMode("artillery"),false);
    assert.equal(state.mode,"select");

    state.baseEnergy=100;assert.equal(api.setMode("artillery"),true);assert.equal(state.mode,"artillery");
    state.baseEnergy=0;api.updateUI(true);
    assert.equal(state.mode,"select");
    assert.equal(elements.get("artilleryTool").disabled,true);
  });

  test("the loss screen shows lifetime Energy and Construction Material mined",()=>{
    const state=api.state;state.stats.energyMined=123.75;state.stats.materialMined=456;

    api.damageTarget(state.base,state.base.hp);

    assert.equal(elements.get("defeatEnergyMined").textContent,123);
    assert.equal(elements.get("defeatMaterialMined").textContent,456);
  });

  test("survival time includes readable unit spacing", () => {
    assert.equal(api.formatSurvivalTime(7384), "02h 03m 04s");
  });

  test("Hive selection includes its former inspect details", () => {
    const hive = api.createHive(4, 4, 2);
    api.state.selected = { type: "hive", id: hive.id };
    const html = api.selectionHtml();
    assert.match(html, /Level 2 Hive/);
    assert.match(html, /2 Creeps per spawn cycle/);
    assert.match(html, /1 in 2 new Hive expansion chance/);
    assert.doesNotMatch(html, /production choice/);
  });

  test("Mine selection describes Train service at an adjacent Stop",()=>{
    const materialMine={id:"material-mine-copy",type:"mine",resource:"material",q:7,r:-2,hp:22,maxHp:22};
    api.state.structures.set(api.key(materialMine.q,materialMine.r),materialMine);
    api.state.selected={type:"structure",id:materialMine.id};
    assert.match(api.selectionHtml(),/A Train at an adjacent Stop instantly Mines and loads Construction Material/);

    const energyMine={id:"energy-mine-copy",type:"mine",resource:"energy",q:-4,r:7,hp:22,maxHp:22};
    api.state.structures.set(api.key(energyMine.q,energyMine.r),energyMine);
    api.state.selected={type:"structure",id:energyMine.id};
    assert.match(api.selectionHtml(),/A Train at an adjacent Stop instantly Mines and loads Energy/);
  });

  test("Artillery selection reports its range, cadence, splash damage, and friendly-fire safety",()=>{
    const artillery={id:"artillery-copy",type:"artillery",q:6,r:-2,hp:36,maxHp:36,energy:40,maxEnergy:40,cooldown:0};
    api.state.structures.set(api.key(artillery.q,artillery.r),artillery);api.state.selected={type:"structure",id:artillery.id};
    const html=api.selectionHtml();
    assert.match(html,/Artillery/);assert.match(html,/Targets Hives only/);assert.match(html,/Range 12 hexes/);assert.match(html,/Lobs a shell every 3 seconds/);assert.match(html,/20 Energy per shot/);assert.match(html,/8 center damage \+ 5 damage/);assert.match(html,/Creeps can take splash damage/);assert.match(html,/No friendly fire/);
  });

  test("the selection label is hidden only when nothing is selected",()=>{
    api.state.selected=null;api.updateUI(true);
    assert.equal(elements.get("selectionLabel").hidden,true);
    api.select("base","base");
    assert.equal(elements.get("selectionLabel").hidden,false);
  });

  test("header controls use flat status icons and green or yellow states",()=>{
    const pause=elements.get("pauseToggle"),sound=elements.get("soundToggle");
    api.state.paused=false;api.state.sound=true;api.updateUI(true);
    assert.match(pause.innerHTML,/<svg[^>]*flat-status-icon/);assert.match(pause.innerHTML,/Playing/);assert.equal(pause.classList.contains("status-playing"),true);
    assert.match(sound.innerHTML,/Sound: ON/);assert.equal(sound.classList.contains("status-sound-on"),true);

    api.state.paused=true;api.state.sound=false;api.updateUI(true);
    assert.match(pause.innerHTML,/Paused/);assert.equal(pause.classList.contains("status-paused"),true);
    assert.match(sound.innerHTML,/Sound: OFF/);assert.equal(sound.classList.contains("status-sound-off"),true);
  });

  test("unchanged status refreshes preserve the Playing button DOM",()=>{
    const pause=elements.get("pauseToggle");
    api.state.paused=false;api.updateUI(true);
    const writes=pause.innerHTMLWriteCount;
    for(let refresh=0;refresh<10;refresh++)api.updateUI();
    assert.equal(pause.innerHTMLWriteCount,writes,"simulation refreshes must not replace the button during a click");
    api.state.paused=true;api.updateUI();
    assert.equal(pause.innerHTMLWriteCount,writes+1,"the button should update once when its state actually changes");
  });

  test("clicking a Bio-hostile selects it and shows its hit points", () => {
    const enemy = makeEnemy("enemy-selected",3,2);
    api.state.enemies.push(enemy);

    api.handleHexClick({q:3,r:2});

    assert.deepEqual({ ...api.state.selected },{type:"enemy",id:enemy.id});
    const html = api.selectionHtml();
    assert.match(html,/Bio-hostile/);
    assert.match(html,/HIT POINTS/);
    assert.match(html,/1 \/ 1/);
  });

  test("Train selection names the clicked part and puts Add Schedule above Clear Schedule",()=>{
    const train=addTestTrain("builder");
    api.handleHexClick({q:train.wagons[1].q,r:train.wagons[1].r});
    let html=api.selectionHtml();
    assert.match(html,/Build\/Mine Train A: Energy Supply/);
    assert.match(html,/Supply 1 · CONSTRUCTION MATERIAL/);
    assert.doesNotMatch(html,/Wagon/);
    assert.ok(html.indexOf("Add Schedule")<html.indexOf("Clear Schedule"));

    api.handleHexClick({q:train.q,r:train.r});
    assert.match(api.selectionHtml(),/Build\/Mine Train A: Locomotive/);
  });

  test("the lost-game map allows read-only object selection",()=>{
    const train=addTestTrain("combat");
    api.state.gameOver=true;api.state.finalMapView=true;api.state.mode="turret";
    api.handleHexClick({q:train.wagons[0].q,r:train.wagons[0].r});
    const html=api.selectionHtml();
    assert.match(html,/Turret Train A: Energy Supply/);
    assert.doesNotMatch(html,/data-action=/,"post-loss inspection must not expose mutating actions");
    assert.equal(api.state.structures.size,0);
  });
});
