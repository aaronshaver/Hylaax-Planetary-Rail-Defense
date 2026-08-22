"use strict";

function makeInitialState() {
  const mapSeed=Date.now();
  const base = { id: "base", type: "base", q: 0, r: 0, footprint:BASE_FOOTPRINT_OFFSETS.map(offset=>({q:offset.q,r:offset.r})), hp: 100, maxHp: 100 };
  const perimeter=footprintPerimeter(base.footprint),initialTrack=perimeter[Math.floor(Math.random()*perimeter.length)];
  const tracks = new Map();
  tracks.set(key(initialTrack.q,initialTrack.r), { ...initialTrack, hp: TRACK_HIT_POINTS, maxHp: TRACK_HIT_POINTS, links: new Set() });
  const baseCenter=structureWorldCenter(base);
  return {
    mode: "select",
    paused: false,
    mapSeed,
    gameOver: false,
    finalMapView: false,
    elapsed: 0,
    nextEncroachmentAt: 300,
    hivesNeutralized: 0,
    creepsNeutralized: 0,
    stats: { tracksLaid: 0, minesBuilt: 0, turretsBuilt: 0, trainsBuilt: 0, energyMined: 0, materialMined: 0 },
    uiClock: 0,
    tracks,
    base,
    structures: new Map(),
    hives: new Map(),
    hiveProductionQueue: [],
    hiveProductionAvailableAt: 0,
    ghosts: new Map(),
    nodeResources: new Map(),
    clearedResourceNodes: new Set(),
    worldMessages: [],
    trains: [],
    enemies: [],
    projectiles: [],
    particles: [],
    screenShakeUntil: 0,
    screenShakeUntilWallTime: 0,
    turretEnergyWarningShown: false,
    turretEnergyWarningWasPaused: false,
    baseMaterial: 150,
    baseEnergy: 48,
    researchPoints: 0,
    researchUnlocked: false,
    researchUpgrades: {},
    selected: { type: "base", id: "base" },
    trackStart: null,
    scheduleTrainId: null,
    deploymentPaid: false,
    deploymentTrainType: null,
    deploymentHead: null,
    deploymentPaths: [],
    deploymentReserved: new Set(),
    pendingTrainSalvageId: null,
    pendingResearchSalvageId: null,
    hover: null,
    nextId: 1,
    nextTrainIndex: 0,
    camera: { x: baseCenter.x, y: baseCenter.y, zoom: 1 },
    pointer: { down: false, moved: false, x: 0, y: 0, startX: 0, startY: 0, camX: 0, camY: 0 },
    sound: true,
    tutorial: null
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

function playerConstructionAnchors(){
  const anchors=[state.base,...state.tracks.values(),...state.structures.values()].flatMap(item=>structureFootprint(item)),unique=new Map();
  anchors.push(...[...state.ghosts.values()].flatMap(item=>structureFootprint(item)),...state.trains.flatMap(train=>trainSegments(train)));
  for(const anchor of anchors)unique.set(key(anchor.q,anchor.r),{q:anchor.q,r:anchor.r});
  return [...unique.values()];
}

function outsidePlayerConstructionBuffer(q,r,minimumDistance=ENEMY_SPAWN_BUFFER,anchors=playerConstructionAnchors()){
  return anchors.every(anchor=>hexDistance(anchor,{q,r})>=minimumDistance);
}

function hiveHexOpen(q,r,constructionAnchors=playerConstructionAnchors()){
  if(terrainAt(q,r).type!=="ground")return false;
  if(!outsidePlayerConstructionBuffer(q,r,ENEMY_SPAWN_BUFFER,constructionAnchors))return false;
  if(structureAt(q,r)||state.tracks.has(key(q,r))||ghostAt(q,r)||trainClaimsHex(q,r))return false;
  if([...state.hives.values()].some(hive=>hexDistance(hive,{q,r})<=1))return false;
  return !state.enemies.some(enemy=>enemy.q===q&&enemy.r===r);
}

function seedInitialHives(){
  const candidates=[],constructionAnchors=playerConstructionAnchors();
  for(let q=-22;q<=22;q++)for(let r=-22;r<=22;r++){
    const distance=distanceToStructure({q,r},state.base);
    const tooCloseToInfrastructure=distanceToStructure({q,r},state.base)<INITIAL_HIVE_BUFFER||[...state.tracks.values()].some(track=>hexDistance({q,r},track)<INITIAL_HIVE_BUFFER);
    if(tooCloseToInfrastructure||distance>20||!hiveHexOpen(q,r,constructionAnchors))continue;
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
let performanceWindowStart = performance.now(), performanceFrames = 0;
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
  tone(freq, duration, type = "sine", gain = .035, endFreq = null, delay = 0) {
    if (!this.enabled) return;
    this.init();
    const t = this.audio.currentTime+delay;
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
  scheduleStop() { this.tone(210, .13, "sine", .012, 420); this.tone(330, .1, "sine", .007, 560, .025); }
  remove() { this.tone(170, .16, "sawtooth", .022, 65); }
  shot() { const now = performance.now(); if (now - this.lastShot > 65) { this.lastShot = now; this.tone(430, .11, "triangle", .018, 240); this.tone(170, .13, "sine", .011, 105, .02); } }
  hit() { const now = performance.now(); if (now - this.lastHit > 500) { this.lastHit = now; this.tone(75, .12, "sawtooth", .018, 48); } }
  error() { this.tone(105, .18, "square", .022, 72); }
  trainDestroyed() {
    this.tone(105, .14, "square", .04, 72);
    this.tone(82, .14, "square", .04, 56, .07);
    this.tone(62, .18, "square", .045, 42, .14);
  }
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

function centerMapOnBase(){
  const center=structureWorldCenter(state.base);
  state.camera.x=center.x;state.camera.y=center.y;render();canvas.focus();return center;
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
  if (structureFootprint(state.base).some(cell=>cell.q===q&&cell.r===r)) return state.base;
  return state.structures.get(key(q, r)) || [...state.structures.values()].find(structure=>structureFootprint(structure).some(cell=>cell.q===q&&cell.r===r)) || null;
}

function structureFootprint(object){return object?.footprint?.length?object.footprint:[{q:object.q,r:object.r}];}
function distanceToStructure(position,object){return Math.min(...structureFootprint(object).map(cell=>hexDistance(position,cell)));}
function nearestStructureCell(position,object){return [...structureFootprint(object)].sort((a,b)=>hexDistance(position,a)-hexDistance(position,b))[0];}
function structureWorldCenter(object){const cells=structureFootprint(object),points=cells.map(cell=>axialToWorld(cell.q,cell.r));return {x:points.reduce((sum,point)=>sum+point.x,0)/points.length,y:points.reduce((sum,point)=>sum+point.y,0)/points.length};}
function basePerimeter(){return footprintPerimeter(structureFootprint(state.base));}

function ghostAt(q,r){return state.ghosts.get(key(q,r))||[...state.ghosts.values()].find(ghost=>structureFootprint(ghost).some(cell=>cell.q===q&&cell.r===r))||null;}

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

function setMode(mode,clearSelection=false) {
  if(state.mode==="schedule"&&mode!=="schedule")state.scheduleTrainId=null;
  if(!constructionModeAffordable(mode)){fail(constructionModeUnavailableMessage(mode));updateUI(true);return false;}
  if (mode !== "track" || state.mode !== "track") state.trackStart = null;
  if(state.mode==="deploy"&&(mode!=="deploy"||state.deploymentPaid))clearDeploymentReservation(true);
  if(mode==="select"&&clearSelection)state.selected=null;
  state.mode = mode;
  document.querySelectorAll("[data-mode]").forEach(button => button.classList.toggle("active", button.dataset.mode === mode));
  canvas.style.cursor = mode === "select" ? "default" : "crosshair";
  tutorialEvent("mode",{mode});
  updateUI(true);
  return true;
}

function select(type, id, details={}) {
  state.selected = { type, id, ...details };
  updateUI(true);
}
