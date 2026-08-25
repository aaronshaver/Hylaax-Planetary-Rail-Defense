"use strict";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const terrainLayer = document.createElement("canvas");
const terrainCtx = terrainLayer.getContext("2d");
const worldWrap = document.getElementById("worldWrap");
const selectionContent = document.getElementById("selectionContent");
const HEX = 31;
const SQRT3 = Math.sqrt(3);
const NODE_MIN_CAPACITY = 250;
const NODE_MAX_CAPACITY = 1500;
const ENERGY_NODE_MIN_CAPACITY = Math.ceil(NODE_MIN_CAPACITY*1.4);
const ENERGY_NODE_MAX_CAPACITY = Math.ceil(NODE_MAX_CAPACITY*1.4);
const BASE_TRAIN_STOP_SECONDS = 2;
const TRAIN_ACTIVITY_MESSAGE_SECONDS = 1.25;
const ENEMY_SPEED = .38;
const CREEP_ATTACK_INTERVAL = 1;
const CREEP_ATTACK_DAMAGE = 1;
const COMBAT_BEAM_RENDER_CAP = 25;
const COMBAT_DEATH_FLASH_RENDER_CAP = 25;
const UNIT_SHADOW_RENDER_LIMIT = 100;
const UNIT_DEATH_FLASH_SECONDS = .28;
const UNIT_LIFESPAN_SECONDS = 120;
const SIMULATION_STEP = 1 / 60;
const TRACK_HIT_POINTS = 1;
const TRAIN_HIT_POINTS = 50;
const WALL_HIT_POINTS = 100;
const TRAIN_LOSS_SHAKE_SECONDS = .32;
const ENEMY_SPAWN_BUFFER = 4;
const REPAIR_PAUSE_SECONDS = 1;
const WALL_SERVICE_RANGE = 5;
const SALVAGE_BURST_SCALE = 1.3;
const TURRET_RANGE = 3;
const COMBAT_TRAIN_RANGE = 6;
const ARTILLERY_RANGE = 11;
const ARTILLERY_HIT_POINTS = 36;
const ARTILLERY_MAX_ENERGY = 50;
const ARTILLERY_FIRE_INTERVAL = 3;
const ARTILLERY_SHELL_FLIGHT_SECONDS = .7;
const ARTILLERY_BLAST_SECONDS = .75;
const ARTILLERY_SHOT_ENERGY = 10;
const ARTILLERY_CENTER_DAMAGE = 8;
const ARTILLERY_SPLASH_DAMAGE = 5;
const ARTILLERY_OUTER_SPLASH_DAMAGE = 1;
const TURRET_HIT_POINTS = 20;
const RESEARCH_HIT_POINTS = 300;
const RESEARCH_UPGRADE_COST = 30;
const NEUTRALIZER_BUILDING_HIT_POINTS = 200;
const NEUTRALIZER_BASE_HIT_POINTS = 1;
const NEUTRALIZER_BASE_DAMAGE = 1;
const NEUTRALIZER_ATTACK_INTERVAL = 1;
const NEUTRALIZER_SPEED = ENEMY_SPEED;
const NEUTRALIZER_BASE_STORAGE = 20;
const NEUTRALIZER_PRODUCTION_INTERVAL = 9;
const NEUTRALIZER_UNIT_MATERIAL_COST = 10;
const NEUTRALIZER_UNIT_ENERGY_COST = 10;
const NEUTRALIZER_LIVING_CAP = 50;
const CREEP_HEX_CAPACITY = 7;
const CREEP_SLOT_RADIUS = 17;
const CREEP_RENDER_SCALE = .64;
const BASE_UNLOAD_TARGET = 110;
const BASE_FOOTPRINT_OFFSETS = [{q:0,r:0},{q:1,r:0},{q:0,r:1},{q:1,r:-1}];
const HIVE_LEVELS = [1,2,3,5,8,13,21];
const DIRECTIONS = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
const COSTS = {
  track: { material: 1, energy: 0 },
  train: { material: 30, energy: 0 },
  combatTrain: { material: 30, energy: 10 },
  turret: { material: 10, energy: 10 },
  mine: { material: 10, energy: 0 },
  wall: { material: 30, energy: 0 },
  gate: { material: 30, energy: 0 },
  artillery: { material: 50, energy: 50 },
  research: { material: 50, energy: 50 },
  neutralizer: { material: 50, energy: 50 },
  terraform: { material: 5, energy: 5 },
  hiveBlocker: { material: 14, energy: 14 }
};
const REBUILD_COSTS = { track: 1, turret: 10, mine: 8, wall: 12, gate: 12, artillery: 30, research: 30, "neutralizer-building": 30 };
const BASE_RESOURCE_TYPES = [
  { key: "material", stateKey: "baseMaterial", label: "construction material" },
  { key: "energy", stateKey: "baseEnergy", label: "energy" }
];
const TRAIN_CAR_COLORS = {
  material:["#705c2c","#8c7337","#a88a42"],
  energy:["#2a666c","#347f87","#3e98a2"],
  builder:["#872a32","#a9343e","#cb3e4a"],
  combat:["#7c4a28","#9b5d32","#ba703c"]
};
const HEX_CORNERS = Array.from({length:6},(_,index)=>{const angle=(Math.PI/180)*(60*index-30);return {x:Math.cos(angle),y:Math.sin(angle)};});

const ui = Object.fromEntries([
  "baseEnergyHud", "baseMaterialHud", "unminedMaterialHud", "unminedEnergyHud", "researchPointsHud", "timeSurvived",
  "pauseToggle", "soundToggle", "centerBaseButton", "selectionLabel",
  "selectTool", "trackTool", "turretTool", "mineTool", "wallTool", "artilleryTool", "salvageTool", "researchTool", "gateTool", "neutralizerTool", "terraformTool", "hiveBlockerTool",
  "gameOver", "survivalTime", "viewMapButton", "viewFinalStats", "restartButton", "toastStack",
  "confirmDialog", "confirmMessage", "confirmYes", "confirmNo", "remindersDialog", "remindersTutorial", "remindersContinue",
  "tutorialPrompt", "tutorialText", "tutorialOkay", "tutorialRestart", "tutorialArrows",
  "debugToggle", "debugMenu", "debugDestroyObject", "debugAddHive", "debugAddMaxCreeps", "debugAddMaxNeutralizers", "debugAddBaseResources", "debugAddResearchPoints",
  "turretEnergyDialog", "turretEnergyMessage", "turretEnergyOkay",
  "trackDestroyedDialog", "trackDestroyedOkay",
  "neutralizerGateDialog", "neutralizerGateOkay",
  "lowBaseResourceDialog", "lowBaseResourceOkay",
  "defeatHivesNeutralized", "defeatCreepsNeutralized", "defeatTracksLaid", "defeatMinesBuilt", "defeatTurretsBuilt", "defeatTrainsBuilt", "defeatEnergyMined", "defeatMaterialMined"
].map(id => [id, document.getElementById(id)]));

const key = (q, r) => `${q},${r}`;
const fromKey = value => { const [q,r]=value.split(",").map(Number); return {q,r}; };
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const lerp = (a, b, t) => a + (b - a) * t;
const hexDistance = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
const neighbors = (q, r) => DIRECTIONS.map(([dq, dr]) => ({ q: q + dq, r: r + dr }));
const unitHexIndexCaches=new WeakMap(),unitReservationCaches=new WeakMap();

function removeIndexedUnit(index,positionKey,unit){
  if(!positionKey)return;
  const bucket=index.get(positionKey);if(!bucket)return;
  const position=bucket.indexOf(unit);if(position>=0)bucket.splice(position,1);
  if(!bucket.length)index.delete(positionKey);
}

function addIndexedUnit(index,positionKey,unit){
  const bucket=index.get(positionKey)||[];bucket.push(unit);index.set(positionKey,bucket);
}

function unitHexIndex(units){
  let cache=unitHexIndexCaches.get(units);
  if(!cache){const index=new Map(),destinations=new Map();index.destinations=destinations;cache={index,destinations,records:new Map(),generation:0};unitHexIndexCaches.set(units,cache);}
  const {index,destinations,records}=cache,generation=++cache.generation;let minQ=Infinity,maxQ=-Infinity,minR=Infinity,maxR=-Infinity;
  for(const unit of units){
    if(unit.hp<=0)continue;
    const position=worldToAxial(unit.x,unit.y),currentKey=key(position.q,position.r),destinationKey=unit.progress<1&&Number.isFinite(unit.toQ)&&Number.isFinite(unit.toR)&&currentKey!==key(unit.toQ,unit.toR)?key(unit.toQ,unit.toR):null;
    let record=records.get(unit.id);
    if(!record){record={unit,currentKey:null,destinationKey:null,generation};records.set(unit.id,record);}
    const indexedUnit=record.unit,unitChanged=indexedUnit!==unit;
    if(unitChanged||record.currentKey!==currentKey){removeIndexedUnit(index,record.currentKey,indexedUnit);addIndexedUnit(index,currentKey,unit);record.currentKey=currentKey;}
    if(unitChanged||record.destinationKey!==destinationKey){removeIndexedUnit(destinations,record.destinationKey,indexedUnit);if(destinationKey)addIndexedUnit(destinations,destinationKey,unit);record.destinationKey=destinationKey;}
    record.unit=unit;record.generation=generation;minQ=Math.min(minQ,position.q);maxQ=Math.max(maxQ,position.q);minR=Math.min(minR,position.r);maxR=Math.max(maxR,position.r);
  }
  for(const [id,record] of records)if(record.generation!==generation){removeIndexedUnit(index,record.currentKey,record.unit);removeIndexedUnit(destinations,record.destinationKey,record.unit);records.delete(id);}
  index.bounds=Number.isFinite(minQ)?{minQ,maxQ,minR,maxR}:null;return index;
}

function unitSpaceReservations(units,excludeId=null){
  let reservations=excludeId===null?unitReservationCaches.get(units):null;
  if(!reservations){reservations=new Map();if(excludeId===null)unitReservationCaches.set(units,reservations);}
  for(const slots of reservations.values())slots.clear();
  for(const unit of units){
    if(unit.hp<=0||unit.id===excludeId)continue;
    const slot=Number.isInteger(unit.slot)?unit.slot:0;reserveEnemySpace(reservations,unit.q,unit.r,slot);
    if(unit.progress<1)reserveEnemySpace(reservations,unit.toQ,unit.toR,Number.isInteger(unit.toSlot)?unit.toSlot:slot);
  }
  for(const [positionKey,slots] of reservations)if(!slots.size)reservations.delete(positionKey);
  return reservations;
}
function indexedUnitsAt(index,q,r){return index?.get(key(q,r))||[];}
function indexedUnitsInRange(index,q,r,range=1){
  const units=[];
  for(let dq=-range;dq<=range;dq++){
    const minDr=Math.max(-range,-dq-range),maxDr=Math.min(range,-dq+range);
    for(let dr=minDr;dr<=maxDr;dr++)for(const unit of indexedUnitsAt(index,q+dq,r+dr))if(unit.hp>0)units.push(unit);
  }
  return units;
}
function nearestIndexedUnit(index,q,r,predicate=unit=>unit.hp>0){
  const bounds=index?.bounds;if(!bounds)return null;
  const nearer=(best,unit,distance,bestDistance)=>!best||distance<bestDistance||(distance===bestDistance&&String(unit.id)<String(best.id));
  const scanBuckets=()=>{let best=null,bestDistance=Infinity;for(const [positionKey,bucket] of index){const position=fromKey(positionKey),distance=hexDistance({q,r},position);for(const unit of bucket)if(predicate(unit)&&nearer(best,unit,distance,bestDistance)){best=unit;bestDistance=distance;}}return best;};
  const maxRadius=Math.max(hexDistance({q,r},{q:bounds.minQ,r:bounds.minR}),hexDistance({q,r},{q:bounds.minQ,r:bounds.maxR}),hexDistance({q,r},{q:bounds.maxQ,r:bounds.minR}),hexDistance({q,r},{q:bounds.maxQ,r:bounds.maxR}));
  let visitedCells=0;
  for(let radius=0;radius<=maxRadius;radius++){
    let best=null;
    for(let dq=-radius;dq<=radius;dq++)for(let dr=Math.max(-radius,-dq-radius);dr<=Math.min(radius,-dq+radius);dr++){
      if(hexDistance({q:0,r:0},{q:dq,r:dr})!==radius)continue;
      if(++visitedCells>index.size*3+19)return scanBuckets();
      for(const unit of indexedUnitsAt(index,q+dq,r+dr))if(predicate(unit)&&(!best||String(unit.id)<String(best.id)))best=unit;
    }
    if(best)return best;
  }
  return null;
}
function unitOccupiesHex(units,q,r){
  return units.some(unit=>{if(unit.hp<=0)return false;const position=worldToAxial(unit.x,unit.y);return position.q===q&&position.r===r;});
}
function creepOccupiesHex(q,r,index=null){return index?indexedUnitsAt(index,q,r).some(creep=>creep.hp>0):unitOccupiesHex(state.enemies,q,r);}
function neutralizerOccupiesHex(q,r,index=null){return index?indexedUnitsAt(index,q,r).some(unit=>unit.hp>0):unitOccupiesHex(state.neutralizers,q,r);}
function footprintPerimeter(cells){
  const occupied=new Set(cells.map(cell=>key(cell.q,cell.r))),perimeter=new Map();
  for(const cell of cells)for(const position of neighbors(cell.q,cell.r))if(!occupied.has(key(position.q,position.r)))perimeter.set(key(position.q,position.r),position);
  return [...perimeter.values()];
}

function trainCode(index) {
  let value=index,label="";
  do { label=String.fromCharCode(65+(value%26))+label; value=Math.floor(value/26)-1; } while(value>=0);
  return label;
}

function trainName(index,type="builder") {return `${type==="combat"?"Turret train":"Build/mine train"} ${trainCode(index)}`;}
function randomTrainColorShade(){return Math.floor(Math.random()*3);}
function trainCarColor(family,shade=1){return TRAIN_CAR_COLORS[family]?.[clamp(Math.round(shade),0,2)]||TRAIN_CAR_COLORS.builder[1];}

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

function hexLineBetween(start,end){
  const distance=hexDistance(start,end),line=[];
  for(let step=1;step<distance;step++)line.push(cubeRound(lerp(start.q,end.q,step/distance),lerp(start.r,end.r,step/distance)));
  return line;
}

function hasClearShot(start,end){return hexLineBetween(start,end).every(position=>terrainAt(position.q,position.r).type!=="rock");}

function hash(q, r, salt = 0) {
  let n = Math.imul(q, 374761393) + Math.imul(r, 668265263) + Math.imul(salt, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
