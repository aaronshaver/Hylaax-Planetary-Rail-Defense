"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { performance } = require("node:perf_hooks");

const GAME_SCRIPTS = ["core.js", "terrain.js", "world.js", "research.js", "rail.js", "trains.js", "enemies.js", "neutralizers.js", "simulation.js", "rendering.js", "interface.js", "tutorial.js", "game.js"];

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
    createRadialGradient: () => ({ addColorStop() {} }),
    fillText: (text,x,y) => values.textCalls.push({text:String(text),x,y,font:values.font,fillStyle:values.fillStyle}),
    beginPath:()=>{values.currentPath=[];},
    moveTo:(x,y)=>values.currentPath.push({command:"moveTo",x,y}),
    lineTo:(x,y)=>values.currentPath.push({command:"lineTo",x,y}),
    arc:(x,y,r,start,end)=>values.currentPath.push({command:"arc",x,y,r,start,end}),
    rect:(x,y,width,height)=>values.currentPath.push({command:"rect",x,y,width,height}),
    translate:(x,y)=>values.translateCalls.push({x,y}),
    scale:(x,y)=>values.scaleCalls.push({x,y}),
    closePath:()=>values.currentPath.push({command:"closePath"}),
    fill:()=>{const call={path:[...values.currentPath],fillStyle:values.fillStyle,shadowBlur:values.shadowBlur||0,shadowColor:values.shadowColor};values.fillCalls.push(call);values.paintCalls.push({kind:"fill",...call});},
    stroke:()=>{const call={path:[...values.currentPath],strokeStyle:values.strokeStyle,lineWidth:values.lineWidth,shadowBlur:values.shadowBlur||0,shadowColor:values.shadowColor};values.strokeCalls.push(call);values.paintCalls.push({kind:"stroke",...call});},
    fillRect:(x,y,width,height)=>values.fillRectCalls.push({x,y,width,height,fillStyle:values.fillStyle,shadowBlur:values.shadowBlur||0,shadowColor:values.shadowColor}),
    drawImage:(...args)=>{const call={kind:"image",args};values.drawImageCalls.push(call);values.paintCalls.push(call);}
  };
  values.textCalls=[];values.fillCalls=[];values.strokeCalls=[];values.fillRectCalls=[];values.drawImageCalls=[];values.translateCalls=[];values.scaleCalls=[];values.paintCalls=[];values.currentPath=[];
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
    this._innerHTML = "";
    this.innerHTMLWriteCount = 0;
    this.width = 1024;
    this.height = 768;
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) { this._innerHTML = value; this.innerHTMLWriteCount++; }
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
  return { api: window.__HYLAAX_TEST_API__, elements, document };
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

function makeEnemy(id, q, r, slot=0) {
  const point = api.enemyWorldPosition(q,r,slot);
  return { id, type: "enemy", q, r, slot, x: point.x, y: point.y, fromQ: q, fromR: r, fromSlot:slot, toQ: q, toR: r, toSlot:slot, progress: 1, moveCount:0, speed: api.constants.ENEMY_SPEED, hp: 1, maxHp: 1, attackClock: 0, nextPathAt: 0, phase: 0 };
}

function addTestTrain(trainType="builder") {
  const state=api.state,trainIndex=state.nextTrainIndex++,code=api.trainCode(trainIndex),roles=trainType==="combat"?["energy"]:["material","energy"];
  const positions=[{q:3,r:0},{q:2,r:0},{q:1,r:0}],heading=0;
  const wagons=roles.map((role,index)=>{const position=positions[index+1],point=api.axialToWorld(position.q,position.r);return {id:`test-wagon-${state.nextId++}`,kind:"wagon",...position,x:point.x,y:point.y,heading,role,type:role,amount:trainType==="combat"&&role==="energy"?10:0,capacity:30,hp:api.constants.TRAIN_HIT_POINTS,maxHp:api.constants.TRAIN_HIT_POINTS};});
  const head=positions[0],point=api.axialToWorld(head.q,head.r);
  const train={id:`test-train-${state.nextId++}`,name:api.trainName(trainIndex,trainType),code,trainType,...head,x:point.x,y:point.y,route:[],routePurpose:null,progress:0,speed:2.25,stepFrom:null,stepTo:null,schedule:[],scheduleComplete:false,scheduleTargetIndex:0,servicingStop:false,stopHoldUntil:0,scheduleRetryAt:0,repairHoldUntil:0,repairResumeStatus:null,energyDepleted:false,nextEnergyWarningAt:0,forwardDirection:{q:1,r:0},fuel:20,maxFuel:20,fuelUseAccumulator:0,hp:api.constants.TRAIN_HIT_POINTS,maxHp:api.constants.TRAIN_HIT_POINTS,status:"Idle",wagons,heading,wheelClock:0,wasNearBase:false,combatCooldown:0,gunAngle:heading};
  state.trains.push(train);return train;
}

module.exports = { api, elements: harness.elements, document: harness.document, moveTrain, makeTrack, makeEnemy, addTestTrain, performance, GAME_SCRIPTS };
