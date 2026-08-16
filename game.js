(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const terrainLayer = document.createElement("canvas");
  const terrainCtx = terrainLayer.getContext("2d");
  const worldWrap = document.getElementById("worldWrap");
  const selectionContent = document.getElementById("selectionContent");
  const HEX = 31;
  const SQRT3 = Math.sqrt(3);
  const NODE_MIN_CAPACITY = 100;
  const NODE_MAX_CAPACITY = 1000;
  const INITIAL_HIVE_BUFFER = 8;
  const INITIAL_HIVE_COUNT = 2;
  const ENEMY_SPEED = .38;
  const SIMULATION_STEP = 1 / 60;
  const TRACK_HIT_POINTS = 1;
  const REPAIR_PAUSE_SECONDS = 1;
  const TURRET_RANGE = 4;
  const COMBAT_TRAIN_RANGE = 6;
  const BASE_UNLOAD_TARGET = 100;
  const HIVE_LEVELS = [2,3,5,8,13,21];
  const DIRECTIONS = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
  const COSTS = {
    train: { material: 30, energy: 0 },
    turret: { material: 10, energy: 5 },
    mine: { material: 8, energy: 0 }
  };
  const REBUILD_COSTS = { track: 1, turret: 10, mine: 8 };
  const HEX_CORNERS = Array.from({length:6},(_,index)=>{const angle=(Math.PI/180)*(60*index-30);return {x:Math.cos(angle),y:Math.sin(angle)};});

  const ui = Object.fromEntries([
    "hivesNeutralized", "creepsNeutralized", "timeSurvived", "hivesInWorld", "creepsInWorld",
    "pauseToggle", "soundToggle",
    "hoverStatus", "hoverTitle", "hoverDetail", "gameOver", "survivalTime", "viewMapButton", "viewFinalStats", "restartButton", "toastStack", "performanceStatus", "tpsValue", "fpsValue",
    "confirmDialog", "confirmMessage", "confirmYes", "confirmNo", "remindersDialog", "remindersContinue",
    "defeatHivesNeutralized", "defeatCreepsNeutralized", "defeatTracksLaid", "defeatMinesBuilt", "defeatTurretsBuilt", "defeatTrainsBuilt"
  ].map(id => [id, document.getElementById(id)]));

  const key = (q, r) => `${q},${r}`;
  const fromKey = value => { const [q,r]=value.split(",").map(Number); return {q,r}; };
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const hexDistance = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
  const neighbors = (q, r) => DIRECTIONS.map(([dq, dr]) => ({ q: q + dq, r: r + dr }));

  function trainCode(index) {
    let value=index,label="";
    do { label=String.fromCharCode(65+(value%26))+label; value=Math.floor(value/26)-1; } while(value>=0);
    return label;
  }

  function trainName(index,type="builder") {return `${type==="combat"?"Combat":"Build and Mine"} Train ${trainCode(index)}`;}

  function axialToWorld(q, r) {
    return { x: HEX * SQRT3 * (q + r / 2), y: HEX * 1.5 * r };
  }

  function worldToAxial(x, y) {
    const q = (SQRT3 / 3 * x - y / 3) / HEX;
    const r = (2 / 3 * y) / HEX;
    return cubeRound(q, r);
  }

  function cubeRound(q, r) {
    let x = q, z = r, y = -x - z;
    let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy > dz) ry = -rx - rz;
    else rz = -rx - ry;
    return { q: rx, r: rz };
  }

  function hash(q, r, salt = 0) {
    let n = Math.imul(q, 374761393) + Math.imul(r, 668265263) + Math.imul(salt, 1442695041);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }

  function terrainHash(q,r,salt=0){return hash(q,r,(state.mapSeed+salt)|0);}

  function terrainNoise(q,r,scale,salt){
    const x=q/scale,y=r/scale,x0=Math.floor(x),y0=Math.floor(y),tx=x-x0,ty=y-y0;
    const sx=tx*tx*(3-2*tx),sy=ty*ty*(3-2*ty);
    const a=terrainHash(x0,y0,salt),b=terrainHash(x0+1,y0,salt),c=terrainHash(x0,y0+1,salt),d=terrainHash(x0+1,y0+1,salt);
    return lerp(lerp(a,b,sx),lerp(c,d,sx),sy);
  }

  function inWaterBlob(q,r){
    const size=13,mq=Math.floor(q/size),mr=Math.floor(r/size);
    for(let dq=-1;dq<=1;dq++)for(let dr=-1;dr<=1;dr++){
      const cellQ=mq+dq,cellR=mr+dr;
      if(terrainHash(cellQ,cellR,101)>.34)continue;
      const centerQ=cellQ*size+terrainHash(cellQ,cellR,102)*(size-1);
      const centerR=cellR*size+terrainHash(cellQ,cellR,103)*(size-1);
      const x=(q-centerQ)+(r-centerR)/2,y=(r-centerR)*.8660254;
      const radius=2.4+terrainHash(cellQ,cellR,104)*3.2;
      if(Math.hypot(x,y)<=radius)return true;
    }
    return false;
  }

  function inTreeGrove(q,r){
    const size=10,mq=Math.floor(q/size),mr=Math.floor(r/size);
    for(let dq=-1;dq<=1;dq++)for(let dr=-1;dr<=1;dr++){
      const cellQ=mq+dq,cellR=mr+dr;
      if(terrainHash(cellQ,cellR,301)>.28)continue;
      const centerQ=cellQ*size+terrainHash(cellQ,cellR,302)*(size-1);
      const centerR=cellR*size+terrainHash(cellQ,cellR,303)*(size-1);
      const x=(q-centerQ)+(r-centerR)/2,y=(r-centerR)*.8660254;
      const radius=2+terrainHash(cellQ,cellR,304)*2.2;
      if(Math.hypot(x,y)<=radius)return true;
    }
    return false;
  }

  const guaranteedNodes = new Map([
    [key(7, -2), "material"],
    [key(-4, 7), "energy"],
    [key(13, 3), "energy"],
    [key(-12, -4), "material"]
  ]);
  let terrainCacheSeed=null,terrainCache=new Map();

  function terrainAt(q, r) {
    if(terrainCacheSeed!==state.mapSeed){terrainCacheSeed=state.mapSeed;terrainCache=new Map();}
    const terrainKey=key(q,r);
    if(state.clearedResourceNodes?.has(terrainKey))return {type:"ground"};
    const cached=terrainCache.get(terrainKey);if(cached)return cached;
    const guaranteed = guaranteedNodes.get(terrainKey);
    if (guaranteed){const terrain={type:"resource",resource:guaranteed};terrainCache.set(terrainKey,terrain);return terrain;}
    const d = hexDistance({ q, r }, { q: 0, r: 0 });
    const corridorA = q >= 0 && q <= 7 && r >= -2 && r <= 0;
    const corridorB = q >= -4 && q <= 0 && r >= 0 && r <= 7;
    let terrain;
    if (d < 6 || corridorA || corridorB)terrain={type:"ground"};
    else if(inWaterBlob(q,r))terrain={type:"water"};
    else if(inTreeGrove(q,r))terrain={type:"trees"};
    else{
    const ridge=terrainNoise(q,r,11,201),ridgeDetail=terrainNoise(q,r,3.4,202);
      if(Math.abs(ridge-.5)<.034&&ridgeDetail>.3)terrain={type:"rock"};
      else {const v=terrainHash(q,r,17);terrain=v>.986?{type:"resource",resource:terrainHash(q,r,31)>.5?"material":"energy"}:{type:"ground"};}
    }
    terrainCache.set(terrainKey,terrain);return terrain;
  }

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

  function isRailHex(q, r) {
    return state.tracks.has(key(q, r));
  }

  function isScheduleTrackHex(q,r){return isRailHex(q,r)||Boolean(trackGhostAt(q,r));}

  function connectedTrackNeighbors(q, r) {
    const track = state.tracks.get(key(q,r));
    return track ? [...track.links].map(fromKey) : [];
  }

  function conceptualTrackNeighbors(q,r){
    const positionKey=key(q,r),linked=new Set();
    const track=state.tracks.get(positionKey),ghost=trackGhostAt(q,r);
    for(const linkedKey of track?.links||[])linked.add(linkedKey);
    for(const linkedKey of ghost?.links||[])linked.add(linkedKey);
    for(const candidate of state.ghosts.values())if(candidate.objectType==="track"&&(candidate.links||[]).includes(positionKey))linked.add(candidate.id);
    return [...linked].filter(linkedKey=>state.tracks.has(linkedKey)||state.ghosts.get(linkedKey)?.objectType==="track").map(fromKey);
  }

  function tracksAreLinked(a, b) {
    return state.tracks.get(key(a.q,a.r))?.links.has(key(b.q,b.r)) || false;
  }

  function linkTracks(a, b) {
    state.tracks.get(key(a.q,a.r)).links.add(key(b.q,b.r));
    state.tracks.get(key(b.q,b.r)).links.add(key(a.q,a.r));
  }

  function deleteTrack(q, r) {
    const k=key(q,r),track=state.tracks.get(k);
    if(!track)return;
    for(const linkedKey of track.links)state.tracks.get(linkedKey)?.links.delete(k);
    state.tracks.delete(k);
    invalidateEnemyNavigation();
    if(state.trackStart?.q===q&&state.trackStart?.r===r)state.trackStart=null;
  }

  function trainScheduleCode(train){return train.code||train.name.match(/([A-Z]+)$/)?.[1]||"?";}

  function scheduleStopOwner(q,r,excludeTrainId=null){
    return state.trains.find(train=>train.id!==excludeTrainId&&(train.schedule||[]).some(stop=>stop.q===q&&stop.r===r))||null;
  }

  function scheduleStopAt(q,r){
    for(const train of state.trains){
      const index=(train.schedule||[]).findIndex(stop=>stop.q===q&&stop.r===r);
      if(index>=0)return {train,index};
    }
    return null;
  }

  function curveIsExtreme(start, end) {
    return connectedTrackNeighbors(start.q,start.r).some(neighbor=>tracksAreLinked(neighbor,end));
  }

  function trackWithinRange(target, range = 3) {
    return [...state.tracks.values()].some(track=>hexDistance(track,target)<=range);
  }

  function requireNearbyTrack(target, action) {
    if(trackWithinRange(target,3))return true;
    fail(`${capitalize(action)} must be within three hexes of track.`);
    return false;
  }

  function placeTrackOverGhost(ghost){
    if(!payBase({material:1,energy:0},"Track"))return null;
    const ghostKey=key(ghost.q,ghost.r),rebuilt={q:ghost.q,r:ghost.r,hp:TRACK_HIT_POINTS,maxHp:TRACK_HIT_POINTS,links:new Set()};
    state.tracks.set(ghostKey,rebuilt);
    for(const linkedKey of ghost.links||[]){const neighbor=state.tracks.get(linkedKey);if(neighbor){rebuilt.links.add(linkedKey);neighbor.links.add(ghostKey);}else{const neighborGhost=state.ghosts.get(linkedKey);if(neighborGhost?.objectType==="track"&&!neighborGhost.links.includes(ghostKey))neighborGhost.links.push(ghostKey);}}
    state.ghosts.delete(ghostKey);
    invalidateEnemyNavigation();
    if(state.selected?.type==="ghost"&&state.selected.id===ghostKey)state.selected={type:"track",id:ghostKey};
    showWorldActivity(rebuilt,"Rebuilt Track",1.4);
    return rebuilt;
  }

  function layTrack(q, r) {
    const destination={q,r},destinationKey=key(q,r);
    if(!state.trackStart){
      const startGhost=ghostAt(q,r);
      if(!state.tracks.has(destinationKey)){
        if(startGhost?.objectType!=="track")return fail("Select an existing track hex first.");
        if(!placeTrackOverGhost(startGhost))return;
        sounds.place();burst(q,r,"#d9bd78",5);
        if(state.baseMaterial<=0){toast("Base has no Construction Material remaining.","info");setMode("select");return;}
      }
      state.trackStart=destination;toast("Track Start Selected. Click adjacent hexes to keep building.","info");updateUI(true);return;
    }
    const start=state.trackStart;
    const destinationGhost=ghostAt(q,r);
    const isTrackGhost=destinationGhost?.objectType==="track";
    const isNew=!state.tracks.has(destinationKey);
    if(!isNew&&hexDistance(start,destination)!==1){
      state.trackStart=destination;
      toast("New Track Start Selected. Click an adjacent hex to keep building.","info");
      updateUI(true);
      return;
    }
    if(hexDistance(start,destination)!==1)return fail("Choose an adjacent hex, or click a non-adjacent existing Track to choose a new start.");
    if(tracksAreLinked(start,destination)){
      state.trackStart=destination;
      toast("Track Start Moved Along The Existing Route.","info");
      updateUI(true);
      return;
    }
    if(isNew){
      if(!isPassable(q,r)||terrainAt(q,r).type==="resource")return fail("Track needs clear ground.");
      if(destinationGhost&&!isTrackGhost)return fail("A destroyed object occupies that hex. Rebuild it with an adjacent stopped locomotive.");
      if(structureAt(q,r)||hiveAt(q,r)||trainAt(q,r))return fail("That hex is occupied.");
    }
    if(curveIsExtreme(start,destination))return fail("Train curves cannot be that extreme");
    if(isNew){
      if(isTrackGhost){if(!placeTrackOverGhost(destinationGhost))return;}
      else {if(!payBase({material:1,energy:0},"Track"))return;state.tracks.set(destinationKey,{q,r,hp:TRACK_HIT_POINTS,maxHp:TRACK_HIT_POINTS,links:new Set()});state.stats.tracksLaid++;invalidateEnemyNavigation();}
    }
    linkTracks(start,destination);
    state.trackStart=destination;
    sounds.place();
    burst(q, r, "#d9bd78", 5);
    if(isNew&&state.baseMaterial<=0){toast("Base has no Construction Material remaining.","info");setMode("select");return;}
    updateUI(true);
  }

  function removeTrack(q, r) {
    const k = key(q, r);
    if (!state.tracks.has(k)) return;
    if (trainAt(q, r)) return fail("Move the train before removing this track.");
    deleteTrack(q,r);
    state.baseMaterial++;
    if (state.selected?.type === "track" && state.selected.id === k) state.selected = null;
    sounds.remove();
    updateUI(true);
  }

  function fail(message) { sounds.error(); toast(message, "danger"); }

  function totalCargo(train, type) {
    return train.wagons.filter(w => w.type === type).reduce((sum, w) => sum + w.amount, 0);
  }

  function cargoSpace(train, type) {
    return train.wagons.filter(w => (w.role || w.type) === type).reduce((sum, w) => sum + w.capacity - w.amount, 0);
  }

  function removeCargo(train, type, amount) {
    let remaining = amount;
    for (const wagon of train.wagons.filter(w => w.type === type)) {
      const used = Math.min(wagon.amount, remaining);
      wagon.amount -= used; remaining -= used;
      if (wagon.amount <= .0001) { wagon.amount = 0; wagon.type = wagon.role || type; }
      if (remaining <= .0001) break;
    }
    return amount - remaining;
  }

  function addCargo(train, type, amount) {
    let remaining = amount;
    const compatible = train.wagons.filter(w => (w.role || w.type) === type);
    for (const wagon of compatible) {
      wagon.type = wagon.role || type;
      const added = Math.min(wagon.capacity - wagon.amount, remaining);
      wagon.amount += added; remaining -= added;
      if (remaining <= .0001) break;
    }
    return amount - remaining;
  }

  function buildTurret(q, r) {
    if(!requireNearbyTrack({q,r},"building a turret"))return;
    if(ghostAt(q,r))return fail("A destroyed object occupies that hex. Rebuild it with an adjacent stopped locomotive.");
    if (!isPassable(q, r) || terrainAt(q, r).type === "resource" || structureAt(q, r) || hiveAt(q,r) || state.tracks.has(key(q,r))) return fail("Turrets need clear ground away from track.");
    if(!payBase(COSTS.turret,"Turret"))return;
    const turret = { id: `turret-${state.nextId++}`, type: "turret", q, r, hp: 18, maxHp: 18, energy: 20, maxEnergy: 20, cooldown: 0, showRangeUntil: state.elapsed + 3.5 };
    state.structures.set(key(q,r), turret);
    invalidateEnemyNavigation();
    state.stats.turretsBuilt++;
    sounds.place(); burst(q, r, "#65dbe0", 10); select("structure", turret.id);
  }

  function buildMine(q, r) {
    const terrain = terrainAt(q, r);
    if(!requireNearbyTrack({q,r},"building a mine"))return;
    if(ghostAt(q,r))return fail("A destroyed object occupies that hex. Rebuild it with an adjacent stopped locomotive.");
    if (terrain.type !== "resource") return fail("Mines must be placed on a resource node.");
    if (structureAt(q, r) || hiveAt(q,r) || state.tracks.has(key(q,r))) return fail("That resource node is occupied.");
    if(!payBase(COSTS.mine,"Mine"))return;
    const mine = { id: `mine-${state.nextId++}`, type: "mine", resource: terrain.resource, q, r, hp: 22, maxHp: 22 };
    state.structures.set(key(q,r), mine);
    invalidateEnemyNavigation();
    state.stats.minesBuilt++;
    sounds.place(); burst(q, r, terrain.resource === "energy" ? "#60d5db" : "#e6b94a", 10); select("structure", mine.id);
  }

  function salvageStructure(structure) {
    if(!requireNearbyTrack(structure,`salvaging the ${structure.type}`))return;
    const mat = structure.type === "turret" ? 4 : 6;
    const energy = structure.type==="turret"?Math.floor(structure.energy):0;
    if(structure.type==="mine"){
      const node=resourceNodeAt(structure.q,structure.r);
      if(node?.amount<=0){
        const nodeKey=key(structure.q,structure.r);
        state.clearedResourceNodes.add(nodeKey);state.nodeResources.delete(nodeKey);terrainCache.delete(nodeKey);
        terrainRevision++;invalidateTerrainLayer();
      }
    }
    state.baseMaterial+=mat;state.baseEnergy+=energy;
    state.structures.delete(key(structure.q, structure.r));
    invalidateEnemyNavigation();
    state.selected = { type: "base", id: "base" };
    sounds.remove(); burst(structure.q, structure.r, "#9ba9ad", 8); updateUI(true);
    toast(structure.type==="turret"?`Salvaged ${mat} Construction Material and ${energy} Energy.`:`Salvaged ${mat} Construction Material.`);
  }

  function requestTrainSalvage(train){
    state.pendingTrainSalvageId=train.id;
    ui.confirmMessage.textContent=`${train.name} and all of its schedule stops will be removed. 30 Construction Material and all carried resources will return to Base.`;
    ui.confirmDialog.hidden=false;ui.confirmDialog.classList.remove("d-none");ui.confirmYes.focus();
  }

  function cancelTrainSalvage(){
    state.pendingTrainSalvageId=null;ui.confirmDialog.hidden=true;ui.confirmDialog.classList.add("d-none");canvas.focus();
  }

  function confirmTrainSalvage(){
    const train=state.trains.find(candidate=>candidate.id===state.pendingTrainSalvageId);
    if(!train){cancelTrainSalvage();return false;}
    const carriedMaterial=totalCargo(train,"material"),carriedEnergy=totalCargo(train,"energy");
    state.baseMaterial+=COSTS.train.material+carriedMaterial;state.baseEnergy+=carriedEnergy;
    state.trains=state.trains.filter(candidate=>candidate.id!==train.id);
    if(state.scheduleTrainId===train.id)state.scheduleTrainId=null;
    if(state.selected?.type==="train"&&state.selected.id===train.id)state.selected={type:"base",id:"base"};
    sounds.remove();burst(train.q,train.r,"#9ba9ad",10);cancelTrainSalvage();updateUI(true);
    toast(`Salvaged ${train.name}. Returned ${COSTS.train.material+carriedMaterial} Construction Material${carriedEnergy?` and ${carriedEnergy} Energy`:""} to Base.`);
    return true;
  }

  function deploymentPathsFrom(head,length=3){
    const paths=[];
    const occupied=position=>trainClaimsHex(position.q,position.r)||structureAt(position.q,position.r)||hiveAt(position.q,position.r);
    const extend=path=>{
      if(path.length===length){paths.push(path);return;}
      const current=path[path.length-1];
      for(const next of connectedTrackNeighbors(current.q,current.r)){
        if(path.some(position=>position.q===next.q&&position.r===next.r)||occupied(next))continue;
        extend([...path,next]);
      }
    };
    if(!occupied(head))extend([head]);
    return paths;
  }

  function deployTrain(q,r){
    if(!state.deploymentPaid)return fail("Use a Fabricate and Place Train button at the Base first.");
    const trainType=state.deploymentTrainType||"builder",length=trainType==="combat"?2:3,distanceText=length===2?"one Track hex":"two Track hexes";
    if(!state.deploymentHead){
      if(!isRailHex(q,r))return fail("Select an empty Track hex for the Train Head.");
      if(trainClaimsHex(q,r))return fail("That Track is occupied or already being entered.");
      const head={q,r},paths=deploymentPathsFrom(head,length);
      if(!paths.length)return fail(`Deployment needs ${length} connected, unoccupied Track hexes.`);
      state.deploymentHead=head;state.deploymentPaths=paths;
      state.deploymentReserved=new Set(paths.flat().map(position=>key(position.q,position.r)));
      toast(`Train Head Selected. Click a highlighted Tail point ${distanceText} away.`,"info");updateUI(true);return;
    }
    const path=state.deploymentPaths.find(candidate=>candidate[candidate.length-1].q===q&&candidate[candidate.length-1].r===r);
    if(!path)return fail(`Click a highlighted Tail point exactly ${distanceText} from the Head.`);
    if(path.some(position=>trainClaimsHex(position.q,position.r)))return fail("Those deployment Track hexes are no longer clear.");
    const [head,firstWagon]=path,hp=axialToWorld(head.q,head.r),firstPoint=axialToWorld(firstWagon.q,firstWagon.r);
    const heading=Math.atan2(hp.y-firstPoint.y,hp.x-firstPoint.x),trainIndex=state.nextTrainIndex++,code=trainCode(trainIndex),roles=trainType==="combat"?["energy"]:["material","energy"];
    const wagons=roles.map((role,index)=>{const position=path[index+1],point=axialToWorld(position.q,position.r);return {id:`wagon-${state.nextId++}`,kind:"wagon",q:position.q,r:position.r,x:point.x,y:point.y,heading,role,type:role,amount:0,capacity:30,hp:18,maxHp:18};});
    const train={id:`train-${state.nextId++}`,name:trainName(trainIndex,trainType),code,trainType,q:head.q,r:head.r,x:hp.x,y:hp.y,route:[],routePurpose:null,progress:0,speed:2.25,stepFrom:null,stepTo:null,schedule:[],scheduleComplete:false,scheduleTargetIndex:0,servicingStop:false,stopHoldUntil:0,scheduleRetryAt:0,repairHoldUntil:0,repairResumeStatus:null,energyDepleted:false,nextEnergyWarningAt:0,forwardDirection:{q:head.q-firstWagon.q,r:head.r-firstWagon.r},fuel:10,maxFuel:20,hp:28,maxHp:28,status:"Idle",wagons,heading,wheelClock:0,wasNearBase:false,combatCooldown:0,gunAngle:heading};
    state.trains.push(train);state.stats.trainsBuilt++;clearDeploymentReservation();sounds.place();select("train",train.id);setMode("select");toast(`${train.name} Deployed.`,"info");
  }

  function findPath(start, goal) {
    if (!isRailHex(goal.q,goal.r)) return null;
    const initialDirection = start.wagons?.length
      ? { q:start.q-start.wagons[0].q, r:start.r-start.wagons[0].r }
      : start.forwardDirection;
    const nodes = [{ q:start.q, r:start.r, parent:-1, dq:initialDirection?.q ?? null, dr:initialDirection?.r ?? null }];
    const queue = [0];
    const visited = new Set([`${start.q},${start.r}|${initialDirection?.q ?? "x"},${initialDirection?.r ?? "x"}`]);
    let cursor = 0, goalIndex = -1;
    while (cursor < queue.length && nodes.length < 3500) {
      const nodeIndex = queue[cursor++], current = nodes[nodeIndex];
      if (current.q === goal.q && current.r === goal.r) { goalIndex = nodeIndex; break; }
      for (const next of connectedTrackNeighbors(current.q,current.r)) {
        const dq=next.q-current.q, dr=next.r-current.r;
        if (current.dq !== null && dq === -current.dq && dr === -current.dr) continue;
        const visitKey=`${next.q},${next.r}|${dq},${dr}`;
        if (visited.has(visitKey)) continue;
        visited.add(visitKey);
        nodes.push({ q:next.q, r:next.r, parent:nodeIndex, dq, dr });
        queue.push(nodes.length-1);
      }
    }
    if (goalIndex < 0) return null;
    const path=[];
    for (let index=goalIndex; nodes[index].parent>=0; index=nodes[index].parent) path.push({q:nodes[index].q,r:nodes[index].r});
    return path.reverse();
  }

  function findConceptualTrackPath(start,goal){
    if(!isRailHex(goal.q,goal.r)&&!trackGhostAt(goal.q,goal.r))return null;
    const initialDirection=start.wagons?.length?{q:start.q-start.wagons[0].q,r:start.r-start.wagons[0].r}:start.forwardDirection;
    const nodes=[{q:start.q,r:start.r,parent:-1,dq:initialDirection?.q??null,dr:initialDirection?.r??null}],queue=[0];
    const visited=new Set([`${start.q},${start.r}|${initialDirection?.q??"x"},${initialDirection?.r??"x"}`]);
    let cursor=0,goalIndex=-1;
    while(cursor<queue.length&&nodes.length<3500){
      const nodeIndex=queue[cursor++],current=nodes[nodeIndex];
      if(current.q===goal.q&&current.r===goal.r){goalIndex=nodeIndex;break;}
      for(const next of conceptualTrackNeighbors(current.q,current.r)){
        const dq=next.q-current.q,dr=next.r-current.r;
        if(current.dq!==null&&dq===-current.dq&&dr===-current.dr)continue;
        const visitKey=`${next.q},${next.r}|${dq},${dr}`;
        if(visited.has(visitKey))continue;
        visited.add(visitKey);nodes.push({q:next.q,r:next.r,parent:nodeIndex,dq,dr});queue.push(nodes.length-1);
      }
    }
    if(goalIndex<0)return null;
    const path=[];
    for(let index=goalIndex;nodes[index].parent>=0;index=nodes[index].parent)path.push({q:nodes[index].q,r:nodes[index].r});
    return path.reverse();
  }

  function repairApproachFor(train,target){
    const conceptualPath=findConceptualTrackPath(train,target);
    if(!conceptualPath)return null;
    const breakIndex=conceptualPath.findIndex(position=>trackGhostAt(position.q,position.r));
    if(breakIndex<0)return null;
    return {ghost:trackGhostAt(conceptualPath[breakIndex].q,conceptualPath[breakIndex].r),path:conceptualPath.slice(0,breakIndex)};
  }

  function scheduleLoopIsReachable(train){
    const stops=train.schedule||[];
    if(stops.length<3)return false;
    let position={q:train.q,r:train.r};
    let direction=train.wagons?.length?{q:train.q-train.wagons[0].q,r:train.r-train.wagons[0].r}:train.forwardDirection;
    for(const target of [...stops,stops[0]]){
      if(position.q===target.q&&position.r===target.r)continue;
      const path=findConceptualTrackPath({q:position.q,r:position.r,forwardDirection:direction},target);
      if(!path?.length)return false;
      const previous=path.length>1?path[path.length-2]:position;
      direction={q:target.q-previous.q,r:target.r-previous.r};
      position=target;
    }
    return true;
  }

  function addScheduleStop(train,q,r){
    if(state.mode!=="schedule"||state.scheduleTrainId!==train.id)return;
    if(!isScheduleTrackHex(q,r))return fail("Schedule stops must be placed on Track or Destroyed Track.");
    const owner=scheduleStopOwner(q,r,train.id);
    if(owner)return fail(`That Track is already Stop ${trainScheduleCode(owner)}${owner.schedule.findIndex(stop=>stop.q===q&&stop.r===r)+1}.`);
    const stops=train.schedule;
    const existingIndex=stops.findIndex(stop=>stop.q===q&&stop.r===r);
    if(existingIndex===0){
      if(stops.length<3)return fail("A schedule needs at least 3 stops before returning to its first stop.");
      if(!scheduleLoopIsReachable(train))return fail("The schedule must form a forward-only Track loop.");
      train.scheduleComplete=true;train.scheduleTargetIndex=0;train.servicingStop=false;train.stopHoldUntil=0;train.scheduleRetryAt=0;
      state.scheduleTrainId=null;state.mode="select";
      document.querySelectorAll("[data-mode]").forEach(button=>button.classList.toggle("active",button.dataset.mode==="select"));
      canvas.style.cursor="default";
      toast(`${train.name} Schedule Complete.`,"info");sounds.place();updateUI(true);return;
    }
    if(existingIndex>0)return fail("Select the first stop again to complete the schedule.");
    if(stops.length>=9)return fail("A train schedule cannot have more than 9 stops.");
    stops.push({q,r});sounds.place();updateUI(true);
  }

  function clearTrainSchedule(train){
    train.schedule=[];train.scheduleComplete=false;train.scheduleTargetIndex=0;train.servicingStop=false;train.stopHoldUntil=0;train.scheduleRetryAt=0;train.repairHoldUntil=0;train.repairResumeStatus=null;
    if(train.stepFrom&&train.route.length)train.route=[train.route[0]];else train.route=[];train.routePurpose=null;
    train.status=train.stepFrom?"Stopping at next hex":"Idle";
    if(state.scheduleTrainId===train.id)state.scheduleTrainId=null;
    state.mode="select";
    document.querySelectorAll("[data-mode]").forEach(button=>button.classList.toggle("active",button.dataset.mode==="select"));
    canvas.style.cursor="default";updateUI(true);
  }

  function startScheduledLeg(train){
    if(!train.scheduleComplete||!trainStopped(train)||state.elapsed<train.scheduleRetryAt||state.elapsed<(train.repairHoldUntil||0))return false;
    if(train.energyDepleted){
      if(train.fuel<=.15&&totalCargo(train,"energy")<=0){train.status="Stuck — no Energy";return false;}
      train.energyDepleted=false;
    }
    const target=train.schedule[train.scheduleTargetIndex];
    if(!target)return false;
    if(train.q===target.q&&train.r===target.r){
      const reached=train.scheduleTargetIndex;
      train.servicingStop=true;train.stopHoldUntil=state.elapsed+1;train.scheduleTargetIndex=(reached+1)%train.schedule.length;train.status=`At Stop ${trainScheduleCode(train)}${reached+1}`;
      return true;
    }
    const path=findPath(train,target);
    if(!path?.length){
      const approach=repairApproachFor(train,target);
      if(!approach){train.status="Schedule blocked";train.scheduleRetryAt=state.elapsed+1;return false;}
      if(totalCargo(train,"material")<REBUILD_COSTS.track){train.status="Schedule blocked — needs Construction Material";train.scheduleRetryAt=state.elapsed+1;return false;}
      if(!approach.path.length){train.status="Waiting to rebuild Track";train.scheduleRetryAt=state.elapsed+.1;return false;}
      train.route=approach.path;train.routePurpose="repair";train.progress=0;train.stepFrom=null;train.stepTo=null;train.servicingStop=false;train.status="En route to repair Track";
      sounds.dispatch();return true;
    }
    train.route=path;train.routePurpose="schedule";train.progress=0;train.stepFrom=null;train.stepTo=null;train.servicingStop=false;train.status="En route";
    sounds.dispatch();return true;
  }

  function updateTrainSchedules(){
    for(const train of state.trains){
      if(!train.scheduleComplete||!trainStopped(train))continue;
      if(state.elapsed<(train.repairHoldUntil||0))continue;
      if(train.servicingStop){if(state.elapsed<train.stopHoldUntil)continue;train.servicingStop=false;}
      startScheduledLeg(train);
    }
  }

  function handleHexClick(hex) {
    if (state.gameOver) return;
    const { q, r } = hex;
    const structure = structureAt(q,r);
    const hive=hiveAt(q,r);
    const ghost=ghostAt(q,r);
    const train = trainAt(q,r);
    if (state.mode === "track") return layTrack(q,r);
    if(state.mode==="schedule"){
      const scheduleTrain=state.trains.find(candidate=>candidate.id===state.scheduleTrainId);
      return scheduleTrain?addScheduleStop(scheduleTrain,q,r):setMode("select");
    }
    if (state.mode === "salvage") {
      if(train)return requestTrainSalvage(train);
      if (state.tracks.has(key(q,r))) return removeTrack(q,r);
      if (structure && structure.type !== "base") return salvageStructure(structure);
      return fail("There is no Track, Turret, Mine, or Train to salvage here.");
    }
    if (train) { select("train", train.id); setMode("select"); return; }
    if (state.mode === "turret") return buildTurret(q,r);
    if (state.mode === "mine") return buildMine(q,r);
    if (state.mode === "deploy") return deployTrain(q,r);
    if (structure) return select(structure.type === "base" ? "base" : "structure", structure.id);
    if (hive) return select("hive",hive.id);
    if (state.tracks.has(key(q,r))) return select("track", key(q,r));
    if (ghost) return select("ghost",key(q,r));
    if (terrainAt(q,r).type==="resource") return select("node",key(q,r));
    state.selected = null; updateUI(true);
  }

  function canBaseAfford(cost){return state.baseMaterial>=cost.material&&state.baseEnergy>=cost.energy;}

  function trainFabricationDisabledReason(){
    if(state.nextTrainIndex>=26)return "Maximum of 26 Trains reached.";
    if(state.mode==="deploy")return "Finish or cancel the current Train placement first.";
    if(!canBaseAfford(COSTS.train))return `Base needs ${Math.max(0,COSTS.train.material-Math.floor(state.baseMaterial))} more Construction Material.`;
    return "";
  }

  function payBase(cost,item) {
    if (!canBaseAfford(cost)) { fail(`Needs ${cost.material} Construction Material${cost.energy?` and ${cost.energy} Energy`:""} for ${item}.`); return false; }
    state.baseMaterial -= cost.material; state.baseEnergy -= cost.energy; return true;
  }

  function trainStopped(train) { return !train.route.length && !train.stepFrom; }
  function locoNearBase(train) { return trainStopped(train) && hexDistance(train,state.base)<=1; }

  function fillWagonFromBase(train,wagon) {
    const type=wagon.role||wagon.type;
    if(!type)return 0;
    const available=type==="material"?state.baseMaterial:state.baseEnergy;
    const moved=Math.min(wagon.capacity-wagon.amount,available);
    if(moved<=0)return 0;
    wagon.type=type;wagon.amount+=moved;
    if(type==="material")state.baseMaterial-=moved;else state.baseEnergy-=moved;
    return moved;
  }

  function fillBaseCargo(train) {
    let moved=0;
    for(const wagon of train.wagons)moved+=fillWagonFromBase(train,wagon);
    return moved;
  }

  function refuelAtBase(train) {
    const moved=Math.min(train.maxFuel-train.fuel,state.baseEnergy);
    if(moved>0){train.fuel+=moved;state.baseEnergy-=moved;train.energyDepleted=false;}
    return moved;
  }

  function unloadCargoToBaseTarget(train,type){
    const stored=type==="material"?state.baseMaterial:state.baseEnergy;
    const moved=removeCargo(train,type,Math.min(Math.max(0,BASE_UNLOAD_TARGET-stored),totalCargo(train,type)));
    if(type==="material")state.baseMaterial+=moved;else state.baseEnergy+=moved;
    return moved;
  }

  function serviceBaseLogistics(train) {
    if(train.trainType==="combat"){
      refuelAtBase(train);fillBaseCargo(train);return;
    }
    const emptyOnArrival=new Set(train.wagons.filter(w=>w.amount<=.0001).map(w=>w.id));
    refuelAtBase(train);
    const material=unloadCargoToBaseTarget(train,"material");
    const energy=unloadCargoToBaseTarget(train,"energy");
    if(material+energy>0)showWorldActivity(state.base,`${trainActivityName(train)} Unloaded Resources to Base`,1.25);
    for(const wagon of train.wagons.filter(w=>emptyOnArrival.has(w.id)))fillWagonFromBase(train,wagon);
  }

  function nearestTrain(structure, range = 3) {
    return state.trains.filter(t => !t.route.length && !t.stepFrom && distanceToTrain(t,structure) <= range).sort((a,b) => distanceToTrain(a,structure)-distanceToTrain(b,structure))[0] || null;
  }

  function nearestStoppedLoco(target, range = 1, predicate=()=>true) {
    return state.trains.filter(train=>predicate(train)&&trainStopped(train)&&hexDistance(train,target)<=range).sort((a,b)=>hexDistance(a,target)-hexDistance(b,target))[0]||null;
  }

  function trainActivityName(train){return `Train ${trainScheduleCode(train)}:`;}

  function activityText(message){return message.replace(/^Train [A-Z]+:\s*/,"");}

  function activityColor(message){
    const activity=activityText(message);
    if(activity==="Loaded Turret with Energy")return "#60d5db";
    if(activity==="Mined Construction Material")return "#e6b94a";
    if(activity==="Mined Energy")return "#8aa6ff";
    if(activity.startsWith("Repaired "))return "#70bd77";
    if(activity.startsWith("Partially Repaired: "))return "#f0a65a";
    if(activity.startsWith("Rebuilt "))return "#d5a3ff";
    if(activity.startsWith("Unloaded "))return "#ff8b3d";
    return "#bafcff";
  }

  function showWorldActivity(target,message,duration=1.1,color=activityColor(message)) {
    state.worldMessages=state.worldMessages.filter(item=>item.until>state.elapsed);
    const targetKey=`${target.q},${target.r}`;
    const existing=state.worldMessages.find(item=>item.targetKey===targetKey&&item.message===message);
    if(existing){existing.until=Math.max(existing.until,state.elapsed+duration);existing.color=color;}
    else state.worldMessages.push({targetKey,q:target.q,r:target.r,targetType:target.type,message,color,until:state.elapsed+duration});
  }

  function showTrainEnergyWarning(train){
    if(!train.energyDepleted||train.fuel>.15||totalCargo(train,"energy")>0)return false;
    if(state.elapsed<(train.nextEnergyWarningAt??0))return false;
    showWorldActivity(train,"Train Out of Energy",1.35,"#e34747");
    train.nextEnergyWarningAt=state.elapsed+2.5;
    return true;
  }

  function updateTrainEnergyWarnings(){for(const train of state.trains)showTrainEnergyWarning(train);}

  function repairLabel(target) {
    if(target.type==="base")return "Base";
    if(target.type==="turret")return "Turret";
    if(target.type==="mine")return "Mine";
    return "Track";
  }

  function repairPriority(target){return state.tracks.get(key(target.q,target.r))===target?0:1;}

  function updateAutomaticRepair(train) {
    if(train.stepFrom||state.elapsed<(train.repairHoldUntil||0)||totalCargo(train,"material")<=0)return false;
    if(!train.route.length&&!train.scheduleComplete)return false;
    const nextTrackKey=train.route[0]?key(train.route[0].q,train.route[0].r):null;
    const targets=[state.base,...state.structures.values(),...state.tracks.values()]
      .filter(target=>target.hp<target.maxHp&&hexDistance(train,target)<=1)
      .sort((a,b)=>Number(key(b.q,b.r)===nextTrackKey&&repairPriority(b)===0)-Number(key(a.q,a.r)===nextTrackKey&&repairPriority(a)===0)||repairPriority(a)-repairPriority(b)||hexDistance(train,a)-hexDistance(train,b)||(a.hp/a.maxHp)-(b.hp/b.maxHp));
    const target=targets[0];
    if(!target)return false;
    const isTrack=state.tracks.get(key(target.q,target.r))===target;
    const missing=target.maxHp-target.hp,available=totalCargo(train,"material");
    const materialCost=isTrack?1:Math.min(missing,available);
    if(materialCost<=0)return false;
    removeCargo(train,"material",materialCost);target.hp=isTrack?target.maxHp:Math.min(target.maxHp,target.hp+materialCost);
    const fullyRepaired=target.hp>=target.maxHp-.0001,label=repairLabel(target);
    train.repairResumeStatus=train.status;train.repairHoldUntil=state.elapsed+REPAIR_PAUSE_SECONDS;train.status=`Repairing ${label}`;
    showWorldActivity(target,`${trainActivityName(train)} ${fullyRepaired?`Repaired ${label}`:`Partially Repaired: ${label}`}`,1.25);
    return true;
  }

  function updateAutomaticLogistics() {
    const cargoChangedTrains=new Set();
    updateAutomaticRebuild();
    for(const structure of state.structures.values()){
      if(structure.type!=="mine")continue;
      const train=nearestStoppedLoco(structure,1,candidate=>candidate.trainType!=="combat");
      if(!train)continue;
      const node=resourceNodeAt(structure.q,structure.r);
      const available=node?.amount||0;
      const fuelMoved=structure.resource==="energy"?Math.min(Math.max(0,train.maxFuel-train.fuel),available):0;
      if(fuelMoved>0){train.fuel+=fuelMoved;train.energyDepleted=false;}
      const extractable=Math.floor(Math.min(cargoSpace(train,structure.resource),Math.max(0,available-fuelMoved)));
      const moved=addCargo(train,structure.resource,extractable);
      if(fuelMoved+moved>0){
        cargoChangedTrains.add(train.id);
        setNodeAmount(node,node.amount-fuelMoved-moved);
        showWorldActivity(structure,`${trainActivityName(train)} Mined ${resourceLabel(structure.resource)}`,1.25);
      }
    }
    for(const structure of state.structures.values()){
      if(structure.type!=="turret")continue;
      const train=nearestStoppedLoco(structure,1,candidate=>candidate.trainType!=="combat");
      if(!train)continue;
      const energyRoom=Math.max(0,structure.maxEnergy-structure.energy);
      const moved=removeCargo(train,"energy",Math.min(energyRoom,totalCargo(train,"energy")));
      structure.energy+=moved;
      if(moved>0){cargoChangedTrains.add(train.id);showWorldActivity(structure,`${trainActivityName(train)} Loaded Turret with Energy`);}
    }
    for(const train of state.trains){
      const nearBase=locoNearBase(train);
      const combatNeedsService=train.trainType==="combat"&&(train.fuel<train.maxFuel||cargoSpace(train,"energy")>0);
      if(nearBase&&(!train.wasNearBase||cargoChangedTrains.has(train.id)||combatNeedsService))serviceBaseLogistics(train);
      train.wasNearBase=nearBase;
    }
  }

  function handleAction(action, element) {
    element?.blur();
    const selected=getSelected();
    if(action==="fabricate-place-builder-train"||action==="fabricate-place-combat-train"){
      if(state.nextTrainIndex>=26)return fail("No more than 26 trains can be built.");
      const trainType=action==="fabricate-place-combat-train"?"combat":"builder";
      if(payBase(COSTS.train,trainType==="combat"?"Combat Train":"Build and Mine Train")){state.deploymentPaid=true;state.deploymentTrainType=trainType;sounds.place();setMode("deploy");toast("Click an empty Track hex for the Train Head, then click a highlighted Tail point.","info");}
    }
    if(action==="add-schedule"&&selected?.wagons){
      if(!trainStopped(selected))return fail("Clear the current schedule and wait for the train to stop first.");
      if(selected.schedule?.length)return fail("Use Clear Schedule before creating a new schedule.");
      selected.schedule=[];selected.scheduleComplete=false;selected.scheduleTargetIndex=0;selected.servicingStop=false;selected.stopHoldUntil=0;
      state.scheduleTrainId=selected.id;state.mode="schedule";canvas.style.cursor="crosshair";
      document.querySelectorAll("[data-mode]").forEach(button=>button.classList.remove("active"));
    }
    if(action==="clear-schedule"&&selected?.wagons)clearTrainSchedule(selected);
    updateUI(true);
  }

  function updateTrains(dt) {
    for (const train of state.trains) {
      if(state.elapsed<(train.repairHoldUntil||0))continue;
      if(train.repairHoldUntil){train.repairHoldUntil=0;train.status=train.repairResumeStatus||(train.route.length?"En route":"Idle");train.repairResumeStatus=null;}
      if(!train.stepFrom&&updateAutomaticRepair(train))continue;
      if (!train.route.length) continue;
      if (!train.stepFrom && train.fuel <= .15) {
        const pulled = removeCargo(train,"energy",1);
        if (pulled > 0) {train.fuel += pulled;train.energyDepleted=false;}
        else {
          train.route = []; train.routePurpose=null; train.stepFrom = null; train.stepTo = null; train.status = "Stuck — no Energy";
          train.energyDepleted=true;showTrainEnergyWarning(train);
          continue;
        }
      }
      if (!train.stepFrom && !prepareTrainStep(train)) continue;
      train.progress += dt * train.speed;
      const t = Math.min(1,train.progress);
      const segments = trainSegments(train);
      segments.forEach((segment,index) => {
        const from = axialToWorld(train.stepFrom[index].q,train.stepFrom[index].r);
        const to = axialToWorld(train.stepTo[index].q,train.stepTo[index].r);
        segment.x = lerp(from.x,to.x,t); segment.y = lerp(from.y,to.y,t);
        segment.heading = Math.atan2(to.y-from.y,to.x-from.x);
      });
      train.wheelClock += dt;
      if (train.progress >= 1) {
        train.forwardDirection = { q:train.stepTo[0].q-train.stepFrom[0].q, r:train.stepTo[0].r-train.stepFrom[0].r };
        segments.forEach((segment,index) => {
          segment.q = train.stepTo[index].q; segment.r = train.stepTo[index].r;
          const p = axialToWorld(segment.q,segment.r); segment.x = p.x; segment.y = p.y;
        });
        train.route.shift(); train.progress = 0; train.fuel = Math.max(0,train.fuel - .18);
        train.stepFrom = null; train.stepTo = null;
        if (!train.route.length) {
          const completedPurpose=train.routePurpose;train.routePurpose=null;
          if(completedPurpose==="repair"){
            train.status="Waiting to rebuild Track";train.scheduleRetryAt=state.elapsed;
          }else if(train.scheduleComplete){
            const reached=train.scheduleTargetIndex;
            train.servicingStop=true;train.stopHoldUntil=state.elapsed+1;train.scheduleTargetIndex=(reached+1)%train.schedule.length;train.status=`At Stop ${trainScheduleCode(train)}${reached+1}`;
          }else train.status="Idle";
        }
      }
    }
  }

  function prepareTrainStep(train) {
    const segments = trainSegments(train);
    const from = segments.map(segment => ({ q:segment.q, r:segment.r }));
    const nextHead = train.route[0];
    const direction = { q:nextHead.q-train.q, r:nextHead.r-train.r };
    const forward = train.wagons.length
      ? { q:train.q-train.wagons[0].q, r:train.r-train.wagons[0].r }
      : train.forwardDirection;
    if (forward && direction.q === -forward.q && direction.r === -forward.r) {
      train.route=[]; train.status="Stuck — no reverse travel";
      fail(`${train.name} cannot reverse. Build a track loop to turn around.`); return false;
    }
    const to = [nextHead, ...from.slice(0,-1)];
    if(to.some(position=>state.deploymentReserved.has(key(position.q,position.r)))){
      train.status="Waiting — Track Reserved For Deployment";
      return false;
    }
    if (new Set(to.map(position=>key(position.q,position.r))).size !== to.length) {
      train.route=[]; train.status="Stuck — train blocks itself";
      fail(`${train.name} cannot enter a hex occupied by its own wagons.`); return false;
    }
    const occupiedBefore=new Set(from.map(position=>key(position.q,position.r)));
    for (const position of to) {
      if (!isRailHex(position.q,position.r)) {
        if(trackGhostAt(position.q,position.r)&&occupiedBefore.has(key(position.q,position.r)))continue;
        train.route=[];train.routePurpose=null;
        if(trackGhostAt(position.q,position.r)){train.status="Waiting to rebuild Track";train.scheduleRetryAt=state.elapsed+.1;return false;}
        train.status="Stuck — train is too long";
        fail(`${train.name} cannot move that way: every wagon needs track.`); return false;
      }
    }
    train.stepFrom=from; train.stepTo=to; train.progress=0;
    train.status="En route";
    return true;
  }

  function hiveReplicationRoll(hive,spawnNumber=hive.spawnCount,rate=hive.level||2){
    return hash(hive.q,hive.r,(state.mapSeed+spawnNumber*7919)|0)<1/rate;
  }

  function hiveSpawnCandidates(hive,spawnNumber=hive.spawnCount){
    const candidates=[];
    for(let dq=-4;dq<=4;dq++){
      const r0=Math.max(-4,-dq-4),r1=Math.min(4,-dq+4);
      for(let dr=r0;dr<=r1;dr++){
        const distance=hexDistance({q:0,r:0},{q:dq,r:dr});
        if(distance<2||distance>4)continue;
        const q=hive.q+dq,r=hive.r+dr;
        candidates.push({q,r,score:hash(q,r,(state.mapSeed+spawnNumber*3571)|0)});
      }
    }
    return candidates.sort((a,b)=>b.score-a.score);
  }

  function spawnHiveNear(hive,spawnNumber=hive.spawnCount,level=hiveExpansionLevel(hive,state.elapsed)){
    const location=hiveSpawnCandidates(hive,spawnNumber).find(candidate=>hiveHexOpen(candidate.q,candidate.r));
    return location?createHive(location.q,location.r,level,true):null;
  }

  function spawnEnemyFromHive(hive,spawnNumber=hive.spawnCount){
    const claimed=enemyClaimedHexes();
    const options=[];
    for(let dq=-4;dq<=4;dq++){
      const r0=Math.max(-4,-dq-4),r1=Math.min(4,-dq+4);
      for(let dr=r0;dr<=r1;dr++){
        const distance=hexDistance({q:0,r:0},{q:dq,r:dr});
        if(distance<1||distance>4)continue;
        const position={q:hive.q+dq,r:hive.r+dr};
        if(isPassable(position.q,position.r)&&!hiveAt(position.q,position.r)&&!structureAt(position.q,position.r)&&!claimed.has(key(position.q,position.r)))options.push(position);
      }
    }
    options.sort((a,b)=>hash(b.q,b.r,(state.mapSeed+spawnNumber)|0)-hash(a.q,a.r,(state.mapSeed+spawnNumber)|0));
    const location=options[0];if(!location)return null;
    const p=axialToWorld(location.q,location.r);
    const enemy={id:`enemy-${state.nextId++}`,q:location.q,r:location.r,x:p.x,y:p.y,fromQ:location.q,fromR:location.r,toQ:location.q,toR:location.r,progress:1,speed:ENEMY_SPEED,attackClock:0,nextPathAt:0,phase:hash(location.q,location.r,spawnNumber)*Math.PI*2};
    state.enemies.push(enemy);return enemy;
  }

  function updateHives(){
    for(const hive of [...state.hives.values()]){
      for(let cycles=0;state.elapsed>=hive.nextSpawnAt&&cycles<32;cycles++){
        const spawnTime=hive.nextSpawnAt;
        const spawnNumber=hive.spawnCount++;
        const rate=hive.level;
        const forceCreepBatch=hive.forceFirstCreepBatch&&spawnNumber===0;
        if(forceCreepBatch)hive.forceFirstCreepBatch=false;
        if(forceCreepBatch||!hiveReplicationRoll(hive,spawnNumber,rate)||!spawnHiveNear(hive,spawnNumber,hiveExpansionLevel(hive,spawnTime))){
          for(let creep=0;creep<rate;creep++)spawnEnemyFromHive(hive,spawnNumber*32+creep);
        }
        hive.nextSpawnAt=(Math.floor(spawnTime/60)+1)*60;
      }
    }
  }

  function targetHexFor(enemy,target) {
    if (!target.wagons) return target;
    return trainSegments(target).slice().sort((a,b)=>hexDistance(enemy,a)-hexDistance(enemy,b))[0];
  }

  function enemyClaimedHexes(excludeId=null){
    const claimed=new Set();
    for(const enemy of state.enemies){
      if(enemy.id===excludeId)continue;
      claimed.add(key(enemy.q,enemy.r));
      if(enemy.progress<1)claimed.add(key(enemy.toQ,enemy.toR));
    }
    return claimed;
  }

  function invalidateEnemyNavigation(){enemyNavigationVersion++;}

  function resetEnemyNavigation(){
    enemyNavigationVersion++;
    enemyNavigationCache={signature:"",distances:new Map(),targetKeys:new Set(),bounds:null,builds:0};
  }

  function enemyNavigationSignature(){return `${enemyNavigationVersion}|${state.base.q},${state.base.r}|${state.structures.size}|${state.tracks.size}`;}

  function rebuildEnemyNavigation(){
    const targets=[state.base,...state.structures.values(),...state.tracks.values()],targetKeys=new Set(targets.map(target=>key(target.q,target.r)));
    const points=[...targets,...state.enemies];
    if(!points.length){enemyNavigationCache={signature:enemyNavigationSignature(),distances:new Map(),targetKeys,bounds:null,builds:enemyNavigationCache.builds+1};return enemyNavigationCache;}
    let baseMinQ=Infinity,baseMaxQ=-Infinity,baseMinR=Infinity,baseMaxR=-Infinity;
    for(const point of points){baseMinQ=Math.min(baseMinQ,point.q);baseMaxQ=Math.max(baseMaxQ,point.q);baseMinR=Math.min(baseMinR,point.r);baseMaxR=Math.max(baseMaxR,point.r);}
    let distances=new Map(),bounds=null;
    for(const margin of [8,24,64]){
      bounds={minQ:baseMinQ-margin,maxQ:baseMaxQ+margin,minR:baseMinR-margin,maxR:baseMaxR+margin};
      const inBounds=(q,r)=>q>=bounds.minQ&&q<=bounds.maxQ&&r>=bounds.minR&&r<=bounds.maxR;
      const passable=(q,r)=>inBounds(q,r)&&isPassable(q,r)&&!targetKeys.has(key(q,r));
      distances=new Map();const queue=[];
      for(const target of targets)for(const position of neighbors(target.q,target.r)){
        const positionKey=key(position.q,position.r);
        if(!passable(position.q,position.r)||distances.has(positionKey))continue;
        distances.set(positionKey,0);queue.push(position);
      }
      for(let cursor=0;cursor<queue.length;cursor++){
        const current=queue[cursor],nextDistance=distances.get(key(current.q,current.r))+1;
        for(const next of neighbors(current.q,current.r)){
          const nextKey=key(next.q,next.r);
          if(distances.has(nextKey)||!passable(next.q,next.r))continue;
          distances.set(nextKey,nextDistance);queue.push(next);
        }
      }
      if(state.enemies.every(enemy=>distances.has(key(enemy.q,enemy.r))||targetKeys.has(key(enemy.q,enemy.r))))break;
    }
    enemyNavigationCache={signature:enemyNavigationSignature(),distances,targetKeys,bounds,builds:enemyNavigationCache.builds+1};
    return enemyNavigationCache;
  }

  function ensureEnemyNavigation(){
    if(state.gameOver)return enemyNavigationCache;
    const signature=enemyNavigationSignature();
    const bounds=enemyNavigationCache.bounds;
    const outsideBounds=state.enemies.some(enemy=>!bounds||enemy.q<bounds.minQ||enemy.q>bounds.maxQ||enemy.r<bounds.minR||enemy.r>bounds.maxR);
    return signature!==enemyNavigationCache.signature||outsideBounds?rebuildEnemyNavigation():enemyNavigationCache;
  }

  function nextEnemyNavigationStep(enemy,claimed){
    const navigation=enemyNavigationCache,currentDistance=navigation.distances.get(key(enemy.q,enemy.r));
    if(currentDistance===undefined)return null;
    const enemyNumber=Number(enemy.id.replace(/\D/g,""))||0;
    const options=neighbors(enemy.q,enemy.r).filter(position=>{
      const positionKey=key(position.q,position.r);
      return !claimed.has(positionKey)&&!navigation.targetKeys.has(positionKey)&&navigation.distances.has(positionKey);
    }).map(position=>({...position,distance:navigation.distances.get(key(position.q,position.r)),score:hash(position.q,position.r,(state.mapSeed+enemyNumber*7919)|0)}));
    options.sort((a,b)=>a.distance-b.distance||a.score-b.score);
    const forward=options.find(option=>option.distance<currentDistance);
    if(forward)return forward;
    const notBacktracking=option=>option.q!==enemy.previousQ||option.r!==enemy.previousR;
    return options.find(option=>option.distance===currentDistance&&notBacktracking(option))||options.find(option=>option.distance===currentDistance+1&&notBacktracking(option))||null;
  }

  function adjacentEnemyTarget(enemy){
    if(hexDistance(enemy,state.base)<=1)return state.base;
    const positions=[{q:enemy.q,r:enemy.r},...neighbors(enemy.q,enemy.r)];
    for(const position of positions){const structure=state.structures.get(key(position.q,position.r));if(structure)return structure;}
    for(const train of state.trains){const segment=targetHexFor(enemy,train);if(segment&&hexDistance(enemy,segment)<=1)return segment;}
    for(const position of positions){const track=state.tracks.get(key(position.q,position.r));if(track)return track;}
    return null;
  }

  function enemyNavigationStats(){return {builds:enemyNavigationCache.builds,cells:enemyNavigationCache.distances.size};}

  function findEnemyStep(start,goal,passable=isPassable,stopRange=0){
    const startKey=key(start.q,start.r),goalKey=key(goal.q,goal.r);
    if(hexDistance(start,goal)<=stopRange)return null;
    const distance=hexDistance(start,goal);
    const maxNodes=Math.min(60000,Math.max(20000,Math.ceil((distance+40)*(distance+40)*12)));
    const open=[],cameFrom=new Map(),gScore=new Map([[startKey,0]]),closed=new Set();
    let order=0;
    const compare=(a,b)=>a.f-b.f||a.h-b.h||a.order-b.order;
    const push=node=>{open.push(node);let index=open.length-1;while(index>0){const parent=(index-1)>>1;if(compare(open[parent],node)<=0)break;open[index]=open[parent];index=parent;}open[index]=node;};
    const pop=()=>{const root=open[0],tail=open.pop();if(open.length&&tail){let index=0;while(true){const left=index*2+1,right=left+1;if(left>=open.length)break;let child=right<open.length&&compare(open[right],open[left])<0?right:left;if(compare(open[child],tail)>=0)break;open[index]=open[child];index=child;}open[index]=tail;}return root;};
    push({q:start.q,r:start.r,g:0,h:distance,f:distance,order:order++});
    for(let explored=0;open.length&&explored<maxNodes;){
      const current=pop(),currentKey=key(current.q,current.r);
      if(closed.has(currentKey))continue;
      closed.add(currentKey);explored++;
      if(currentKey===goalKey||hexDistance(current,goal)<=stopRange){
        let stepKey=currentKey,parentKey=cameFrom.get(stepKey);
        while(parentKey&&parentKey!==startKey){stepKey=parentKey;parentKey=cameFrom.get(stepKey);}
        return parentKey===startKey?fromKey(stepKey):null;
      }
      for(const next of neighbors(current.q,current.r)){
        const nextKey=key(next.q,next.r);
        if(closed.has(nextKey)||(!passable(next.q,next.r)&&nextKey!==goalKey))continue;
        const tentative=current.g+1;
        if(tentative>=(gScore.get(nextKey)??Infinity))continue;
        cameFrom.set(nextKey,currentKey);gScore.set(nextKey,tentative);
        const h=hexDistance(next,goal);push({q:next.q,r:next.r,g:tentative,h,f:tentative+h,order:order++});
      }
    }
    return null;
  }

  function leaveGhost(target,objectType){
    const ghost={id:key(target.q,target.r),type:"ghost",objectType,q:target.q,r:target.r};
    if(objectType==="track"){
      ghost.links=[...target.links];
      for(const neighborGhost of state.ghosts.values())if(neighborGhost.objectType==="track"&&(neighborGhost.links||[]).includes(ghost.id)&&!ghost.links.includes(neighborGhost.id))ghost.links.push(neighborGhost.id);
    }
    if(objectType==="mine")ghost.resource=target.resource;
    state.ghosts.set(ghost.id,ghost);
    return ghost;
  }

  function rebuiltLabel(ghost){
    if(ghost.objectType==="track")return "Track";
    if(ghost.objectType==="turret")return "Turret";
    return `${resourceLabel(ghost.resource)} Mine`;
  }

  function rebuildGhost(ghost,train){
    const cost=REBUILD_COSTS[ghost.objectType];
    if(totalCargo(train,"material")<cost)return false;
    removeCargo(train,"material",cost);
    let rebuilt;
    if(ghost.objectType==="track"){
      rebuilt={q:ghost.q,r:ghost.r,hp:TRACK_HIT_POINTS,maxHp:TRACK_HIT_POINTS,links:new Set()};
      state.tracks.set(ghost.id,rebuilt);
      for(const linkedKey of ghost.links||[]){
        const neighbor=state.tracks.get(linkedKey);
        if(neighbor){rebuilt.links.add(linkedKey);neighbor.links.add(ghost.id);}else{const neighborGhost=state.ghosts.get(linkedKey);if(neighborGhost?.objectType==="track"&&!neighborGhost.links.includes(ghost.id))neighborGhost.links.push(ghost.id);}
      }
    }else if(ghost.objectType==="turret"){
      rebuilt={id:`turret-${state.nextId++}`,type:"turret",q:ghost.q,r:ghost.r,hp:18,maxHp:18,energy:0,maxEnergy:20,cooldown:0,showRangeUntil:state.elapsed+3.5};
      state.structures.set(ghost.id,rebuilt);
    }else{
      rebuilt={id:`mine-${state.nextId++}`,type:"mine",resource:ghost.resource,q:ghost.q,r:ghost.r,hp:22,maxHp:22};
      state.structures.set(ghost.id,rebuilt);
    }
    invalidateEnemyNavigation();
    state.ghosts.delete(ghost.id);
    if(state.selected?.type==="ghost"&&state.selected.id===ghost.id)state.selected=ghost.objectType==="track"?{type:"track",id:ghost.id}:{type:"structure",id:rebuilt.id};
    sounds.place();burst(ghost.q,ghost.r,ghost.objectType==="turret"?"#65dbe0":"#d9bd78",8);
    showWorldActivity(rebuilt,`${trainActivityName(train)} Rebuilt ${rebuiltLabel(ghost)}`,1.4);
    return true;
  }

  function updateAutomaticRebuild(){
    const ghosts=[...state.ghosts.values()].sort((a,b)=>(a.objectType==="track"?0:1)-(b.objectType==="track"?0:1));
    for(const ghost of ghosts){
      const train=nearestStoppedLoco(ghost,1,candidate=>totalCargo(candidate,"material")>=REBUILD_COSTS[ghost.objectType]);
      if(train)rebuildGhost(ghost,train);
    }
  }

  function showDefeatScreen(){
    state.paused=true;state.finalMapView=false;simulationAccumulator=0;resetEnemyNavigation();state.projectiles=[];
    ui.survivalTime.textContent=formatSurvivalTime(state.elapsed);
    ui.defeatHivesNeutralized.textContent=state.hivesNeutralized;
    ui.defeatCreepsNeutralized.textContent=state.creepsNeutralized;
    ui.defeatTracksLaid.textContent=state.stats.tracksLaid;
    ui.defeatMinesBuilt.textContent=state.stats.minesBuilt;
    ui.defeatTurretsBuilt.textContent=state.stats.turretsBuilt;
    ui.defeatTrainsBuilt.textContent=state.stats.trainsBuilt;
    ui.viewFinalStats.hidden=true;ui.viewFinalStats.classList.add("d-none");
    ui.gameOver.hidden=false;ui.gameOver.classList.remove("d-none");updateUI(true);
  }

  function showFinalMap(){
    if(!state.gameOver)return;
    state.finalMapView=true;ui.gameOver.hidden=true;ui.gameOver.classList.add("d-none");ui.viewFinalStats.hidden=false;ui.viewFinalStats.classList.remove("d-none");render();
  }

  function showFinalStats(){
    if(!state.gameOver)return;
    state.finalMapView=false;ui.viewFinalStats.hidden=true;ui.viewFinalStats.classList.add("d-none");ui.gameOver.hidden=false;ui.gameOver.classList.remove("d-none");
  }

  function damageTarget(target, amount) {
    target.hp -= amount;
    sounds.hit();
    if (target.hp > 0) return;
    if(target.type==="hive"){
      state.hives.delete(key(target.q,target.r));
      state.hivesNeutralized++;
      if(state.selected?.type==="hive"&&state.selected.id===target.id)state.selected=null;
      burst(target.q,target.r,"#d94a4a",16);updateUI(true);return;
    }
    if(target.kind==="wagon"){
      const train=state.trains.find(candidate=>candidate.wagons.includes(target));
      if(train){
        const index=train.wagons.indexOf(target),lost=train.wagons.length-index;
        train.wagons.splice(index);
        toast(`${train.name} lost ${lost} ${lost===1?"Wagon":"Wagons"}.`,"danger");
      }
      burst(target.q,target.r,"#d94a4a",12);updateUI(true);return;
    }
    if (target.type === "base") {
      target.hp = 0; state.gameOver = true; showDefeatScreen();
      return;
    }
    if (target.wagons) {
      state.trains = state.trains.filter(t => t.id !== target.id);
      if (state.selected?.id === target.id) state.selected = null;
      if(state.scheduleTrainId===target.id){state.scheduleTrainId=null;state.mode="select";canvas.style.cursor="default";document.querySelectorAll("[data-mode]").forEach(button=>button.classList.toggle("active",button.dataset.mode==="select"));}
      toast(`${target.name} was consumed.`, "danger");
    } else if (target.type === "turret" || target.type === "mine") {
      leaveGhost(target,target.type);
      state.structures.delete(key(target.q,target.r));
      invalidateEnemyNavigation();
      if (state.selected?.id === target.id) state.selected = null;
      toast(`${capitalize(target.type)} destroyed.`, "danger");
    } else {
      leaveGhost(target,"track");
      deleteTrack(target.q,target.r);
      if (state.selected?.type === "track" && state.selected.id === key(target.q,target.r)) state.selected = null;
    }
    burst(target.q,target.r,"#d94a4a",12); updateUI(true);
  }

  function updateEnemies(dt) {
    if(state.gameOver||!state.enemies.length)return;
    ensureEnemyNavigation();
    const claimed=enemyClaimedHexes();
    for (const enemy of state.enemies) {
      if(state.gameOver)break;
      enemy.phase += dt*2.2;
      const target=enemy.progress>=1?adjacentEnemyTarget(enemy):null;
      if (target) {
        enemy.attackClock += dt;
        enemy.attackFlashClock=(enemy.attackFlashClock??.3)+dt;
        if(enemy.attackFlashClock>=.3){
          enemy.attackFlashClock%=.3;
          const targetPoint=axialToWorld(target.q,target.r);
          state.projectiles.push({x1:enemy.x,y1:enemy.y,x2:targetPoint.x,y2:targetPoint.y,life:.09,maxLife:.09,color:"#ff3348",width:1.7,impactColor:"#ff8790"});
        }
        damageTarget(target,dt*2.1);
        continue;
      }
      if (enemy.progress >= 1 && state.elapsed >= (enemy.nextPathAt||0)) {
        const currentKey=key(enemy.q,enemy.r);claimed.delete(currentKey);
        const next=nextEnemyNavigationStep(enemy,claimed);
        claimed.add(currentKey);
        if (next) {
          enemy.previousQ=enemy.q;enemy.previousR=enemy.r;
          enemy.fromQ=enemy.q; enemy.fromR=enemy.r; enemy.toQ=next.q; enemy.toR=next.r; enemy.progress=0;enemy.nextPathAt=0;
          claimed.add(key(next.q,next.r));
        }else enemy.nextPathAt=state.elapsed+.25;
      }
      if (enemy.progress < 1) {
        enemy.progress = Math.min(1,enemy.progress + dt*enemy.speed);
        const a=axialToWorld(enemy.fromQ,enemy.fromR), b=axialToWorld(enemy.toQ,enemy.toR);
        const eased=enemy.progress*enemy.progress*(3-2*enemy.progress);
        enemy.x=lerp(a.x,b.x,eased); enemy.y=lerp(a.y,b.y,eased);
        if (enemy.progress>=1) { enemy.q=enemy.toQ; enemy.r=enemy.toR; }
      }
    }
  }

  function updateCombatTrains(dt){
    for(const train of state.trains){
      if(train.trainType!=="combat")continue;
      train.combatCooldown=(train.combatCooldown||0)-dt;
      if(train.combatCooldown>0||totalCargo(train,"energy")<1)continue;
      const center=worldToAxial(train.x,train.y);
      const hive=[...state.hives.values()].filter(candidate=>hexDistance(center,candidate)<=COMBAT_TRAIN_RANGE).sort((a,b)=>hexDistance(center,a)-hexDistance(center,b))[0];
      const enemy=!hive?state.enemies.filter(candidate=>hexDistance(center,worldToAxial(candidate.x,candidate.y))<=COMBAT_TRAIN_RANGE).sort((a,b)=>hexDistance(center,a)-hexDistance(center,b))[0]:null;
      if(!hive&&!enemy)continue;
      const targetPoint=hive?axialToWorld(hive.q,hive.r):{x:enemy.x,y:enemy.y};
      removeCargo(train,"energy",1);train.combatCooldown=.48;train.gunAngle=Math.atan2(targetPoint.y-train.y,targetPoint.x-train.x);
      state.projectiles.push({x1:train.x,y1:train.y,x2:targetPoint.x,y2:targetPoint.y,life:.12,maxLife:.12});
      if(hive)damageTarget(hive,1);
      else {state.enemies=state.enemies.filter(candidate=>candidate.id!==enemy.id);state.creepsNeutralized++;burst(enemy.q,enemy.r,"#e35050",7);}
      sounds.shot();
    }
  }

  function updateStructures(dt) {
    for (const structure of state.structures.values()) {
      if (structure.type === "turret") {
        structure.cooldown -= dt;
        if (structure.energy >= 1 && structure.cooldown <= 0) {
          const hive=[...state.hives.values()].filter(candidate=>hexDistance(structure,candidate)<=4).sort((a,b)=>hexDistance(structure,a)-hexDistance(structure,b))[0];
          const enemy=!hive?state.enemies.filter(e => hexDistance(structure,worldToAxial(e.x,e.y)) <= 4).sort((a,b)=>hexDistance(structure,a)-hexDistance(structure,b))[0]:null;
          if(hive){
            const from=axialToWorld(structure.q,structure.r),to=axialToWorld(hive.q,hive.r);
            state.projectiles.push({x1:from.x,y1:from.y,x2:to.x,y2:to.y,life:.12,maxLife:.12});
            structure.energy--;structure.cooldown=.48;damageTarget(hive,1);sounds.shot();
          }else if (enemy) {
            const from=axialToWorld(structure.q,structure.r);
            state.projectiles.push({x1:from.x,y1:from.y,x2:enemy.x,y2:enemy.y,life:.12,maxLife:.12});
            structure.energy--; structure.cooldown=.48;
            state.enemies=state.enemies.filter(e=>e.id!==enemy.id);
            state.creepsNeutralized++;
            burst(enemy.q,enemy.r,"#e35050",7); sounds.shot();
          }
        }
      }
    }
    state.projectiles.forEach(p=>p.life-=dt);
    state.projectiles=state.projectiles.filter(p=>p.life>0);
    state.particles.forEach(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.95;p.vy*=.95;});
    state.particles=state.particles.filter(p=>p.life>0);
  }

  function burst(q,r,color,count) {
    const p=axialToWorld(q,r);
    for(let i=0;i<count;i++) { const a=hash(q+i,r,count)*Math.PI*2,s=10+hash(r-i,q,count)*30; state.particles.push({x:p.x,y:p.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.45+hash(i,q,r)*.35,maxLife:.8,color}); }
  }

  function update(dt) {
    if(state.gameOver||state.paused||remindersOpen)return;
    state.elapsed+=dt;
    state.worldMessages=state.worldMessages.filter(item=>item.until>state.elapsed);
    updateTrains(dt);updateAutomaticLogistics(dt);updateTrainEnergyWarnings();updateTrainSchedules();updateHives(dt);updateEnemies(dt);if(state.gameOver)return;updateCombatTrains(dt);updateStructures(dt);
    state.uiClock-=dt;if(state.uiClock<=0){state.uiClock=.15;updateUI();}
  }

  function advanceSimulation(seconds){
    if(state.gameOver||state.paused||remindersOpen){simulationAccumulator=0;return 0;}
    simulationAccumulator+=Math.max(0,seconds);
    let ticks=0;
    while(simulationAccumulator+1e-9>=SIMULATION_STEP&&!state.gameOver){update(SIMULATION_STEP);simulationAccumulator-=SIMULATION_STEP;ticks++;}
    if(simulationAccumulator<0)simulationAccumulator=0;
    return ticks;
  }

  function resetPerformanceMetrics(now=performance.now()){
    performanceWindowStart=now;performanceTicks=0;performanceFrames=0;
  }

  function recordPerformance(now,ticks,rendered){
    performanceTicks+=ticks;if(rendered)performanceFrames++;
    const elapsed=now-performanceWindowStart;
    if(elapsed<1000)return;
    ui.tpsValue.textContent=Math.round(performanceTicks*1000/elapsed);
    ui.fpsValue.textContent=Math.round(performanceFrames*1000/elapsed);
    resetPerformanceMetrics(now);
  }

  function hexPathOn(context,q,r,scale=.94){
    const p=axialToWorld(q,r),radius=HEX*scale;context.beginPath();
    HEX_CORNERS.forEach((corner,index)=>{const x=p.x+radius*corner.x,y=p.y+radius*corner.y;if(index===0)context.moveTo(x,y);else context.lineTo(x,y);});context.closePath();
  }

  function hexPath(q,r,scale=.94){hexPathOn(ctx,q,r,scale);}

  function visibleBounds(){
    const z=state.camera.zoom,halfWidth=width/(2*z),halfHeight=height/(2*z),padding=3;
    const corners=[[-halfWidth,-halfHeight],[halfWidth,-halfHeight],[-halfWidth,halfHeight],[halfWidth,halfHeight]].map(([dx,dy])=>{
      const x=state.camera.x+dx,y=state.camera.y+dy;
      return {q:(SQRT3/3*x-y/3)/HEX,r:(2/3*y)/HEX};
    });
    return {q0:Math.floor(Math.min(...corners.map(point=>point.q)))-padding,q1:Math.ceil(Math.max(...corners.map(point=>point.q)))+padding,r0:Math.floor(Math.min(...corners.map(point=>point.r)))-padding,r1:Math.ceil(Math.max(...corners.map(point=>point.r)))+padding};
  }

  function drawTerrainBase(context){
    const b=visibleBounds();
    const resources=[];let cells=0;
    for(let r=b.r0;r<=b.r1;r++)for(let q=b.q0;q<=b.q1;q++){
      cells++;
      const terrain=terrainAt(q,r), shade=terrainHash(q,r,2);
      hexPathOn(context,q,r,.975);
      if(terrain.type==="water")context.fillStyle=shade>.5?"#102b35":"#0e2630";
      else if(terrain.type==="rock")context.fillStyle=shade>.5?"#252d31":"#20282c";
      else if(terrain.type==="trees")context.fillStyle=shade>.5?"#1d2922":"#19231e";
      else context.fillStyle=shade>.5?"#232527":"#1d1f21";
      context.fill();context.strokeStyle="rgba(132,136,139,.13)";context.lineWidth=.7;context.stroke();
      const p=axialToWorld(q,r);
      if(terrain.type==="water"){
        context.strokeStyle="rgba(83,174,198,.34)";context.lineWidth=1.2;
        for(const offset of [-6,4]){context.beginPath();context.moveTo(p.x-15,p.y+offset);context.bezierCurveTo(p.x-10,p.y+offset-4,p.x-5,p.y+offset+4,p.x,p.y+offset);context.bezierCurveTo(p.x+5,p.y+offset-4,p.x+10,p.y+offset+4,p.x+15,p.y+offset);context.stroke();}
      }else if(terrain.type==="rock"){
        context.fillStyle="#41484b";context.beginPath();context.moveTo(p.x-21,p.y+13);context.lineTo(p.x-10,p.y-13);context.lineTo(p.x-2,p.y-3);context.lineTo(p.x+6,p.y-16);context.lineTo(p.x+21,p.y+13);context.closePath();context.fill();
        context.fillStyle="#596267";context.beginPath();context.moveTo(p.x-10,p.y-13);context.lineTo(p.x-2,p.y-3);context.lineTo(p.x-13,p.y+5);context.closePath();context.fill();context.beginPath();context.moveTo(p.x+6,p.y-16);context.lineTo(p.x+13,p.y+2);context.lineTo(p.x+1,p.y-7);context.closePath();context.fill();
      }else if(terrain.type==="trees"){
        for(const [ox,oy,scale] of [[-10,7,.78],[8,8,.88],[0,-5,.94]]){context.fillStyle="#4b3827";context.fillRect(p.x+ox-1.5*scale,p.y+oy,3*scale,8*scale);context.fillStyle=shade>.5?"#3f8154":"#356f49";context.beginPath();context.moveTo(p.x+ox,p.y+oy-15*scale);context.lineTo(p.x+ox-9*scale,p.y+oy+5*scale);context.lineTo(p.x+ox+9*scale,p.y+oy+5*scale);context.closePath();context.fill();context.fillStyle="#285c3c";context.beginPath();context.moveTo(p.x+ox,p.y+oy-9*scale);context.lineTo(p.x+ox-7*scale,p.y+oy+8*scale);context.lineTo(p.x+ox+7*scale,p.y+oy+8*scale);context.closePath();context.fill();}
      }else if(terrain.type==="resource")resources.push({q,r,p,type:terrain.resource});
    }
    return {resources,cells};
  }

  function currentTerrainLayerSignature(){return `${state.mapSeed}|${terrainRevision}|${width}|${height}|${dpr}|${state.camera.x}|${state.camera.y}|${state.camera.zoom}`;}

  function ensureTerrainLayer(){
    const signature=currentTerrainLayerSignature();if(signature===terrainLayerSignature)return;
    const pixelWidth=Math.max(1,Math.floor(width*dpr)),pixelHeight=Math.max(1,Math.floor(height*dpr));
    if(terrainLayer.width!==pixelWidth)terrainLayer.width=pixelWidth;if(terrainLayer.height!==pixelHeight)terrainLayer.height=pixelHeight;
    terrainCtx.setTransform(dpr,0,0,dpr,0,0);terrainCtx.clearRect(0,0,width,height);terrainCtx.save();terrainCtx.translate(width/2,height/2);terrainCtx.scale(state.camera.zoom,state.camera.zoom);terrainCtx.translate(-state.camera.x,-state.camera.y);
    const result=drawTerrainBase(terrainCtx);terrainCtx.restore();terrainLayerResources=result.resources;terrainLayerCells=result.cells;terrainLayerBuilds++;terrainLayerSignature=signature;
  }

  function drawResourceNodes(){for(const resource of terrainLayerResources)drawResourceNode(resource.q,resource.r,resource.p,resource.type);}

  function terrainLayerStats(){return {builds:terrainLayerBuilds,cells:terrainLayerCells,resources:terrainLayerResources.length};
  }

  function drawResourceNode(q,r,p,type){
    const node=resourceNodeAt(q,r),exhausted=node.amount<=0,low=!exhausted&&node.amount<=node.maxAmount*.2;
    const color=exhausted?"#697276":type==="energy"?"#60d5db":"#e6b94a";
    ctx.save();
    if(low){const pulse=.5+.5*Math.sin(state.elapsed*5);ctx.shadowBlur=18+pulse*10;ctx.shadowColor="#ff3848";ctx.strokeStyle=`rgba(255,56,72,${.65+pulse*.3})`;ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(p.x,p.y,15+pulse*2,0,Math.PI*2);ctx.stroke();}
    ctx.shadowBlur=exhausted?0:12;ctx.shadowColor=color;ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,11,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle=color;ctx.globalAlpha=exhausted?.12:.18;ctx.fill();ctx.globalAlpha=1;ctx.fillStyle=color;ctx.font="700 15px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(type==="energy"?"E":"C",p.x,p.y+.5);ctx.restore();
    const selected=getSelected();
    const focused=(state.hover?.q===q&&state.hover?.r===r)||(selected?.type==="node"&&selected.q===q&&selected.r===r)||(selected?.type==="mine"&&selected.q===q&&selected.r===r);
    if(focused)drawMiniBar(p.x-17,p.y+29,34,node.amount/node.maxAmount,"#b879ff");
  }

  function drawTracks(){
    ctx.lineCap="round";
    for(const track of state.tracks.values()){
      const p=axialToWorld(track.q,track.r);
      for(const linkedKey of track.links){
        if(key(track.q,track.r)>linkedKey)continue;
        const n=fromKey(linkedKey);
        const np=axialToWorld(n.q,n.r);
        const dx=np.x-p.x,dy=np.y-p.y,length=Math.hypot(dx,dy),nx=-dy/length,ny=dx/length;
        ctx.strokeStyle="#0a0d0f";ctx.lineWidth=15;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(np.x,np.y);ctx.stroke();
        ctx.strokeStyle=track.hp<track.maxHp?"#743b40":"#4b5559";ctx.lineWidth=3;
        for(let t=.12;t<.9;t+=.16){const x=lerp(p.x,np.x,t),y=lerp(p.y,np.y,t);ctx.beginPath();ctx.moveTo(x-nx*7,y-ny*7);ctx.lineTo(x+nx*7,y+ny*7);ctx.stroke();}
        ctx.strokeStyle=track.hp<track.maxHp?"#a84c52":"#aeb9bc";ctx.lineWidth=2.6;
        for(const offset of [-4.5,4.5]){ctx.beginPath();ctx.moveTo(p.x+nx*offset,p.y+ny*offset);ctx.lineTo(np.x+nx*offset,np.y+ny*offset);ctx.stroke();}
      }
      ctx.fillStyle="#0a0d0f";ctx.beginPath();ctx.arc(p.x,p.y,7.5,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=track.hp<track.maxHp?"#a84c52":"#8f9b9f";ctx.beginPath();ctx.arc(p.x,p.y,3.2,0,Math.PI*2);ctx.fill();
      const focused=(state.selected?.type==="track"&&state.selected.id===key(track.q,track.r))||(state.hover?.q===track.q&&state.hover?.r===track.r&&!trainAt(track.q,track.r));
      if(focused)drawMiniBar(p.x-15,p.y-15,30,track.hp/track.maxHp,track.hp<track.maxHp?"#e34747":"#70bd77");
    }
  }

  function drawBuildTrackGlow(){
    if(state.mode!=="track")return;
    const pulse=.5+.5*Math.sin(state.elapsed*5.5),color="#b879ff";
    ctx.save();ctx.globalCompositeOperation="screen";ctx.lineCap="round";ctx.strokeStyle=color;ctx.fillStyle=color;ctx.globalAlpha=.22+pulse*.2;ctx.shadowColor=color;ctx.shadowBlur=12+pulse*12;
    for(const track of state.tracks.values()){
      const p=axialToWorld(track.q,track.r);
      for(const linkedKey of track.links){
        if(key(track.q,track.r)>linkedKey)continue;
        const neighbor=fromKey(linkedKey),np=axialToWorld(neighbor.q,neighbor.r);
        ctx.lineWidth=7+pulse*3;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(np.x,np.y);ctx.stroke();
      }
      ctx.beginPath();ctx.arc(p.x,p.y,8+pulse*2,0,Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha=.6+pulse*.3;ctx.shadowBlur=0;ctx.lineWidth=1.4;const markerRadius=8;
    for(const track of state.tracks.values()){
      const p=axialToWorld(track.q,track.r);ctx.beginPath();ctx.arc(p.x,p.y,markerRadius,0,Math.PI*2);ctx.stroke();
    }
    ctx.restore();
  }

  function activeScheduleStops(train){return (train.schedule||[]).map((stop,index)=>({stop,index})).filter(entry=>isScheduleTrackHex(entry.stop.q,entry.stop.r));}

  function drawTrainStops(){
    for(const train of state.trains){
      const code=trainScheduleCode(train);
      activeScheduleStops(train).forEach(({stop,index})=>{
        const p=axialToWorld(stop.q,stop.r),label=`${code}${index+1}`;
        ctx.save();ctx.font="900 10px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";
        const width=Math.max(22,ctx.measureText(label).width+8);
        roundedRectPath(p.x-width/2,p.y+14,width,14,5);ctx.fillStyle="rgba(8,13,16,.94)";ctx.fill();ctx.strokeStyle="#70bd77";ctx.lineWidth=1;ctx.stroke();
        ctx.fillStyle="#fff1b4";ctx.fillText(label,p.x,p.y+21);ctx.restore();
      });
    }
  }

  function drawSelectedStopServiceRange(){
    if(state.selected?.type!=="track"&&!(state.selected?.type==="ghost"&&state.selected.objectType==="track"))return;
    const center=fromKey(state.selected.id);
    if(!scheduleStopAt(center.q,center.r))return;
    const cells=[center,...neighbors(center.q,center.r)],cellKeys=new Set(cells.map(cell=>key(cell.q,cell.r)));
    const edgeDirections=[[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]];
    ctx.save();ctx.strokeStyle="#70bd77";ctx.lineWidth=1.35;
    for(const cell of cells){
      const p=axialToWorld(cell.q,cell.r);
      edgeDirections.forEach(([dq,dr],side)=>{
        if(cellKeys.has(key(cell.q+dq,cell.r+dr)))return;
        const a=HEX_CORNERS[side],b=HEX_CORNERS[(side+1)%6];
        ctx.beginPath();ctx.moveTo(p.x+HEX*a.x,p.y+HEX*a.y);ctx.lineTo(p.x+HEX*b.x,p.y+HEX*b.y);ctx.stroke();
      });
    }
    ctx.restore();
  }

  function drawGhosts(){
    for(const ghost of state.ghosts.values()){
      const p=axialToWorld(ghost.q,ghost.r),focused=(state.selected?.type==="ghost"&&state.selected.id===ghost.id)||(state.hover?.q===ghost.q&&state.hover?.r===ghost.r);
      ctx.save();ctx.globalAlpha=focused?.42:.22;ctx.setLineDash([5,4]);ctx.strokeStyle="#b7c6c9";ctx.fillStyle="#718087";
      if(ghost.objectType==="track"){
        for(const linkedKey of ghost.links||[]){const n=fromKey(linkedKey),np=axialToWorld(n.q,n.r);ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(np.x,np.y);ctx.stroke();}
        ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.stroke();
      }else if(ghost.objectType==="turret"){
        ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,13,0,Math.PI*2);ctx.stroke();ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+17,p.y-8);ctx.stroke();
        ctx.font="900 10px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("T",p.x,p.y+.5);
      }else{
        ctx.lineWidth=2;ctx.strokeRect(p.x-15,p.y-15,30,30);ctx.fillRect(p.x-4,p.y-20,8,13);ctx.fillStyle="#dce6e8";ctx.font="900 11px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(ghost.resource==="energy"?"M:E":"M:C",p.x,p.y+.5);
      }
      hexPath(ghost.q,ghost.r,.72);ctx.lineWidth=1;ctx.stroke();ctx.restore();
    }
  }

  function drawTurretRange(center,preview=false,range=TURRET_RANGE){
    ctx.save();ctx.fillStyle=preview?"rgba(230,185,74,.06)":"rgba(96,213,219,.055)";ctx.strokeStyle=preview?"rgba(230,185,74,.5)":"rgba(96,213,219,.34)";ctx.lineWidth=1.4;ctx.setLineDash([5,4]);
    for(let dq=-range;dq<=range;dq++){
      const r0=Math.max(-range,-dq-range),r1=Math.min(range,-dq+range);
      for(let dr=r0;dr<=r1;dr++){
        hexPath(center.q+dq,center.r+dr,.91);ctx.fill();
        if(hexDistance(center,{q:center.q+dq,r:center.r+dr})===range)ctx.stroke();
      }
    }
    ctx.setLineDash([]);ctx.restore();
  }

  function drawTurretRanges(){
    if(state.mode==="turret"&&state.hover)drawTurretRange(state.hover,true);
    const selectedCombat=state.selected?.type==="train"?state.trains.find(train=>train.id===state.selected.id&&train.trainType==="combat"):null;
    if(selectedCombat)drawTurretRange(worldToAxial(selectedCombat.x,selectedCombat.y),false,COMBAT_TRAIN_RANGE);
    for(const turret of state.structures.values()){
      if(turret.type!=="turret")continue;
      const selected=state.selected?.type==="structure"&&state.selected.id===turret.id;
      if(!selected&&state.elapsed>=(turret.showRangeUntil||0))continue;
      drawTurretRange(turret);
    }
  }

  function drawBase(){
    const p=axialToWorld(0,0);ctx.save();ctx.shadowBlur=18;ctx.shadowColor="rgba(230,185,74,.25)";hexPath(0,0,.78);ctx.fillStyle="#303438";ctx.fill();ctx.strokeStyle="#e6b94a";ctx.lineWidth=2.4;ctx.stroke();ctx.shadowBlur=0;
    ctx.fillStyle="#151a1d";ctx.fillRect(p.x-17,p.y-14,34,28);ctx.strokeStyle="#a68a47";ctx.strokeRect(p.x-17,p.y-14,34,28);ctx.fillStyle="#f4cf69";ctx.font="900 22px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("B",p.x,p.y+1);ctx.restore();
    if((state.selected?.type==="base")||(state.hover?.q===0&&state.hover?.r===0))drawMiniBar(p.x-18,p.y-25,36,state.base.hp/state.base.maxHp,state.base.hp<20?"#e34747":"#70bd77");
  }

  function drawHives(){
    for(const hive of state.hives.values()){
      const p=axialToWorld(hive.q,hive.r),pulse=.5+.5*Math.sin(state.elapsed*3+hive.q-hive.r);
      ctx.save();ctx.shadowBlur=14+pulse*7;ctx.shadowColor="#a71932";hexPath(hive.q,hive.r,.62);ctx.fillStyle="#481522";ctx.fill();ctx.strokeStyle="#d33a51";ctx.lineWidth=2.2;ctx.stroke();ctx.shadowBlur=0;
      ctx.fillStyle="#ff8793";ctx.font="900 18px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("H",p.x,p.y+1);ctx.restore();
      const focused=(state.selected?.type==="hive"&&state.selected.id===hive.id)||(state.hover?.q===hive.q&&state.hover?.r===hive.r);
      if(focused)drawMiniBar(p.x-17,p.y-25,34,hive.hp/hive.maxHp,hive.hp<=2?"#e34747":"#70bd77");
    }
  }

  function drawStructures(){
    for(const s of state.structures.values()){
      const p=axialToWorld(s.q,s.r);ctx.save();
      if(s.type==="turret"){
        if(s.energy<=s.maxEnergy*.2){const pulse=.5+.5*Math.sin(state.elapsed*6);ctx.shadowBlur=20+pulse*12;ctx.shadowColor="#ff3848";ctx.strokeStyle=`rgba(255,56,72,${.65+pulse*.35})`;ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.x,p.y,18+pulse*2,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;}
        ctx.shadowBlur=s.energy>=1?12:0;ctx.shadowColor="#60d5db";ctx.fillStyle="#26353a";ctx.strokeStyle=s.energy>=1?"#60d5db":"#59676c";ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,13,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.shadowBlur=0;ctx.strokeStyle="#b7c6c9";ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+17,p.y-8);ctx.stroke();ctx.fillStyle="#0d1215";ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.fill();ctx.fillStyle="#f3f7f8";ctx.font="900 10px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("T",p.x,p.y+.5);
      }else{
        const exhausted=resourceNodeAt(s.q,s.r).amount<=0;
        ctx.fillStyle=exhausted?"#34393c":"#273239";ctx.strokeStyle=exhausted?"#70787c":s.resource==="energy"?"#60d5db":"#e6b94a";ctx.lineWidth=2;ctx.beginPath();ctx.rect(p.x-15,p.y-15,30,30);ctx.fill();ctx.stroke();ctx.fillStyle=ctx.strokeStyle;ctx.fillRect(p.x-4,p.y-20,8,13);
        ctx.fillStyle=exhausted?"#202528":"#091014";ctx.fillRect(p.x-13,p.y-7,26,14);ctx.fillStyle=exhausted?"#a2aaad":"#f3f7f8";ctx.font="900 11px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(s.resource==="energy"?"M:E":"M:C",p.x,p.y+.5);
      }
      const focused=(state.selected?.type==="structure"&&state.selected.id===s.id)||(state.hover?.q===s.q&&state.hover?.r===s.r);
      if(focused){
        drawMiniBar(p.x-17,p.y-25,34,s.hp/s.maxHp,s.hp<5?"#e34747":"#70bd77");
        if(s.type==="turret")drawMiniBar(p.x-17,p.y+22,34,s.energy/s.maxEnergy,"#60d5db");
      }
      ctx.restore();
    }
  }

  function drawMiniBar(x,y,w,ratio,color){ctx.fillStyle="rgba(52,67,73,.9)";ctx.fillRect(x,y,w,3);ctx.fillStyle=color;ctx.fillRect(x,y,w*clamp(ratio,0,1),3);}

  function roundedRectPath(x,y,w,h,r){
    ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
  }

  function worldMessagePriority(message){
    const activity=activityText(message);
    if(activity.startsWith("Rebuilt "))return 0;
    if(activity.startsWith("Repaired ")||activity.startsWith("Partially Repaired: "))return 1;
    if(activity==="Mined Construction Material")return 2;
    if(activity==="Mined Energy")return 3;
    if(activity.startsWith("Mined "))return 4;
    if(activity.startsWith("Loaded Turret"))return 5;
    if(activity.startsWith("Unloaded "))return 6;
    return 7;
  }

  function worldMessageLayout(){
    const pending=state.worldMessages.filter(item=>item.until>state.elapsed),clusters=[];
    while(pending.length){
      const cluster=[pending.shift()];
      for(let changed=true;changed;){
        changed=false;
        for(let i=pending.length-1;i>=0;i--)if(cluster.some(item=>hexDistance(item,pending[i])<=5)){
          cluster.push(pending.splice(i,1)[0]);changed=true;
        }
      }
      clusters.push(cluster);
    }
    const layout=[],height=20,gap=4;
    ctx.save();ctx.font="700 11px ui-monospace, monospace";
    for(const cluster of clusters){
      cluster.sort((a,b)=>worldMessagePriority(a.message)-worldMessagePriority(b.message)||a.message.localeCompare(b.message)||a.targetKey.localeCompare(b.targetKey));
      const points=cluster.map(item=>({item,p:axialToWorld(item.q,item.r)}));
      const centerX=points.reduce((sum,entry)=>sum+entry.p.x,0)/points.length;
      const bottom=Math.min(...points.map(entry=>entry.p.y-(entry.item.targetType==="track"?23:35)))-6;
      const top=bottom-(cluster.length*height+(cluster.length-1)*gap);
      cluster.forEach((item,index)=>{
        const width=Math.ceil(ctx.measureText(item.message).width)+18,y=top+index*(height+gap);
        layout.push({item,x:centerX-width/2,y,width,height,textX:centerX,textY:y+height/2+.5});
      });
    }
    ctx.restore();return layout;
  }

  function drawWorldMessages(){
    for(const entry of worldMessageLayout()){
      const {item,x,y,width,height,textX,textY}=entry;
      ctx.save();ctx.font="700 11px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";
      roundedRectPath(x,y,width,height,10);ctx.fillStyle="rgba(8,13,16,.92)";ctx.fill();ctx.strokeStyle=item.color;ctx.lineWidth=1;ctx.stroke();
      ctx.fillStyle=item.color;ctx.fillText(item.message,textX,textY);ctx.restore();
    }
  }

  function drawTrains(){
    for(const train of state.trains){
      const segments=trainSegments(train);
      const focused=state.selected?.id===train.id||(state.hover&&segments.some(segment=>segment.q===state.hover.q&&segment.r===state.hover.r));
      ctx.strokeStyle="#79502f";ctx.lineWidth=2;
      for(let i=0;i<segments.length-1;i++){
        const a=segments[i],b=segments[i+1],dx=b.x-a.x,dy=b.y-a.y,distance=Math.hypot(dx,dy)||1,ux=dx/distance,uy=dy/distance;
        ctx.beginPath();ctx.moveTo(a.x+ux*14,a.y+uy*14);ctx.lineTo(b.x-ux*14,b.y-uy*14);ctx.stroke();
      }
      train.wagons.forEach(wagon=>{
        ctx.save();ctx.translate(wagon.x,wagon.y);ctx.rotate(wagon.heading||0);
        if(state.selected?.id===train.id)drawTrainSelectionRing();
        ctx.fillStyle=wagon.type==="energy"?"#347f87":"#8c7337";
        ctx.strokeStyle=wagon.type==="energy"?"#83edf2":"#f2cb69";
        ctx.lineWidth=2;ctx.fillRect(-14,-9,28,18);ctx.strokeRect(-14,-9,28,18);
        ctx.restore();
        ctx.save();ctx.fillStyle="#f3f7f8";ctx.font="800 13px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("W",wagon.x,wagon.y+.5);ctx.restore();
        if(focused)drawMiniBar(wagon.x-14,wagon.y-17,28,wagon.hp/wagon.maxHp,wagon.hp<5?"#e34747":"#70bd77");
      });
      ctx.save();ctx.translate(train.x,train.y);ctx.rotate(train.heading);if(state.selected?.id===train.id)drawTrainSelectionRing();ctx.shadowBlur=12;ctx.shadowColor="#e34747";ctx.fillStyle="#a9343e";ctx.strokeStyle="#ff8790";ctx.lineWidth=2;ctx.fillRect(-14,-9,28,18);ctx.strokeRect(-14,-9,28,18);ctx.beginPath();ctx.moveTo(14,-7);ctx.lineTo(22,0);ctx.lineTo(14,7);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
      if(train.trainType==="combat"){const angle=Number.isFinite(train.gunAngle)?train.gunAngle:train.heading,ux=Math.cos(angle),uy=Math.sin(angle);ctx.save();ctx.strokeStyle="#83edf2";ctx.lineWidth=4;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(train.x+ux*5,train.y+uy*5);ctx.lineTo(train.x+ux*22,train.y+uy*22);ctx.stroke();ctx.fillStyle="#163a3f";ctx.strokeStyle="#83edf2";ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(train.x,train.y,6,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();}
      ctx.save();ctx.fillStyle="#fff4f4";ctx.font="900 13px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("L",train.x,train.y+.5);ctx.restore();
      drawTrainCarLetters(train);
      if(focused){drawMiniBar(train.x-16,train.y-17,32,train.hp/train.maxHp,train.hp<5?"#e34747":"#70bd77");drawMiniBar(train.x-16,train.y+18,32,train.fuel/train.maxFuel,"#60d5db");}
    }
  }

  function drawTrainCarLetters(train){
    const segments=trainSegments(train),label=trainScheduleCode(train);
    segments.forEach((segment,index)=>{
      const next=segments[index+1],previous=segments[index-1];
      let dx,dy;
      if(next){dx=next.x-segment.x;dy=next.y-segment.y;}
      else if(previous){dx=segment.x-previous.x;dy=segment.y-previous.y;}
      else {dx=-Math.cos(train.heading);dy=-Math.sin(train.heading);}
      const distance=Math.hypot(dx,dy)||1,ux=dx/distance,uy=dy/distance,x=segment.x+ux*24,y=segment.y+uy*24;
      ctx.save();ctx.strokeStyle="#b88a50";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(segment.x+ux*14,segment.y+uy*14);ctx.lineTo(x-ux*7,y-uy*7);ctx.stroke();
      ctx.fillStyle="rgba(9,14,17,.96)";ctx.strokeStyle="#e6b94a";ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.fillStyle="#fff1b4";ctx.font="900 10px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(label,x,y+.5);ctx.restore();
    });
  }

  function drawTrainSelectionRing(){ctx.strokeStyle="#fff1b4";ctx.lineWidth=1.5;ctx.setLineDash([4,3]);ctx.beginPath();ctx.arc(0,0,24,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}

  function drawEnemies(){
    for(const e of state.enemies){ctx.save();ctx.translate(e.x,e.y);const pulse=1+Math.sin(e.phase)*.08;ctx.scale(pulse,pulse);ctx.shadowBlur=13;ctx.shadowColor="#c51f31";ctx.fillStyle="#b92838";ctx.beginPath();for(let i=0;i<9;i++){const a=i/9*Math.PI*2,rr=9+Math.sin(e.phase+i*2.1)*2.6;const x=Math.cos(a)*rr,y=Math.sin(a)*rr;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();ctx.fill();ctx.shadowBlur=0;ctx.fillStyle="#f0646e";ctx.globalAlpha=.65;ctx.beginPath();ctx.arc(-2,-2,3,0,Math.PI*2);ctx.fill();ctx.restore();}
  }

  function drawEffects(){
    for(const p of state.projectiles){ctx.globalAlpha=p.life/p.maxLife;ctx.strokeStyle=p.color||"#bafcff";ctx.lineWidth=p.width||2;ctx.beginPath();ctx.moveTo(p.x1,p.y1);ctx.lineTo(p.x2,p.y2);ctx.stroke();ctx.fillStyle=p.impactColor||"#fff";ctx.beginPath();ctx.arc(p.x2,p.y2,3,0,Math.PI*2);ctx.fill();}
    for(const p of state.particles){ctx.globalAlpha=clamp(p.life/p.maxLife,0,1);ctx.fillStyle=p.color;ctx.fillRect(p.x-1.5,p.y-1.5,3,3);}ctx.globalAlpha=1;
  }

  function drawHover(){
    if(state.mode==="deploy"&&state.deploymentHead){
      for(const reservedKey of state.deploymentReserved){const position=fromKey(reservedKey);hexPath(position.q,position.r,.82);ctx.fillStyle="rgba(230,185,74,.11)";ctx.fill();ctx.strokeStyle="rgba(230,185,74,.58)";ctx.lineWidth=1.5;ctx.stroke();}
      hexPath(state.deploymentHead.q,state.deploymentHead.r,.68);ctx.strokeStyle="#fff1b4";ctx.lineWidth=3;ctx.stroke();
      for(const path of state.deploymentPaths){const tail=path[path.length-1];hexPath(tail.q,tail.r,.58);ctx.strokeStyle="#60d5db";ctx.lineWidth=3;ctx.stroke();}
    }
    if(!state.hover)return;const {q,r}=state.hover;hexPath(q,r,.9);let color="#aebabe";if(state.mode==="track"||state.mode==="turret"||state.mode==="mine"||state.mode==="deploy"||state.mode==="schedule")color="#e6b94a";if(state.mode==="salvage")color="#e34747";ctx.strokeStyle=color;ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.stroke();ctx.setLineDash([]);
    if(state.mode==="track"&&state.trackStart){hexPath(state.trackStart.q,state.trackStart.r,.78);ctx.strokeStyle="#fff1b4";ctx.lineWidth=3;ctx.stroke();if(hexDistance(state.trackStart,{q,r})===1){const a=axialToWorld(state.trackStart.q,state.trackStart.r),b=axialToWorld(q,r);ctx.strokeStyle="rgba(230,185,74,.45)";ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}}
  }

  function drawSelection(){
    const selected=getSelected();if(!selected||selected.wagons)return;const p=axialToWorld(selected.q,selected.r);ctx.strokeStyle="#fff1b4";ctx.lineWidth=1.6;ctx.setLineDash([5,3]);ctx.beginPath();ctx.arc(p.x,p.y,23,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
  }

  function render(){
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ensureTerrainLayer();ctx.drawImage(terrainLayer,0,0,terrainLayer.width,terrainLayer.height,0,0,width,height);ctx.save();ctx.translate(width/2,height/2);ctx.scale(state.camera.zoom,state.camera.zoom);ctx.translate(-state.camera.x,-state.camera.y);
    drawResourceNodes();drawTurretRanges();drawTracks();drawSelectedStopServiceRange();drawGhosts();drawTrainStops();drawHives();drawBase();drawStructures();drawSelection();drawTrains();drawBuildTrackGlow();drawEnemies();drawEffects();drawHover();drawWorldMessages();ctx.restore();
  }

  function hpBlock(object){const ratio=clamp(object.hp/object.maxHp*100,0,100);return `<div class="status-bar"><span style="width:${ratio}%"></span></div><div class="status-caption"><span>HIT POINTS</span><span>${Math.ceil(object.hp)} / ${object.maxHp}</span></div>`;}
  function energyBlock(object){const ratio=clamp(object.energy/object.maxEnergy*100,0,100);return `<div class="status-bar energy"><span style="width:${ratio}%"></span></div><div class="status-caption"><span>ENERGY</span><span>${Math.floor(object.energy)} / ${object.maxEnergy}</span></div>`;}
  function resourceBlock(node){const ratio=clamp(node.amount/node.maxAmount*100,0,100);return `<div class="status-bar resource"><span style="width:${ratio}%"></span></div><div class="status-caption"><span>RESOURCE UNITS</span><span>${Math.floor(node.amount)} / ${node.maxAmount}</span></div>`;}
  function cargoHtml(train){if(!train.wagons.length)return `<div class="action-note">No cargo wagons attached.</div>`;return `<div class="cargo-list">${train.wagons.map((w,i)=>`<div class="cargo-row ${w.type||"empty"}"><i></i><span>Wagon ${i+1} · ${w.type?resourceLabel(w.type).toUpperCase():"EMPTY"}</span><strong>${Math.floor(w.amount)} / ${w.capacity}</strong></div>`).join("")}</div>`;}
  function baseInventoryHtml(){return `<div class="cargo-list"><div class="cargo-row material"><i></i><span>CONSTRUCTION MATERIAL</span><strong>${Math.floor(state.baseMaterial)}</strong></div><div class="cargo-row energy"><i></i><span>ENERGY</span><strong>${Math.floor(state.baseEnergy)}</strong></div></div>`;}
  function capitalize(value){return value.charAt(0).toUpperCase()+value.slice(1);}
  function resourceLabel(value){return value==="material"?"Construction Material":"Energy";}
  function button(action,label,cls="btn-quiet",tooltip="",disabled=false){
    const tipAttributes=tooltip?`data-bs-toggle="tooltip" data-bs-placement="left" title="${tooltip}"`:"";
    const markup=`<button class="btn ${cls}" data-action="${action}" ${disabled?"disabled aria-disabled=\"true\"":""} ${disabled?"":tipAttributes}>${label}</button>`;
    return disabled&&tooltip?`<span class="disabled-button-tip" ${tipAttributes}>${markup}</span>`:markup;
  }

  function selectionHtml(){
    const selected=getSelected();
    if(!selected)return "";
    if(selected.type==="base"){
      const unavailable=trainFabricationDisabledReason(),canPlaceTrain=!unavailable,unavailableTip=unavailable?`&#10;&#10;Unavailable: ${unavailable}`:"",deployLength=state.deploymentTrainType==="combat"?2:3,deployDistance=deployLength===2?"one":"two";
      const deployNote=state.mode==="deploy"?`<div class="action-note">${state.deploymentHead?`Head selected. Click a highlighted Tail point exactly ${deployDistance} connected Track ${deployDistance==="one"?"hex":"hexes"} away.`:`Click an empty Track hex for the Head, then click a highlighted Tail point. ${deployLength} connected Track hexes must be clear.`}</div>`:"";
      const builderTip=`Places one Locomotive with an empty Construction Material Wagon and an empty Energy Wagon. It mines resources, repairs, rebuilds, and supplies Turrets. Placement uses two clicks: Head, then Tail.&#10;&#10;Costs 30 Construction Material.${unavailableTip}`;
      const combatTip=`Places one Locomotive with one empty Energy Wagon. It automatically fires at Hives and Creeps within 6 hexes, including while moving. Locomotive Energy and weapon Energy can only be restocked at Base. Placement uses two clicks: Head, then Tail.&#10;&#10;Costs 30 Construction Material.${unavailableTip}`;
      return `<div class="selection-title"><h2>Base</h2></div>${hpBlock(selected)}${baseInventoryHtml()}${deployNote}<div class="panel-actions">${button("fabricate-place-builder-train","Fabricate and Place Build and Mine Train",canPlaceTrain?"btn-command":"btn-quiet",builderTip,!canPlaceTrain)}${button("fabricate-place-combat-train","Fabricate and Place Combat Train",canPlaceTrain?"btn-cyan":"btn-quiet",combatTip,!canPlaceTrain)}</div>`;
    }
    if(selected.wagons){const adding=state.mode==="schedule"&&state.scheduleTrainId===selected.id,hasStops=(selected.schedule?.length||0)>0,canAdd=!hasStops&&trainStopped(selected)&&!adding;const code=trainScheduleCode(selected);const note=adding?`<div class="action-note">Click Track or Destroyed Track to add Stop ${code}${selected.schedule.length+1}. Add at least 3 stops, then click ${code}1 again to start.</div>`:"",combatNote=selected.trainType==="combat"?`<div class="selection-subtitle">Moving defense train · Range 6 hexes · Locomotive and weapon Energy restock only at Base</div>`:"";return `<div class="selection-title"><h2>${selected.name}</h2></div>${combatNote}${hpBlock(selected)}<div class="status-bar energy"><span style="width:${selected.fuel/selected.maxFuel*100}%"></span></div><div class="status-caption"><span>ENERGY</span><span>${selected.fuel.toFixed(1)} / ${selected.maxFuel}</span></div>${cargoHtml(selected)}${note}<div class="panel-actions">${button("clear-schedule","Clear Schedule",hasStops||adding?"btn-danger":"btn-quiet","Clears every stop and stops the train at the next Track hex.",!hasStops&&!adding)}${button("add-schedule","Add Schedule",canAdd?"btn-command":"btn-quiet","Click at least 3 Track or Destroyed Track stops, then click the first stop again to complete the loop. Maximum 9 stops.",!canAdd)}</div>`;}
    if(selected.type==="turret")return `<div class="selection-title"><h2>Turret</h2></div><div class="selection-subtitle">Range 4 hexes · Instantly refills when a stopped Build and Mine Train Locomotive is adjacent</div>${hpBlock(selected)}${energyBlock(selected)}`;
    if(selected.type==="mine"){const node=resourceNodeAt(selected.q,selected.r),exhausted=node.amount<=0,title=`${exhausted?"Exhausted ":""}${resourceLabel(selected.resource)} Mine`,description=exhausted?"This Resource Node is exhausted":selected.resource==="energy"?"An adjacent stopped locomotive instantly refuels, then loads available Energy":"An adjacent stopped locomotive instantly loads available Construction Material";return `<div class="selection-title"><h2>${title}</h2></div><div class="selection-subtitle">${description}</div>${hpBlock(selected)}${resourceBlock(node)}`;}
    if(selected.type==="node")return `<div class="selection-title"><h2>${resourceLabel(selected.resource)} Node</h2></div>${resourceBlock(selected)}<div class="selection-subtitle">Build a Mine here to extract its resources</div>`;
    if(selected.type==="hive"){const rate=selected.level;const expansion=hiveExpansionLevel(selected);return `<div class="selection-title"><h2>Level ${rate} Hive</h2></div><div class="selection-subtitle">The two original Hives begin with one forced Creep batch · Expanded Hives immediately make the normal production choice · Each normal choice produces ${rate} Creeps as one batch or has a 1 in ${rate} chance to create one Hive instead · Repeats once per minute · A new Hive is Level ${expansion}, at most one Fibonacci step above its parent · Existing Hives never increase level</div>${hpBlock(selected)}`;}
    if(selected.type==="ghost"){const name=selected.objectType==="track"?"Track":selected.objectType==="turret"?"Turret":`${resourceLabel(selected.resource)} Mine`,scheduled=selected.objectType==="track"?scheduleStopAt(selected.q,selected.r):null,title=scheduled?`Destroyed Track with Train Stop ${trainScheduleCode(scheduled.train)}${scheduled.index+1} (Train ${trainScheduleCode(scheduled.train)})`:`Destroyed ${name}`;return `<div class="selection-title"><h2>${title}</h2></div><div class="selection-subtitle">Stops being a ghost when a locomotive carrying ${REBUILD_COSTS[selected.objectType]} Construction Material stops adjacent to it</div>`;}
    if(state.tracks.get(key(selected.q,selected.r))===selected){const scheduled=scheduleStopAt(selected.q,selected.r),title=scheduled?`Track with Train Stop ${trainScheduleCode(scheduled.train)}${scheduled.index+1} (Train ${trainScheduleCode(scheduled.train)})`:"Track";return `<div class="selection-title"><h2>${title}</h2></div>${hpBlock(selected)}`;}
    return `<div class="selection-empty">Unknown selection.</div>`;
  }

  function updateUI(force=false){
    ui.pauseToggle.textContent=state.gameOver?"Paused":state.paused?"Play":"Pause";ui.pauseToggle.disabled=state.gameOver;ui.pauseToggle.ariaLabel=state.paused||state.gameOver?"Play simulation":"Pause simulation";ui.soundToggle.textContent=state.sound?"Sound: ON":"Sound: OFF";ui.hivesNeutralized.textContent=state.hivesNeutralized;ui.creepsNeutralized.textContent=state.creepsNeutralized;ui.hivesInWorld.textContent=state.hives.size;ui.creepsInWorld.textContent=state.enemies.length;ui.timeSurvived.textContent=formatSurvivalTime(state.elapsed);
    const selectionMarkup=selectionHtml();
    if(force||selectionMarkup!==selectionCache){disposeTooltips(selectionContent);selectionContent.innerHTML=selectionMarkup;selectionCache=selectionMarkup;initializeTooltips(selectionContent);}
  }

  function initializeTooltips(root=document){if(!window.bootstrap)return;root.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(element=>bootstrap.Tooltip.getOrCreateInstance(element,{container:"body",trigger:"hover focus"}));}
  function disposeTooltips(root){if(!window.bootstrap)return;root.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(element=>bootstrap.Tooltip.getInstance(element)?.dispose());}

  function updateHoverStatus(hex){
    if(!hex){ui.hoverStatus.classList.add("d-none");ui.hoverTitle.textContent="";ui.hoverDetail.textContent="";return;}
    ui.hoverStatus.classList.remove("d-none");
    const {q,r}=hex;
    const enemy=state.enemies.find(item=>{const h=worldToAxial(item.x,item.y);return h.q===q&&h.r===r;});
    if(enemy){ui.hoverTitle.textContent="Biomass";ui.hoverDetail.textContent="Hostile · Moving Toward The Rail Network";return;}
    const trainInfo=trainSegmentAt(q,r);
    if(trainInfo){const {train,segment,index}=trainInfo;ui.hoverTitle.textContent=index===0?`${train.name} · Locomotive`:`${train.name} · Wagon ${index}`;ui.hoverDetail.textContent=index===0?`Energy ${train.fuel.toFixed(1)} · Hit Points ${Math.ceil(train.hp)}/${train.maxHp}`:`${segment.type?resourceLabel(segment.type):"Empty"} ${Math.floor(segment.amount)}/${segment.capacity} · Hit Points ${Math.ceil(segment.hp)}/${segment.maxHp}`;return;}
    const structure=structureAt(q,r);
    if(structure){const node=structure.type==="mine"?resourceNodeAt(q,r):null,exhausted=node?.amount<=0;ui.hoverTitle.textContent=structure.type==="base"?"Base":structure.type==="turret"?"Turret":`${exhausted?"Exhausted ":""}${resourceLabel(structure.resource)} Mine`;ui.hoverDetail.textContent=`Hit Points ${Math.ceil(structure.hp)}/${structure.maxHp}${structure.energy!==undefined?` · Energy ${Math.floor(structure.energy)}/${structure.maxEnergy}`:""}${node?` · Resource ${Math.floor(node.amount)}/${node.maxAmount}`:""}`;return;}
    const track=state.tracks.get(key(q,r));
    if(track){ui.hoverTitle.textContent="Track";ui.hoverDetail.textContent=`Hit Points ${Math.ceil(track.hp)}/${track.maxHp}`;return;}
    const ghost=ghostAt(q,r);
    if(ghost){const name=ghost.objectType==="track"?"Track":ghost.objectType==="turret"?"Turret":`${resourceLabel(ghost.resource)} Mine`,scheduled=ghost.objectType==="track"?scheduleStopAt(q,r):null;ui.hoverTitle.textContent=scheduled?`Destroyed Track · Stop ${trainScheduleCode(scheduled.train)}${scheduled.index+1}`:`Destroyed ${name}`;ui.hoverDetail.textContent=`Requires ${REBUILD_COSTS[ghost.objectType]} Construction Material in an adjacent stopped locomotive to rebuild`;return;}
    const hive=hiveAt(q,r);
    if(hive){const rate=hive.level;ui.hoverTitle.textContent=`Level ${rate} Hive`;ui.hoverDetail.textContent=`Hit Points ${Math.ceil(hive.hp)}/${hive.maxHp} · ${rate} Creeps per batch · 1 in ${rate} expansion chance`;return;}
    const terrain=terrainAt(q,r);
    if(terrain.type==="resource"){const node=resourceNodeAt(q,r);ui.hoverTitle.textContent=`${resourceLabel(terrain.resource)} Node`;ui.hoverDetail.textContent=`${Math.floor(node.amount)} / ${node.maxAmount} Units Remaining`;return;}
    ui.hoverTitle.textContent=terrain.type==="water"?"Body of Water":terrain.type==="rock"?"Mountain":terrain.type==="trees"?"Trees":capitalize(terrain.type);ui.hoverDetail.textContent=terrain.type==="ground"?"Clear terrain":"Impassable terrain";
  }

  function formatSurvivalTime(seconds){const total=Math.max(0,Math.floor(seconds)),hours=Math.floor(total/3600),minutes=Math.floor(total%3600/60);return `${String(hours).padStart(2,"0")}h${String(minutes).padStart(2,"0")}m${String(total%60).padStart(2,"0")}s`;}

  function showReminders(){
    remindersOpen=true;simulationAccumulator=0;
    ui.remindersDialog.hidden=false;ui.remindersDialog.classList.remove("d-none");
    setTimeout(()=>ui.remindersContinue.focus(),0);
  }

  function closeReminders(){
    remindersOpen=false;ui.remindersDialog.hidden=true;ui.remindersDialog.classList.add("d-none");
    lastWallTime=Date.now();simulationAccumulator=0;resetPerformanceMetrics();sounds.init();render();
  }

  if(window.__HYLAAX_TEST__){
    window.__HYLAAX_TEST_API__={
      constants:{NODE_MIN_CAPACITY,NODE_MAX_CAPACITY,INITIAL_HIVE_COUNT,ENEMY_SPEED,SIMULATION_STEP,TRACK_HIT_POINTS,REPAIR_PAUSE_SECONDS,TURRET_RANGE,COMBAT_TRAIN_RANGE,BASE_UNLOAD_TARGET,HIVE_LEVELS,COSTS,REBUILD_COSTS,DIRECTIONS},
      get state(){return state;},
      reset({mapSeed=123456789,seedHives=false}={}){
        state=makeInitialState();state.mapSeed=mapSeed;state.hives.clear();state.enemies=[];state.projectiles=[];state.particles=[];
        terrainCacheSeed=null;terrainCache=new Map();terrainRevision=0;simulationAccumulator=0;selectionCache="";remindersOpen=false;sounds.enabled=false;
        resetEnemyNavigation();if(seedHives)seedInitialHives();return state;
      },
      key,fromKey,hexDistance,neighbors,axialToWorld,worldToAxial,terrainAt,isPassable,resourceNodeAt,setNodeAmount,
      trainCode,trainName,trainSegments,trainStopped,totalCargo,cargoSpace,removeCargo,addCargo,fillBaseCargo,refuelAtBase,serviceBaseLogistics,
      connectedTrackNeighbors,conceptualTrackNeighbors,tracksAreLinked,linkTracks,deleteTrack,curveIsExtreme,layTrack,placeTrackOverGhost,
      scheduleStopAt,addScheduleStop,clearTrainSchedule,findPath,findConceptualTrackPath,repairApproachFor,scheduleLoopIsReachable,startScheduledLeg,updateTrainSchedules,
      hiveUnlockedLevel,nextHiveLevel,hiveExpansionLevel,createHive,hiveHexOpen,hiveReplicationRoll,hiveSpawnCandidates,spawnHiveNear,spawnEnemyFromHive,updateHives,
      showTrainEnergyWarning,updateTrainEnergyWarnings,updateAutomaticRepair,updateAutomaticLogistics,updateAutomaticRebuild,leaveGhost,rebuildGhost,damageTarget,
      resetEnemyNavigation,rebuildEnemyNavigation,ensureEnemyNavigation,nextEnemyNavigationStep,enemyNavigationStats,findEnemyStep,updateEnemies,
      updateTrains,updateCombatTrains,updateStructures,update,advanceSimulation,
      activityColor,showWorldActivity,worldMessagePriority,worldMessageLayout,selectionHtml,formatSurvivalTime
    };
  }

  canvas.addEventListener("pointerdown",e=>{sounds.init();canvas.setPointerCapture(e.pointerId);const p=state.pointer;p.down=true;p.moved=false;p.startX=p.x=e.clientX;p.startY=p.y=e.clientY;p.camX=state.camera.x;p.camY=state.camera.y;canvas.focus();});
  canvas.addEventListener("pointermove",e=>{state.hover=screenToHex(e.clientX,e.clientY);updateHoverStatus(state.hover);const p=state.pointer;if(!p.down){if(state.paused||state.gameOver)render();return;}p.x=e.clientX;p.y=e.clientY;const dx=p.x-p.startX,dy=p.y-p.startY;if(Math.hypot(dx,dy)>4)p.moved=true;if(p.moved){state.camera.x=p.camX-dx/state.camera.zoom;state.camera.y=p.camY-dy/state.camera.zoom;canvas.style.cursor="grabbing";render();}});
  canvas.addEventListener("pointerup",e=>{const p=state.pointer;if(!p.down)return;p.down=false;canvas.style.cursor=state.mode==="select"?"default":"crosshair";if(!p.moved)handleHexClick(screenToHex(e.clientX,e.clientY));});
  canvas.addEventListener("pointerleave",()=>{state.hover=null;updateHoverStatus(null);if(!state.pointer.down)canvas.style.cursor=state.mode==="select"?"default":"crosshair";});
  canvas.addEventListener("wheel",e=>{e.preventDefault();const rect=canvas.getBoundingClientRect(),sx=e.clientX-rect.left,sy=e.clientY-rect.top;const beforeX=(sx-width/2)/state.camera.zoom+state.camera.x,beforeY=(sy-height/2)/state.camera.zoom+state.camera.y;const factor=Math.exp(-e.deltaY*.0012);state.camera.zoom=clamp(state.camera.zoom*factor,.42,2.15);state.camera.x=beforeX-(sx-width/2)/state.camera.zoom;state.camera.y=beforeY-(sy-height/2)/state.camera.zoom;render();},{passive:false});

  document.addEventListener("click",e=>{const modeButton=e.target.closest("[data-mode]");if(modeButton){setMode(modeButton.dataset.mode);return;}const actionButton=e.target.closest("[data-action]");if(actionButton&&!actionButton.disabled)handleAction(actionButton.dataset.action,actionButton);});
  document.addEventListener("keydown",e=>{if(remindersOpen){if(e.key==="Escape"||e.key==="Enter")closeReminders();return;}if(!ui.confirmDialog.hidden){if(e.key==="Escape")cancelTrainSalvage();return;}if(e.target.matches("input,textarea"))return;if(e.key>="1"&&e.key<="5"){setMode(["select","track","turret","mine","salvage"][Number(e.key)-1]);}if(e.key==="Escape")setMode("select");});
  document.querySelectorAll("[data-mode]").forEach(button=>button.addEventListener("click",()=>sounds.init()));
  ui.pauseToggle.addEventListener("click",()=>{if(state.gameOver)return;state.paused=!state.paused;simulationAccumulator=0;lastWallTime=Date.now();updateUI(true);render();});
  ui.soundToggle.addEventListener("click",()=>{state.sound=!state.sound;sounds.enabled=state.sound;if(state.sound)sounds.place();updateUI(true);});
  ui.remindersContinue.addEventListener("click",closeReminders);
  ui.confirmNo.addEventListener("click",cancelTrainSalvage);
  ui.confirmYes.addEventListener("click",confirmTrainSalvage);
  ui.viewMapButton.addEventListener("click",showFinalMap);
  ui.viewFinalStats.addEventListener("click",showFinalStats);
  ui.restartButton.addEventListener("click",()=>{state=makeInitialState();resetEnemyNavigation();seedInitialHives();lastWallTime=Date.now();simulationAccumulator=0;resetPerformanceMetrics();selectionCache="";ui.gameOver.hidden=true;ui.gameOver.classList.add("d-none");ui.viewFinalStats.hidden=true;ui.viewFinalStats.classList.add("d-none");ui.confirmDialog.hidden=true;ui.confirmDialog.classList.add("d-none");updateHoverStatus(null);setMode("select");showReminders();});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden){const now=Date.now();advanceSimulation((now-lastWallTime)/1000);lastWallTime=now;resetPerformanceMetrics();render();}});
  window.addEventListener("resize",resize);
  ui.gameOver.hidden=true;ui.viewFinalStats.hidden=true;ui.confirmDialog.hidden=true;resize();initializeTooltips();updateHoverStatus(null);updateUI(true);showReminders();
  function frame(frameTime){const now=Date.now(),ticks=advanceSimulation((now-lastWallTime)/1000);lastWallTime=now;const rendered=ticks>0;if(rendered)render();recordPerformance(frameTime,ticks,rendered);requestAnimationFrame(frame);}requestAnimationFrame(frame);
})();
