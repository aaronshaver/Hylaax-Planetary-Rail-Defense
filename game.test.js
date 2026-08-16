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
    assert.doesNotMatch(html,/id="remindersTutorial"[^>]*disabled/);
    assert.doesNotMatch(html,/I'm working on this Sun 16 Aug/);
  });
});
