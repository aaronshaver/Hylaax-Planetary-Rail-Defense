"use strict";

function makeInitialState() {
  const mapSeed=Date.now();
  const [dq,dr]=DIRECTIONS[mapSeed%DIRECTIONS.length];
  const initialTrack=[1,2,3].map(distance=>({q:dq*distance,r:dr*distance}));
  const tracks = new Map();
  initialTrack.forEach(({q,r}) => tracks.set(key(q,r), { q, r, hp: TRACK_HIT_POINTS, maxHp: TRACK_HIT_POINTS, links: new Set() }));
  for(let index=0;index<initialTrack.length-1;index++){
    tracks.get(key(initialTrack[index].q,initialTrack[index].r)).links.add(key(initialTrack[index+1].q,initialTrack[index+1].r));
    tracks.get(key(initialTrack[index+1].q,initialTrack[index+1].r)).links.add(key(initialTrack[index].q,initialTrack[index].r));
  }
  const base = { id: "base", type: "base", q: 0, r: 0, hp: 100, maxHp: 100 };
  const [energyPosition,materialPosition,locoPosition]=initialTrack;
  const p = axialToWorld(locoPosition.q,locoPosition.r);
  const wm = axialToWorld(materialPosition.q,materialPosition.r);
  const we = axialToWorld(energyPosition.q,energyPosition.r);
  const heading=Math.atan2(p.y-wm.y,p.x-wm.x);
  return {
    mode: "select",
    paused: false,
    mapSeed,
    gameOver: false,
    finalMapView: false,
    elapsed: 0,
    hivesNeutralized: 0,
    creepsNeutralized: 0,
    stats: { tracksLaid: 0, minesBuilt: 0, turretsBuilt: 0, trainsBuilt: 0 },
    uiClock: 0,
    tracks,
    base,
    structures: new Map(),
    hives: new Map(),
    ghosts: new Map(),
    nodeResources: new Map(),
    clearedResourceNodes: new Set(),
    worldMessages: [],
    trains: [{
      id: "train-1", name: trainName(0,"builder"), code: trainCode(0), trainType: "builder", q: locoPosition.q, r: locoPosition.r, x: p.x, y: p.y,
      route: [], routePurpose: null, progress: 0, speed: 2.25, stepFrom: null, stepTo: null,
      schedule: [], scheduleComplete: false, scheduleTargetIndex: 0, servicingStop: false, stopHoldUntil: 0, scheduleRetryAt: 0, repairHoldUntil: 0, repairResumeStatus: null, energyDepleted: false, nextEnergyWarningAt: 0,
      forwardDirection: { q: dq, r: dr },
      fuel: 20, maxFuel: 20, hp: 28, maxHp: 28, status: "Idle",
      wagons: [
        { id: "wagon-1", kind: "wagon", q: materialPosition.q, r: materialPosition.r, x: wm.x, y: wm.y, heading, role: "material", type: "material", amount: 0, capacity: 30, hp: 18, maxHp: 18 },
        { id: "wagon-2", kind: "wagon", q: energyPosition.q, r: energyPosition.r, x: we.x, y: we.y, heading, role: "energy", type: "energy", amount: 0, capacity: 30, hp: 18, maxHp: 18 }
      ],
      heading, wheelClock: 0, wasNearBase: false
    }],
    enemies: [],
    projectiles: [],
    particles: [],
    baseMaterial: 100,
    baseEnergy: 48,
    selected: { type: "base", id: "base" },
    trackStart: null,
    scheduleTrainId: null,
    deploymentPaid: false,
    deploymentTrainType: null,
    deploymentHead: null,
    deploymentPaths: [],
    deploymentReserved: new Set(),
    pendingTrainSalvageId: null,
    hover: null,
    nextId: 3,
    nextTrainIndex: 1,
    camera: { x: 75, y: 45, zoom: 1 },
    pointer: { down: false, moved: false, x: 0, y: 0, startX: 0, startY: 0, camX: 0, camY: 0 },
    sound: true
  };
}

function hiveAt(q,r){return state.hives.get(key(q,r))||null;}

function hiveUnlockedLevel(elapsedSeconds=state.elapsed){
  const elapsedMinutes=elapsedSeconds/60;
  let level=2;
  for(const candidate of HIVE_LEVELS.slice(1))if(elapsedMinutes>=candidate)level=candidate;
  return level;
}

function nextHiveLevel(level){const index=HIVE_LEVELS.indexOf(level);return index<0?2:HIVE_LEVELS[Math.min(index+1,HIVE_LEVELS.length-1)];}

function hiveExpansionLevel(hive,elapsedSeconds=state.elapsed){const parentLevel=Math.max(2,hive?.level||2);return Math.max(parentLevel,Math.min(nextHiveLevel(parentLevel),hiveUnlockedLevel(elapsedSeconds)));}

function createHive(q,r,requestedLevel=2,spawnImmediately=false,forceFirstCreepBatch=false){
  const level=Math.max(2,requestedLevel);
  const nextMinute=(Math.floor(state.elapsed/60)+1)*60;
  const hive={id:`hive-${state.nextId++}`,type:"hive",q,r,level,hp:level,maxHp:level,nextSpawnAt:spawnImmediately?state.elapsed:nextMinute,spawnCount:0,forceFirstCreepBatch};
  state.hives.set(key(q,r),hive);
  return hive;
}

function hiveHexOpen(q,r){
  if(terrainAt(q,r).type!=="ground")return false;
  if(structureAt(q,r)||state.tracks.has(key(q,r))||ghostAt(q,r)||trainClaimsHex(q,r))return false;
  if([...state.hives.values()].some(hive=>hexDistance(hive,{q,r})<=1))return false;
  return !state.enemies.some(enemy=>enemy.q===q&&enemy.r===r);
}

function seedInitialHives(){
  const candidates=[];
  for(let q=-22;q<=22;q++)for(let r=-22;r<=22;r++){
    const distance=hexDistance({q,r},state.base);
    const tooCloseToInfrastructure=hexDistance({q,r},state.base)<INITIAL_HIVE_BUFFER||[...state.tracks.values()].some(track=>hexDistance({q,r},track)<INITIAL_HIVE_BUFFER);
    if(tooCloseToInfrastructure||distance>20||!hiveHexOpen(q,r))continue;
    candidates.push({q,r,score:terrainHash(q,r,901)});
  }
  candidates.sort((a,b)=>b.score-a.score);
  for(const candidate of candidates){
    if([...state.hives.values()].some(hive=>hexDistance(hive,candidate)<9))continue;
    createHive(candidate.q,candidate.r,2,true,true);
    if(state.hives.size>=INITIAL_HIVE_COUNT)break;
  }
}

let state = makeInitialState();
seedInitialHives();
let width = 1, height = 1, dpr = 1;
let lastWallTime = Date.now();
let simulationAccumulator = 0;
let performanceWindowStart = performance.now(), performanceTicks = 0, performanceFrames = 0;
let terrainLayerSignature="",terrainLayerResources=[],terrainLayerBuilds=0,terrainLayerCells=0,terrainRevision=0;
let selectionCache = "";
let enemyNavigationVersion=0;
let enemyNavigationCache={signature:"",distances:new Map(),targetKeys:new Set(),bounds:null,builds:0};
let remindersOpen=true;

class SoundBank {
  constructor() { this.audio = null; this.enabled = true; this.lastShot = 0; this.lastHit = 0; }
  init() {
    if (!this.enabled) return;
    if (!this.audio) this.audio = new (window.AudioContext || window.webkitAudioContext)();
    if (this.audio.state === "suspended") this.audio.resume();
  }
  tone(freq, duration, type = "sine", gain = .035, endFreq = null) {
    if (!this.enabled) return;
    this.init();
    const t = this.audio.currentTime;
    const osc = this.audio.createOscillator();
    const amp = this.audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
    amp.gain.setValueAtTime(.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + .012);
    amp.gain.exponentialRampToValueAtTime(.0001, t + duration);
    osc.connect(amp).connect(this.audio.destination);
    osc.start(t); osc.stop(t + duration + .02);
  }
  place() { this.tone(150, .12, "square", .025, 260); }
  remove() { this.tone(170, .16, "sawtooth", .022, 65); }
  dispatch() { this.tone(190, .38, "triangle", .038, 380); setTimeout(() => this.tone(250, .28, "triangle", .025, 470), 90); }
  shot() { const now = performance.now(); if (now - this.lastShot > 65) { this.lastShot = now; this.tone(920, .075, "square", .045, 240); setTimeout(()=>this.tone(135, .09, "sawtooth", .026, 70),18); } }
  hit() { const now = performance.now(); if (now - this.lastHit > 500) { this.lastHit = now; this.tone(75, .12, "sawtooth", .018, 48); } }
  error() { this.tone(105, .18, "square", .022, 72); }
}
const sounds = new SoundBank();

function toast(message, kind = "") {
  const item = document.createElement("div");
  item.className = `game-toast ${kind}`;
  item.textContent = message;
  ui.toastStack.appendChild(item);
  setTimeout(() => item.remove(), 2600);
}

function resize() {
  const rect = worldWrap.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = Math.max(1, rect.width);
  height = Math.max(1, rect.height);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  invalidateTerrainLayer();
}

function invalidateTerrainLayer(){terrainLayerSignature="";}

function screenToHex(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const sx = clientX - rect.left, sy = clientY - rect.top;
  const wx = (sx - width / 2) / state.camera.zoom + state.camera.x;
  const wy = (sy - height / 2) / state.camera.zoom + state.camera.y;
  return worldToAxial(wx, wy);
}

function isPassable(q, r) {
  const terrain = terrainAt(q, r);
  return terrain.type !== "water" && terrain.type !== "rock" && terrain.type !== "trees";
}

function structureAt(q, r) {
  if (state.base.q === q && state.base.r === r) return state.base;
  return state.structures.get(key(q, r)) || null;
}

function ghostAt(q,r){return state.ghosts.get(key(q,r))||null;}

function trackGhostAt(q,r){const ghost=ghostAt(q,r);return ghost?.objectType==="track"?ghost:null;}

function resourceNodeAt(q,r) {
  const terrain=terrainAt(q,r);
  if(terrain.type!=="resource")return null;
  const nodeKey=key(q,r);
  const maxAmount=NODE_MIN_CAPACITY+Math.floor(terrainHash(q,r,707)*(NODE_MAX_CAPACITY-NODE_MIN_CAPACITY+1));
  return {id:nodeKey,type:"node",resource:terrain.resource,q,r,amount:state.nodeResources.get(nodeKey)??maxAmount,maxAmount};
}

function setNodeAmount(node,amount) {
  const remaining=clamp(amount,0,node.maxAmount);
  state.nodeResources.set(key(node.q,node.r),remaining);
  node.amount=remaining;
}

function trainAt(q, r) {
  return state.trains.find(train => trainSegments(train).some(segment => segment.q === q && segment.r === r)) || null;
}

function trainClaimsHex(q,r){
  return state.trains.some(train=>trainSegments(train).some(segment=>segment.q===q&&segment.r===r)||(train.stepTo||[]).some(position=>position.q===q&&position.r===r));
}

function trainSegments(train) {
  return [train, ...train.wagons];
}

function trainSegmentAt(q, r) {
  for (const train of state.trains) {
    const segments = trainSegments(train);
    const index = segments.findIndex(segment => segment.q === q && segment.r === r);
    if (index >= 0) return { train, segment: segments[index], index };
  }
  return null;
}

function distanceToTrain(train, target) {
  return Math.min(...trainSegments(train).map(segment => hexDistance(segment, target)));
}

function getSelected() {
  if (!state.selected) return null;
  if (state.selected.type === "base") return state.base;
  if (state.selected.type === "train") return state.trains.find(t => t.id === state.selected.id) || null;
  if (state.selected.type === "structure") return [...state.structures.values()].find(s => s.id === state.selected.id) || null;
  if (state.selected.type === "hive") return [...state.hives.values()].find(hive => hive.id === state.selected.id) || null;
  if (state.selected.type === "enemy") return state.enemies.find(enemy => enemy.id === state.selected.id) || null;
  if (state.selected.type === "track") return state.tracks.get(state.selected.id) || null;
  if (state.selected.type === "ghost") return state.ghosts.get(state.selected.id) || null;
  if (state.selected.type === "node") { const position=fromKey(state.selected.id); return resourceNodeAt(position.q,position.r); }
  return null;
}

function clearDeploymentReservation(refund=false){
  if(refund&&state.deploymentPaid){state.baseMaterial+=COSTS.train.material;state.baseEnergy+=COSTS.train.energy;}
  state.deploymentPaid=false;state.deploymentTrainType=null;state.deploymentHead=null;state.deploymentPaths=[];state.deploymentReserved.clear();
}

function setMode(mode) {
  if(state.mode==="schedule"&&mode!=="schedule"&&state.scheduleTrainId){
    fail("Use Clear Schedule to exit stop adding mode.");
    return;
  }
  if (mode !== "track" || state.mode !== "track") state.trackStart = null;
  if(state.mode==="deploy"&&(mode!=="deploy"||state.deploymentPaid))clearDeploymentReservation(true);
  state.mode = mode;
  document.querySelectorAll("[data-mode]").forEach(button => button.classList.toggle("active", button.dataset.mode === mode));
  canvas.style.cursor = mode === "select" ? "default" : "crosshair";
  updateUI(true);
}

function select(type, id) {
  state.selected = { type, id };
  updateUI(true);
}
