"use strict";

const assert = require("node:assert/strict");
const { describe, test, beforeEach } = require("node:test");
const { api, elements, makeEnemy } = require("./harness.js");

beforeEach(() => { api.reset(); });

describe("interface formatting", () => {
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
});
