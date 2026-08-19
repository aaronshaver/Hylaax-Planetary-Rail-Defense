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
      if(["turretTool","wallTool","artilleryTool"].includes(id))assert.match(title,/\(E\)nergy/);
    }
  });

  test("the Actions panel exposes Wall and Artillery and keeps Salvage/Clear on key 7",()=>{
    const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
    assert.match(html,/data-mode="wall"[^>]*Costs 12 \(C\)onstruction Material and 1 \(E\)nergy[^>]*><span class="keycap">5<\/span>Build Wall/);
    assert.match(html,/data-mode="artillery"[^>]*Costs 75 \(C\)onstruction Material and 75 \(E\)nergy[^>]*><span class="keycap">6<\/span>Build Artillery/);
    assert.match(html,/data-mode="salvage"[^>]*Clear destroyed objects without recovering resources[^>]*><span class="keycap">7<\/span>Salvage\/Clear Object/);
    assert.match(html,/data-mode="research"[^>]*Takes up three hexes \(triangular\)[^>]*Costs 100 \(C\)onstruction Material and 100 \(E\)nergy[^>]*><span class="keycap">8<\/span>Build Research/);
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
    assert.match(html,/One of your turrets ran out of Energy\. Remember: you must supply Turrets with Energy by having a Train Stop adjacent to the Turret and a Train loaded with Energy so that it can re-supply the Turret\./);
    assert.match(html,/id="turretEnergyOkay"[^>]*>Okay<\/button>/);
  });

  test("the displayed and package versions are 3.0",()=>{
    const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
    const packageJson=JSON.parse(fs.readFileSync(path.join(__dirname,"package.json"),"utf8"));
    assert.match(html,/Planetary Rail Defense 3\.0/);assert.match(html,/DEFENSE 3\.0/);assert.equal(packageJson.version,"3.0.0");
  });
});
