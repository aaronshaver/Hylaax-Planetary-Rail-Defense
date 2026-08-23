"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, test, beforeEach } = require("node:test");
const { api, elements, document, GAME_SCRIPTS } = require("./harness.js");

beforeEach(() => { api.reset(); document.hidden=false; });

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
    assert.match(html,/Start game with tutorial \(recommended for new players\)/);
    assert.doesNotMatch(html,/id="remindersTutorial"[^>]*disabled/);
    assert.doesNotMatch(html,/I'm working on this Sun 16 Aug/);
  });

  test("the opening dialog uses two medium-size reminder bullets",()=>{
    const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
    assert.doesNotMatch(html,/This is a fun web game/);
    assert.match(html,/<ul id="remindersNotice" class="reminders-list">[\s\S]*<li>Please play on a desktop or laptop computer; mobile is not well-supported\.<\/li>[\s\S]*<li>To get the latest features and fixes, do CTRL-SHIFT-R or CMD-SHIFT-R to force a cache refresh<\/li>[\s\S]*<\/ul>/);
  });

  test("the lower-left Debug button has no FPS widget",()=>{
    const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
    assert.match(html,/id="debugToggle"/);assert.doesNotMatch(html,/\bFPS\b|\bTPS\b|id="(?:fps|tps)Value"|id="performanceStatus"/);
    const css=fs.readFileSync(path.join(__dirname,"styles.css"),"utf8");assert.match(css,/\.bottom-debug-row \{[^}]*left: 5px;[^}]*bottom: 5px;/);
  });

  test("Pause and Sound buttons have accessible labels without hover tooltips",()=>{
    const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
    for(const id of ["pauseToggle","soundToggle"]){const button=html.match(new RegExp(`<button id="${id}"[^>]*>`))?.[0]||"";assert.match(button,/aria-label="[^"]+"/);assert.doesNotMatch(button,/\stitle=/);assert.doesNotMatch(button,/data-bs-toggle="tooltip"/);}
  });

  test("hidden-tab time is discarded instead of caught up when the tab returns",()=>{
    const stepMilliseconds=api.constants.SIMULATION_STEP*1000;
    api.state.paused=false;
    document.hidden=true;api.handleVisibilityChange(1000);api.runFrame(31000);
    assert.equal(api.state.elapsed,0,"throttled hidden frames must not advance the simulation");
    document.hidden=false;api.handleVisibilityChange(31000);api.runFrame(31000);
    assert.equal(api.state.elapsed,0,"showing the tab must not catch up hidden time");
    assert.equal(api.state.paused,false,"visibility changes must preserve the player's pause state");
    api.runFrame(31000+stepMilliseconds);
    assert.equal(api.state.elapsed,api.constants.SIMULATION_STEP,"normal simulation should resume from the new visible-time baseline");
  });

  test("a browser visibility event cannot poison the simulation clock",()=>{
    api.state.paused=false;
    document.hidden=true;api.handleVisibilityChange({type:"visibilitychange"});
    document.hidden=false;api.handleVisibilityChange({type:"visibilitychange"});
    api.runFrame(Date.now()+1000);
    assert.ok(api.state.elapsed>0,"the game must keep advancing after returning to a visible tab");
  });

  test("the feedback contact is anchored to the bottom-right",()=>{
    const css=fs.readFileSync(path.join(__dirname,"styles.css"),"utf8");
    assert.match(css,/\.feedback-contact \{[^}]*right: 16px;[^}]*font: 700 14\.3px\/1\.3[^}]*text-align: right;/);
  });

  test("Center Map on Base is a small button below the upper-left HUD instead of an Action",()=>{
    const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8"),css=fs.readFileSync(path.join(__dirname,"styles.css"),"utf8"),actions=html.match(/<div class="tool-grid"[^>]*>[\s\S]*?<\/div>/)?.[0]||"",topLeft=html.match(/<div class="top-left-stack">[\s\S]*?<\/button>\s*<\/div>/)?.[0]||"";
    assert.equal((actions.match(/<button /g)||[]).length,10);assert.doesNotMatch(actions,/centerBaseButton/);assert.match(topLeft,/<\/div>\s*<button id="centerBaseButton" class="btn center-base-button" type="button">Center map on base building<\/button>/);
    assert.match(css,/\.center-base-button \{[^}]*padding: 7\.5px 13\.5px;[^}]*font: 700 18px\/1\.2/);
    const game=fs.readFileSync(path.join(__dirname,"game.js"),"utf8");assert.doesNotMatch(game,/e\.key==="9"/);
  });

  test("Restart Tutorial appears before the tutorial text with a flat back icon",()=>{
    const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8"),prompt=html.match(/<div id="tutorialPrompt"[\s\S]*?<\/div>\s*<div id="gameOver"/)?.[0]||"";
    assert.ok(prompt.indexOf('id="tutorialRestart"')<prompt.indexOf('id="tutorialText"'));
    assert.match(prompt,/id="tutorialRestart"[\s\S]*tutorial-restart-icon[\s\S]*Restart tutorial/);
  });

  test("buildable Action tooltips show costs plus required Train Stop distance",()=>{
    const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
    assert.match(html,/title="• Select units and structures\."/);
    assert.doesNotMatch(html,/Select a Train to create or clear its automatic schedule/);
    const oneStop="• Must be built within 1 hex of a train stop so that it can be resupplied and/or repaired",fiveStops="• Must be built within 5 hexes of a train stop so that it can be resupplied and/or repaired";
    const expected={trackTool:"• Costs 1 C, 0 E",turretTool:"• Costs 10 C, 10 E&#10;"+oneStop,mineTool:"• Costs 10 C, 0 E&#10;"+oneStop,wallTool:"• Costs 30 C, 0 E&#10;"+fiveStops,artilleryTool:"• Costs 50 C, 50 E&#10;"+oneStop,researchTool:"• Costs 50 C, 50 E",gateTool:"• Costs 30 C, 0 E&#10;"+fiveStops,neutralizerTool:"• Costs 50 C, 50 E&#10;"+oneStop};
    for(const [id,cost] of Object.entries(expected)){const title=html.match(new RegExp(`id="${id}"[^>]*title="([^"]+)"`))?.[1];assert.equal(title,cost,id);}
    for(const title of [...html.matchAll(/class="btn tool-button[^"]*"[^>]*title="([^"]+)"/g)].map(match=>match[1]))for(const clause of title.split("&#10;"))assert.match(clause,/^• /);
  });

  test("legacy three-hex Track construction rules are gone",()=>{
    const sources=["rail.js","trains.js","interface.js","index.html"].map(file=>fs.readFileSync(path.join(__dirname,file),"utf8")).join("\n");
    assert.doesNotMatch(sources,/trackWithinRange|liveTrackWithinRange|requireNearbyTrack|within (?:three|3) hexes of (?:non-destroyed )?Track/i);
  });

  test("the Actions panel exposes Wall and Artillery and keeps Salvage/Clear on key 7",()=>{
    const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
    assert.match(html,/data-mode="wall"[^>]*Costs 30 C, 0 E[^>]*><span class="keycap">5<\/span>Build wall/);
    assert.match(html,/data-mode="artillery"[^>]*Costs 50 C, 50 E[^>]*><span class="keycap">6<\/span>Build artillery/);
    assert.match(html,/data-mode="salvage"[^>]*Salvages for resources: train track, most buildings, and trains&#10;• Clears destroyed objects&#10;• Salvaging or clearing a mine leaves the underlying resource node untouched[^>]*><span class="keycap">7<\/span>Salvage\/clear object/);
    assert.match(html,/data-mode="research"[^>]*Costs 50 C, 50 E[^>]*><span class="keycap">8<\/span>Build research/);
    assert.match(html,/data-mode="gate"[^>]*Costs 30 C, 0 E[^>]*><span class="keycap">9<\/span>Build gate/);
    assert.match(html,/data-mode="neutralizer"[^>]*Costs 50 C, 50 E[^>]*><span class="keycap">0<\/span>Build neutralizer/);
  });

  test("Base Train fabrication tooltips put standardized costs first and bullet every item",()=>{
    api.state.selected={type:"base",id:"base"};
    const html=api.selectionHtml(),tips=[...html.matchAll(/fabricate-place-(?:builder|combat)-train[^>]*title="([^"]+)"/g)].map(match=>match[1]);
    assert.equal(tips.length,2);
    assert.match(tips[0],/^• Costs 30 C, 0 E/);
    assert.match(tips[1],/^• Costs 30 C, 10 E/);
    assert.match(tips[0],/• Mines resources, repairs buildings, rebuilds destroyed track, supplies turrets and artillery with shot energy, and supplies neutralizer buildings with construction material and energy$/);
    assert.match(tips[1],/• Must normally be refueled and have shot energy resupplied from the base building \(cannot be supplied by mines\); another train can provide emergency fuel when it has no fuel energy remaining$/);
    assert.ok(tips.every(tip=>!tip.includes("Placement uses two clicks")));
    for(const tip of tips)for(const clause of tip.split("&#10;"))assert.match(clause,/^• /);
  });

  test("the small Debug toggle exposes all Debug menu options",()=>{
    const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
    assert.match(html,/id="debugToggle"[^>]*>D<\/button>/);
    assert.match(html,/id="debugMenu"[^>]*hidden/);
    assert.match(html,/class="debug-menu-title">Debug<\/div>\s*<div class="debug-menu-warning">This is a debug menu intended for development\. It's &quot;cheating&quot; if you use this during your game\. But it's a single player game, so do whatever is fun for you\.<\/div>/);
    assert.match(html,/id="debugDestroyObject"[^>]*data-mode="debug-destroy"[^>]*>Destroy object<\/button>/);
    assert.match(html,/id="debugAddCreep"[^>]*data-mode="debug-add-creep"[^>]*>Add creep<\/button>/);
    assert.match(html,/id="debugAddBaseResources"[^>]*>Add base building resources<\/button>/);
    assert.match(html,/id="debugAddResearchPoints"[^>]*>Add research points<\/button>/);
    assert.doesNotMatch(html,/debug-menu-note|Click a destructible object|Click an open passable hex|Adds 1,000/);
  });

  test("the unified Turret and Artillery Energy warning uses OK",()=>{
    const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
    assert.match(html,/id="turretEnergyDialog"[^>]*hidden[^>]*role="dialog"/);
    assert.match(html,/A turret or artillery building ran out of energy\. Both turrets and artillery must be supplied with energy/);
    assert.match(html,/stopped at an adjacent non-destroyed train stop/);
    assert.match(html,/id="turretEnergyOkay"[^>]*>OK<\/button>/);
  });

  test("the salvage confirmation shows its title only once",()=>{
    const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8"),dialog=html.match(/<div id="confirmDialog"[\s\S]*?<\/div>\s*<\/div>/)?.[0]||"";
    assert.equal((dialog.match(/Confirm salvage/g)||[]).length,1);assert.match(dialog,/id="confirmTitle" class="eyebrow text-danger">Confirm salvage/);assert.doesNotMatch(dialog,/<h2[^>]*>Confirm salvage<\/h2>/);
  });

  test("the displayed and package versions are 4.0.0",()=>{
    const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
    const packageJson=JSON.parse(fs.readFileSync(path.join(__dirname,"package.json"),"utf8"));
    assert.match(html,/Planetary Rail Defense 4\.0\.0/);assert.match(html,/DEFENSE 4\.0\.0/);assert.equal(packageJson.version,"4.0.0");
  });
});
