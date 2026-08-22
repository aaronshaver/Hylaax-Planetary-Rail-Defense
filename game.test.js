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
    const debug=html.indexOf('id="debugToggle"'),fps=html.indexOf('id="performanceStatus"');assert.ok(debug>=0&&debug<fps,"Debug must appear before FPS");
  });

  test("the feedback contact is anchored to the bottom-right",()=>{
    const css=fs.readFileSync(path.join(__dirname,"styles.css"),"utf8");
    assert.match(css,/\.feedback-contact \{[^}]*right: 16px;[^}]*font: 700 14\.3px\/1\.3[^}]*text-align: right;/);
  });

  test("Center Map on Base is a small button below the upper-left HUD instead of an Action",()=>{
    const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8"),css=fs.readFileSync(path.join(__dirname,"styles.css"),"utf8"),actions=html.match(/<div class="tool-grid"[^>]*>[\s\S]*?<\/div>/)?.[0]||"",topLeft=html.match(/<div class="top-left-stack">[\s\S]*?<\/button>\s*<\/div>/)?.[0]||"";
    assert.equal((actions.match(/<button /g)||[]).length,8);assert.doesNotMatch(actions,/centerBaseButton/);assert.match(topLeft,/<\/div>\s*<button id="centerBaseButton" class="btn center-base-button" type="button">Center Map on Base<\/button>/);
    assert.match(css,/\.center-base-button \{[^}]*padding: 7\.5px 13\.5px;[^}]*font: 700 18px\/1\.2/);
    const game=fs.readFileSync(path.join(__dirname,"game.js"),"utf8");assert.doesNotMatch(game,/e\.key==="9"/);
  });

  test("Restart Tutorial appears before the tutorial text with a flat back icon",()=>{
    const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8"),prompt=html.match(/<div id="tutorialPrompt"[\s\S]*?<\/div>\s*<div id="gameOver"/)?.[0]||"";
    assert.ok(prompt.indexOf('id="tutorialRestart"')<prompt.indexOf('id="tutorialText"'));
    assert.match(prompt,/id="tutorialRestart"[\s\S]*tutorial-restart-icon[\s\S]*Restart Tutorial/);
  });

  test("buildable Action tooltips show costs plus required Train Stop distance",()=>{
    const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
    assert.match(html,/title="• Select units and structures\."/);
    assert.doesNotMatch(html,/Select a Train to create or clear its automatic schedule/);
    const oneStop="Must be built within 1 hex of a Train Stop so that it can be resupplied and/or repaired",fiveStops="Must be built within 5 hexes of a Train Stop so that it can be resupplied and/or repaired";
    const expected={trackTool:"Costs 1 C, 0 E",turretTool:`Costs 10 C, 5 E&#10;${oneStop}`,mineTool:`Costs 8 C, 0 E&#10;${oneStop}`,wallTool:`Costs 12 C, 0 E&#10;${fiveStops}`,artilleryTool:`Costs 50 C, 50 E&#10;${oneStop}`,researchTool:"Costs 50 C, 50 E"};
    for(const [id,cost] of Object.entries(expected)){const title=html.match(new RegExp(`id="${id}"[^>]*title="([^"]+)"`))?.[1];assert.equal(title,cost,id);}
  });

  test("legacy three-hex Track construction rules are gone",()=>{
    const sources=["rail.js","trains.js","interface.js","index.html"].map(file=>fs.readFileSync(path.join(__dirname,file),"utf8")).join("\n");
    assert.doesNotMatch(sources,/trackWithinRange|liveTrackWithinRange|requireNearbyTrack|within (?:three|3) hexes of (?:non-destroyed )?Track/i);
  });

  test("the Actions panel exposes Wall and Artillery and keeps Salvage/Clear on key 7",()=>{
    const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
    assert.match(html,/data-mode="wall"[^>]*Costs 12 C, 0 E[^>]*><span class="keycap">5<\/span>Build Wall/);
    assert.match(html,/data-mode="artillery"[^>]*Costs 50 C, 50 E[^>]*><span class="keycap">6<\/span>Build Artillery/);
    assert.match(html,/data-mode="salvage"[^>]*Clear destroyed objects without recovering resources[^>]*><span class="keycap">7<\/span>Salvage\/Clear Object/);
    assert.match(html,/data-mode="research"[^>]*Costs 50 C, 50 E[^>]*><span class="keycap">8<\/span>Build Research/);
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

  test("the unified Turret and Artillery Energy warning uses OK",()=>{
    const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
    assert.match(html,/id="turretEnergyDialog"[^>]*hidden[^>]*role="dialog"/);
    assert.match(html,/One of your Turrets or Artillery ran out of Energy\. Both Turrets and Artillery must be supplied with Energy/);
    assert.match(html,/id="turretEnergyOkay"[^>]*>OK<\/button>/);
  });

  test("the displayed and package versions are 3.6",()=>{
    const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
    const packageJson=JSON.parse(fs.readFileSync(path.join(__dirname,"package.json"),"utf8"));
    assert.match(html,/Planetary Rail Defense 3\.6/);assert.match(html,/DEFENSE 3\.6/);assert.equal(packageJson.version,"3.6.0");
  });
});
