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
const INITIAL_HIVE_BUFFER = 8;
const INITIAL_HIVE_COUNT = 2;
const ENEMY_SPEED = .38;
const CREEP_ATTACK_INTERVAL = 1;
const CREEP_ATTACK_DAMAGE = 1;
const SIMULATION_STEP = 1 / 60;
const TRACK_HIT_POINTS = 1;
const TRAIN_HIT_POINTS = 50;
const WALL_HIT_POINTS = 100;
const TRAIN_LOSS_SHAKE_SECONDS = .32;
const ENEMY_SPAWN_BUFFER = 4;
const REPAIR_PAUSE_SECONDS = 1;
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
const CREEP_HEX_CAPACITY = 7;
const CREEP_SLOT_RADIUS = 17;
const CREEP_RENDER_SCALE = .64;
const BASE_UNLOAD_TARGET = 110;
const BASE_FOOTPRINT_OFFSETS = [{q:0,r:0},{q:1,r:0},{q:0,r:1},{q:1,r:-1}];
const HIVE_LEVELS = [2,3,5,8,13,21];
const DIRECTIONS = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
const COSTS = {
  track: { material: 1, energy: 0 },
  train: { material: 30, energy: 0 },
  combatTrain: { material: 30, energy: 10 },
  turret: { material: 10, energy: 10 },
  mine: { material: 10, energy: 0 },
  wall: { material: 30, energy: 0 },
  artillery: { material: 50, energy: 50 },
  research: { material: 50, energy: 50 }
};
const REBUILD_COSTS = { track: 1, turret: 10, mine: 8, wall: 12, artillery: 30, research: 30 };
const BASE_RESOURCE_TYPES = [
  { key: "material", stateKey: "baseMaterial", label: "Construction Material" },
  { key: "energy", stateKey: "baseEnergy", label: "Energy" }
];
const TRAIN_CAR_COLORS = {
  material:["#705c2c","#8c7337","#a88a42"],
  energy:["#2a666c","#347f87","#3e98a2"],
  builder:["#872a32","#a9343e","#cb3e4a"],
  combat:["#533361","#684079","#7d4d91"]
};
const HEX_CORNERS = Array.from({length:6},(_,index)=>{const angle=(Math.PI/180)*(60*index-30);return {x:Math.cos(angle),y:Math.sin(angle)};});

const ui = Object.fromEntries([
  "baseEnergyHud", "baseMaterialHud", "unminedMaterialHud", "unminedEnergyHud", "researchPointsHud", "timeSurvived",
  "pauseToggle", "soundToggle", "centerBaseButton", "selectionLabel",
  "selectTool", "trackTool", "turretTool", "mineTool", "wallTool", "artilleryTool", "salvageTool", "researchTool",
  "gameOver", "survivalTime", "viewMapButton", "viewFinalStats", "restartButton", "toastStack",
  "confirmDialog", "confirmMessage", "confirmYes", "confirmNo", "remindersDialog", "remindersTutorial", "remindersContinue",
  "tutorialPrompt", "tutorialText", "tutorialOkay", "tutorialRestart",
  "debugToggle", "debugMenu", "debugDestroyObject", "debugAddCreep", "debugAddBaseResources", "debugAddResearchPoints",
  "turretEnergyDialog", "turretEnergyMessage", "turretEnergyOkay",
  "defeatHivesNeutralized", "defeatCreepsNeutralized", "defeatTracksLaid", "defeatMinesBuilt", "defeatTurretsBuilt", "defeatTrainsBuilt", "defeatEnergyMined", "defeatMaterialMined"
].map(id => [id, document.getElementById(id)]));

const key = (q, r) => `${q},${r}`;
const fromKey = value => { const [q,r]=value.split(",").map(Number); return {q,r}; };
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const lerp = (a, b, t) => a + (b - a) * t;
const hexDistance = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
const neighbors = (q, r) => DIRECTIONS.map(([dq, dr]) => ({ q: q + dq, r: r + dr }));
function creepOccupiesHex(q,r){return state.enemies.some(creep=>{const position=worldToAxial(creep.x,creep.y);return position.q===q&&position.r===r;});}
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

function trainName(index,type="builder") {return `${type==="combat"?"Turret Train":"Build/Mine Train"} ${trainCode(index)}`;}
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

function hasClearShot(start,end){return hexLineBetween(start,end).every(position=>!["rock","trees"].includes(terrainAt(position.q,position.r).type));}

function hash(q, r, salt = 0) {
  let n = Math.imul(q, 374761393) + Math.imul(r, 668265263) + Math.imul(salt, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
