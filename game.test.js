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

  test("action tooltips use the revised concise Track wording",()=>{
    const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
    assert.match(html,/title="Select units and structures\."/);
    assert.doesNotMatch(html,/Select a Train to create or clear its automatic schedule/);
    assert.match(html,/Costs 1 Construction Material per new Track segment from Base inventory\./);
    assert.doesNotMatch(html,/per new Track hex/);
  });

  test("the Actions panel exposes Wall and Artillery and keeps Salvage on key 7",()=>{
    const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
    assert.match(html,/data-mode="wall"[^>]*Costs 12 Construction Material and 1 Energy[^>]*><span class="keycap">5<\/span>Build Wall/);
    assert.match(html,/data-mode="artillery"[^>]*Costs 30 Construction Material and 20 Energy[^>]*><span class="keycap">6<\/span>Build Artillery/);
    assert.match(html,/data-mode="salvage"[^>]*><span class="keycap">7<\/span>Salvage Object/);
  });

  test("the displayed and package versions are 2.1",()=>{
    const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
    const packageJson=JSON.parse(fs.readFileSync(path.join(__dirname,"package.json"),"utf8"));
    assert.match(html,/Planetary Rail Defense 2\.1/);assert.match(html,/DEFENSE 2\.1/);assert.equal(packageJson.version,"2.1.0");
  });
});
