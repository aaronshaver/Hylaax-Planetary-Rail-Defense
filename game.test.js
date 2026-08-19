"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, test, beforeEach } = require("node:test");
const { api, elements, GAME_SCRIPTS } = require("./harness.js");

beforeEach(() => { api.reset(); });

describe("game bootstrap", () => {
  test("all feature modules load before the entry point", () => {
    const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
    const gameScripts = [...html.matchAll(/<script src="([^"]+\.js)"><\/script>/g)]
      .map(match => match[1])
      .filter(filename => filename !== "bootstrap.bundle.min.js");
    assert.deepEqual(gameScripts, GAME_SCRIPTS);
    assert.equal(typeof api.update, "function");
    assert.equal(typeof api.render, "function");
    assert.equal(typeof api.selectionHtml, "function");
    assert.ok(elements.get("gameCanvas"));
  });

  test("the tutorial button is enabled without the temporary unavailable tooltip", () => {
    const html = fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
    assert.match(html,/id="remindersTutorial" class="btn btn-command"/);
    assert.match(html,/Start Game with Tutorial \(recommended for new players\)/);
    assert.doesNotMatch(html,/id="remindersTutorial"[^>]*disabled/);
    assert.doesNotMatch(html,/I'm working on this Sun 16 Aug/);
  });

  test("the opening dialog uses two medium-size reminder bullets",()=>{
    const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
    assert.doesNotMatch(html,/This is a fun web game/);
    assert.match(html,/<ul id="remindersNotice" class="reminders-list">[\s\S]*<li>Please play on a desktop or laptop computer; mobile is not well-supported\.<\/li>[\s\S]*<li>To get the latest features and fixes, do CTRL-SHIFT-R or CMD-SHIFT-R to force a cache refresh<\/li>[\s\S]*<\/ul>/);
  });

  test("the lower-left performance display keeps FPS and removes TPS",()=>{
    const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
    assert.match(html,/FPS <strong id="fpsValue">0<\/strong>/);assert.doesNotMatch(html,/\bTPS\b|id="tpsValue"/);
  });

  test("Center Map on Base is the ninth button in the right-side Actions grid",()=>{
    const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8"),actions=html.match(/<div class="tool-grid"[^>]*>[\s\S]*?<\/div>/)?.[0]||"";
    assert.equal((actions.match(/<button /g)||[]).length,9);assert.match(actions,/id="centerBaseButton"[^>]*>[\s\S]*<span class="keycap">9<\/span>Center Map on Base<\/button>/);assert.ok(actions.indexOf('id="researchTool"')<actions.indexOf('id="centerBaseButton"'));
  });

  test("Restart Tutorial appears before the tutorial text with a flat back icon",()=>{
    const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8"),prompt=html.match(/<div id="tutorialPrompt"[\s\S]*?<\/div>\s*<div id="gameOver"/)?.[0]||"";
    assert.ok(prompt.indexOf('id="tutorialRestart"')<prompt.indexOf('id="tutorialText"'));
    assert.match(prompt,/id="tutorialRestart"[\s\S]*tutorial-restart-icon[\s\S]*Restart Tutorial/);
  });

  test("Action tooltips use readable bullets without Base-inventory wording",()=>{
    const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
    assert.match(html,/title="• Select units and structures\."/);
    assert.doesNotMatch(html,/Select a Train to create or clear its automatic schedule/);
    assert.match(html,/• Costs 1 \(C\)onstruction Material per new Track segment\./);
    assert.doesNotMatch(html,/per new Track hex/);
    assert.doesNotMatch(html,/from Base inventory/);
    assert.ok((html.match(/title="•/g)||[]).length>=7,"every Action tooltip should begin with a bullet");
    for(const id of ["trackTool","turretTool","mineTool","wallTool","artilleryTool","researchTool"]){
      const title=html.match(new RegExp(`id="${id}"[^>]*title="([^"]+)"`))?.[1];assert.ok(title,id);assert.match(title,/(?:&#10;)?• Costs [^•]+\.$/,`${id} should end with its Costs bullet`);
      assert.match(title,/\(C\)onstruction Material/);
      if(["turretTool","artilleryTool"].includes(id))assert.match(title,/\(E\)nergy/);
    }
  });

  test("Artillery help reports its 50-Energy storage",()=>{
    const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
    const artillery=html.match(/<button id="artilleryTool"[^>]+>/)?.[0]||"";
    assert.match(artillery,/Stores 50 Energy/);assert.doesNotMatch(artillery,/Stores 40 Energy/);
  });

  test("the Actions panel exposes Wall and Artillery and keeps Salvage/Clear on key 7",()=>{
    const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
    assert.match(html,/data-mode="wall"[^>]*Costs 12 \(C\)onstruction Material\.[^>]*><span class="keycap">5<\/span>Build Wall/);
    assert.match(html,/data-mode="artillery"[^>]*Costs 50 \(C\)onstruction Material and 50 \(E\)nergy[^>]*><span class="keycap">6<\/span>Build Artillery/);
    assert.match(html,/data-mode="salvage"[^>]*Clear destroyed objects without recovering resources[^>]*><span class="keycap">7<\/span>Salvage\/Clear Object/);
    assert.match(html,/data-mode="research"[^>]*Takes up three hexes \(triangular\)[^>]*Costs 75 \(C\)onstruction Material and 75 \(E\)nergy[^>]*><span class="keycap">8<\/span>Build Research/);
    assert.equal((html.match(/Will run out of Energy if not supplied by a Train Stop\./g)||[]).length,2);
  });

  test("Base Train fabrication tooltips use the Construction Material abbreviation",()=>{
    const source=fs.readFileSync(path.join(__dirname,"interface.js"),"utf8");
    assert.equal((source.match(/Costs 30 \(C\)onstruction Material\./g)||[]).length,2);
  });

  test("the small Debug toggle exposes all Debug menu options",()=>{
    const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
    assert.match(html,/id="debugToggle"[^>]*>D<\/button>/);
    assert.match(html,/id="debugMenu"[^>]*hidden/);
    assert.match(html,/id="debugDestroyObject"[^>]*data-mode="debug-destroy"[^>]*>Destroy Object<\/button>/);
    assert.match(html,/id="debugAddCreep"[^>]*data-mode="debug-add-creep"[^>]*>Add Creep<\/button>/);
    assert.match(html,/id="debugAddBaseResources"[^>]*>Add Base Resources<\/button>/);
    assert.match(html,/id="debugAddResearchPoints"[^>]*>Add Research Points<\/button>/);
  });

  test("the turret Energy warning has the requested one-time guidance",()=>{
    const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
    assert.match(html,/id="turretEnergyDialog"[^>]*hidden[^>]*role="dialog"/);
    assert.match(html,/One of your Turrets ran out of Energy\. Both \(T\)urrets and \(A\)rtillery must be supplied with Energy by a Build\/Mine Train loaded with Energy at an adjacent Train Stop\./);
    assert.match(html,/id="turretEnergyOkay"[^>]*>Okay<\/button>/);
  });

  test("the displayed and package versions are 3.4",()=>{
    const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
    const packageJson=JSON.parse(fs.readFileSync(path.join(__dirname,"package.json"),"utf8"));
    assert.match(html,/Planetary Rail Defense 3\.4/);assert.match(html,/DEFENSE 3\.4/);assert.equal(packageJson.version,"3.4.0");
  });
});
