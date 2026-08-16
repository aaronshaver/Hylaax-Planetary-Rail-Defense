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
  "pauseToggle", "soundToggle", "selectionLabel",
  "gameOver", "survivalTime", "viewMapButton", "viewFinalStats", "restartButton", "toastStack", "performanceStatus", "tpsValue", "fpsValue",
  "confirmDialog", "confirmMessage", "confirmYes", "confirmNo", "remindersDialog", "remindersTutorial", "remindersContinue",
  "tutorialPrompt", "tutorialText", "tutorialOkay", "tutorialRestart",
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

function trainName(index,type="builder") {return `${type==="combat"?"Turret Train":"Build/Mine Train"} ${trainCode(index)}`;}

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
