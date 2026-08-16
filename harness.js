"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { performance } = require("node:perf_hooks");

const GAME_SCRIPTS = ["core.js", "terrain.js", "world.js", "rail.js", "trains.js", "enemies.js", "simulation.js", "rendering.js", "interface.js", "tutorial.js", "game.js"];

class ClassListMock {
  constructor() { this.values = new Set(); }
  add(...names) { names.forEach(name => this.values.add(name)); }
  remove(...names) { names.forEach(name => this.values.delete(name)); }
  toggle(name, force) {
    if (force === true) { this.values.add(name); return true; }
    if (force === false) { this.values.delete(name); return false; }
    if (this.values.has(name)) { this.values.delete(name); return false; }
    this.values.add(name); return true;
  }
  contains(name) { return this.values.has(name); }
}

function makeCanvasContext() {
  const values = { font: "10px sans-serif", globalAlpha: 1 };
  const methods = {
    measureText: text => ({ width: String(text).length * 7 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} })
  };
  return new Proxy(values, {
    get(target, property) {
      if (property in target) return target[property];
      if (property in methods) return methods[property];
      return () => {};
    },
    set(target, property, value) { target[property] = value; return true; }
  });
}

class ElementMock {
  constructor(tagName = "div", id = "") {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.classList = new ClassListMock();
    this.dataset = {};
    this.style = {};
    this.children = [];
    this.hidden = false;
    this.disabled = false;
    this.textContent = "";
    this.innerHTML = "";
    this.width = 1024;
    this.height = 768;
  }
  addEventListener() {}
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); }
  focus() {}
  blur() {}
  setPointerCapture() {}
  closest() { return null; }
  matches() { return false; }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1024, height: 768 }; }
}

class CanvasMock extends ElementMock {
  constructor(id = "") { super("canvas", id); this.context = makeCanvasContext(); }
  getContext() { return this.context; }
}

class AudioContextMock {
  constructor() { this.currentTime = 0; this.state = "running"; this.destination = {}; }
  resume() {}
  createOscillator() {
    return { type: "sine", frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() { return this; }, start() {}, stop() {} };
  }
  createGain() {
    return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() { return this; } };
  }
}

function loadGame() {
  const root = __dirname;
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
  const elements = new Map(ids.map(id => [id, id === "gameCanvas" ? new CanvasMock(id) : new ElementMock("div", id)]));
  const document = {
    hidden: false,
    body: new ElementMock("body", "body"),
    getElementById(id) { if (!elements.has(id)) elements.set(id, new ElementMock("div", id)); return elements.get(id); },
    createElement(tagName) { return tagName.toLowerCase() === "canvas" ? new CanvasMock() : new ElementMock(tagName); },
    querySelectorAll() { return []; },
    addEventListener() {}
  };
  const window = {
    __HYLAAX_TEST__: true,
    devicePixelRatio: 1,
    document,
    performance,
    AudioContext: AudioContextMock,
    webkitAudioContext: AudioContextMock,
    addEventListener() {}
  };
  window.window = window;
  const context = vm.createContext({
    window, document, console, performance,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
    setTimeout: () => 0,
    clearTimeout() {}
  });
  for (const filename of GAME_SCRIPTS) {
    vm.runInContext(fs.readFileSync(path.join(root, filename), "utf8"), context, { filename });
  }
  assert.ok(window.__HYLAAX_TEST_API__, "game.js did not expose its test interface");
  return { api: window.__HYLAAX_TEST_API__, elements };
}

const harness = loadGame();
const api = harness.api;

function moveTrain(train, q, r) {
  const point = api.axialToWorld(q, r);
  train.q = q; train.r = r; train.x = point.x; train.y = point.y;
  train.route = []; train.stepFrom = null; train.stepTo = null; train.progress = 0;
}

function makeTrack(q, r, links = []) {
  return { q, r, hp: 1, maxHp: 1, links: new Set(links) };
}

function makeEnemy(id, q, r) {
  const point = api.axialToWorld(q, r);
  return { id, type: "enemy", q, r, x: point.x, y: point.y, fromQ: q, fromR: r, toQ: q, toR: r, progress: 1, speed: api.constants.ENEMY_SPEED, hp: 1, maxHp: 1, attackClock: 0, nextPathAt: 0, phase: 0 };
}

function addTestTrain(trainType="builder") {
  const state=api.state,trainIndex=state.nextTrainIndex++,code=api.trainCode(trainIndex),roles=trainType==="combat"?["energy"]:["material","energy"];
  const positions=[{q:3,r:0},{q:2,r:0},{q:1,r:0}],heading=0;
  const wagons=roles.map((role,index)=>{const position=positions[index+1],point=api.axialToWorld(position.q,position.r);return {id:`test-wagon-${state.nextId++}`,kind:"wagon",...position,x:point.x,y:point.y,heading,role,type:role,amount:0,capacity:30,hp:18,maxHp:18};});
  const head=positions[0],point=api.axialToWorld(head.q,head.r);
  const train={id:`test-train-${state.nextId++}`,name:api.trainName(trainIndex,trainType),code,trainType,...head,x:point.x,y:point.y,route:[],routePurpose:null,progress:0,speed:2.25,stepFrom:null,stepTo:null,schedule:[],scheduleComplete:false,scheduleTargetIndex:0,servicingStop:false,stopHoldUntil:0,scheduleRetryAt:0,repairHoldUntil:0,repairResumeStatus:null,energyDepleted:false,nextEnergyWarningAt:0,forwardDirection:{q:1,r:0},fuel:20,maxFuel:20,hp:28,maxHp:28,status:"Idle",wagons,heading,wheelClock:0,wasNearBase:false,combatCooldown:0,gunAngle:heading};
  state.trains.push(train);return train;
}

module.exports = { api, elements: harness.elements, moveTrain, makeTrack, makeEnemy, addTestTrain, performance, GAME_SCRIPTS };
