"use strict";

const RESEARCH_UPGRADES = [
  {key:"turretFireRate",group:"Turrets (Fixed and Train)",label:"+50% Turret Firing Rate",multiplier:1.5,description:"Applies to both Fixed Turrets and Turret Trains."},
  {key:"turretDamage",group:"Turrets (Fixed and Train)",label:"+50% Turret Damage",multiplier:1.5,description:"Applies to both Fixed Turrets and Turret Trains."},
  {key:"turretRange",group:"Turrets (Fixed and Train)",label:"+20% Turret Range",multiplier:1.2,description:"Applies to both Fixed Turrets and Turret Trains."},
  {key:"turretEnergyStorage",group:"Turrets (Fixed and Train)",label:"+25% Turret Energy Storage",multiplier:1.25,description:"Fixed Turrets store 25% more Energy."},
  {key:"artilleryFireRate",group:"Artillery",label:"+50% Artillery Firing Rate",multiplier:1.5,description:"Artillery fires 50% more frequently."},
  {key:"artilleryDamage",group:"Artillery",label:"+50% Artillery Damage",multiplier:1.5,description:"Artillery center and splash damage increase by 50%."},
  {key:"artilleryRange",group:"Artillery",label:"+20% Artillery Range",multiplier:1.2,description:"Artillery range increases by 20%."},
  {key:"artilleryEnergyStorage",group:"Artillery",label:"+25% Artillery Energy Storage",multiplier:1.25,description:"Artillery stores 25% more Energy."},
  {key:"trainCapacity",group:"Trains and Mining",label:"+50% Train Capacity",multiplier:1.5,description:"All Train Supply wagons hold 50% more resources."},
  {key:"trainSpeed",group:"Trains and Mining",label:"+25% Train Speed",multiplier:1.25,description:"All Trains move 25% faster."},
  {key:"mineEfficiency",group:"Trains and Mining",label:"+20% Mining Efficiency",multiplier:1.2,description:"Mining uses fewer resources, extending the life of the Resource Node under the Mine."},
  {key:"loadUnloadEfficiency",group:"Trains and Mining",label:"+25% Load/Unload Efficiency",multiplier:.75,description:"Trains spend 25% less time stopped at each Train Stop."},
  {key:"wallStrength",group:"Infrastructure",label:"+50% Wall Hit Points",multiplier:1.5,description:"Walls have 50% more Hit Points."},
  {key:"trackStrength",group:"Infrastructure",label:"+100% Track Hit Points",multiplier:2,description:"Tracks have 100% more Hit Points."},
  {key:"researchSpeed",group:"Other",label:"+25% Research Rate",multiplier:1.25,description:"Research points are acquired 25% faster."}
];

function researchUpgrade(keyName){return RESEARCH_UPGRADES.find(upgrade=>upgrade.key===keyName)||null;}
function researchUpgradeCount(keyName){return state.researchUpgrades?.[keyName]||0;}
function researchMultiplier(keyName){const upgrade=researchUpgrade(keyName);return upgrade?Math.pow(upgrade.multiplier,researchUpgradeCount(keyName)):1;}
function researchedWholeValue(base,keyName){const upgrade=researchUpgrade(keyName);let value=base;for(let level=0;level<researchUpgradeCount(keyName);level++)value=Math.ceil(value*upgrade.multiplier);return value;}

function turretFireInterval(){return 1/researchMultiplier("turretFireRate");}
function combatTrainFireInterval(){return 1/researchMultiplier("turretFireRate");}
function turretDamage(){return researchedWholeValue(1,"turretDamage");}
function turretRange(){return Math.round(TURRET_RANGE*researchMultiplier("turretRange"));}
function combatTrainRange(){return Math.round(COMBAT_TRAIN_RANGE*researchMultiplier("turretRange"));}
function turretEnergyStorage(){return Math.ceil(20*researchMultiplier("turretEnergyStorage"));}
function mineEfficiency(){return researchMultiplier("mineEfficiency");}
function trainCapacity(){return Math.ceil(30*researchMultiplier("trainCapacity"));}
function trainSpeed(){return 2.25*researchMultiplier("trainSpeed");}
function loadUnloadDuration(){return BASE_TRAIN_STOP_SECONDS*researchMultiplier("loadUnloadEfficiency");}
function artilleryFireInterval(){return ARTILLERY_FIRE_INTERVAL/researchMultiplier("artilleryFireRate");}
function artilleryDamage(center=true){return researchedWholeValue(center?ARTILLERY_CENTER_DAMAGE:ARTILLERY_SPLASH_DAMAGE,"artilleryDamage");}
function artilleryDamageAtDistance(distance){return researchedWholeValue(distance===0?ARTILLERY_CENTER_DAMAGE:distance===1?ARTILLERY_SPLASH_DAMAGE:ARTILLERY_OUTER_SPLASH_DAMAGE,"artilleryDamage");}
function artilleryRange(){return Math.round(ARTILLERY_RANGE*researchMultiplier("artilleryRange"));}
function artilleryEnergyStorage(){return Math.ceil(ARTILLERY_MAX_ENERGY*researchMultiplier("artilleryEnergyStorage"));}
function wallHitPoints(){return Math.ceil(WALL_HIT_POINTS*researchMultiplier("wallStrength"));}
function trackHitPoints(){return TRACK_HIT_POINTS*researchMultiplier("trackStrength");}
function researchRate(){return researchMultiplier("researchSpeed");}

function researchFootprintCandidates(q,r){
  return DIRECTIONS.map(([dq,dr],index)=>{
    const [nextQ,nextR]=DIRECTIONS[(index+1)%DIRECTIONS.length];
    return [{q,r},{q:q+dq,r:r+dr},{q:q+nextQ,r:r+nextR}];
  });
}

function researchCellAvailable(cell){
  const site=nonMineConstructionSite(cell.q,cell.r);
  return isPassable(cell.q,cell.r)&&site.terrain.type==="ground"&&!structureAt(cell.q,cell.r)&&!hiveAt(cell.q,cell.r)&&!state.tracks.has(key(cell.q,cell.r))&&!trainClaimsHex(cell.q,cell.r)&&!creepOccupiesHex(cell.q,cell.r);
}

function researchPlacementFootprint(q,r){return researchFootprintCandidates(q,r).find(footprint=>footprint.every(researchCellAvailable))||null;}
function researchPreviewFootprint(q,r){return researchPlacementFootprint(q,r)||researchFootprintCandidates(q,r)[0];}

function buildResearch(q,r){
  if(!requireNoCreep(q,r))return;
  const footprint=researchPlacementFootprint(q,r);
  if(!footprint)return fail("Research needs three connected clear ground hexes in a triangle.");
  if(!payBase(COSTS.research,"Research"))return null;
  const replacedGhosts=new Map();
  for(const cell of footprint){const ghost=ghostAt(cell.q,cell.r);if(ghost)replacedGhosts.set(ghost.id,{ghost,site:nonMineConstructionSite(cell.q,cell.r)});}
  for(const {ghost,site} of replacedGhosts.values())replaceDestroyedSite(ghost,site);
  for(const cell of footprint){const site=nonMineConstructionSite(cell.q,cell.r);if(site.clearDepletedNode)clearDepletedResourceNode(cell.q,cell.r);}
  const research={id:`research-${state.nextId++}`,type:"research",q,r,footprint:footprint.map(cell=>({...cell})),hp:RESEARCH_HIT_POINTS,maxHp:RESEARCH_HIT_POINTS},firstResearch=!state.researchUnlocked;
  state.structures.set(key(q,r),research);state.researchUnlocked=true;if(firstResearch)state.researchPoints+=30;invalidateEnemyNavigation();sounds.place();
  for(const cell of footprint)burst(cell.q,cell.r,"#b879ff",6);
  select("structure",research.id);return research;
}

function applyResearchUpgrade(keyName){
  const upgrade=researchUpgrade(keyName),newMultiplier=researchMultiplier(keyName),oldMultiplier=newMultiplier/(upgrade?.multiplier||1);
  if(keyName==="turretFireRate"){
    for(const structure of state.structures.values())if(structure.type==="turret")structure.cooldown=Math.max(0,structure.cooldown/(upgrade.multiplier));
    for(const train of state.trains)if(train.trainType==="combat")train.combatCooldown=Math.max(0,(train.combatCooldown||0)/(upgrade.multiplier));
  }
  if(keyName==="artilleryFireRate")for(const structure of state.structures.values())if(structure.type==="artillery")structure.cooldown=Math.max(0,structure.cooldown/(upgrade.multiplier));
  if(keyName==="turretEnergyStorage")for(const turret of [...state.structures.values()].filter(structure=>structure.type==="turret")){turret.baseMaxEnergy??=20;turret.maxEnergy=Math.ceil(turret.baseMaxEnergy*newMultiplier);turret.energy=Math.ceil(turret.energy);}
  if(keyName==="artilleryEnergyStorage")for(const artillery of [...state.structures.values()].filter(structure=>structure.type==="artillery")){artillery.baseMaxEnergy??=ARTILLERY_MAX_ENERGY;artillery.maxEnergy=Math.ceil(artillery.baseMaxEnergy*newMultiplier);artillery.energy=Math.ceil(artillery.energy);}
  if(keyName==="trainCapacity")for(const train of state.trains)for(const wagon of train.wagons){wagon.baseCapacity??=wagon.capacity/oldMultiplier;wagon.capacity=Math.ceil(wagon.baseCapacity*newMultiplier);}
  if(keyName==="trainSpeed")for(const train of state.trains){train.baseSpeed??=train.speed/oldMultiplier;train.speed=train.baseSpeed*newMultiplier;}
  if(keyName==="loadUnloadEfficiency")for(const train of state.trains)if(train.servicingStop){const remaining=Math.max(0,(train.stopHoldUntil||state.elapsed)-state.elapsed);train.stopHoldUntil=state.elapsed+remaining*upgrade.multiplier;}
  if(keyName==="wallStrength")for(const wall of [...state.structures.values()].filter(structure=>structure.type==="wall")){const ratio=wall.maxHp?wall.hp/wall.maxHp:1;wall.baseMaxHp??=wall.maxHp/oldMultiplier;wall.maxHp=Math.ceil(wall.baseMaxHp*newMultiplier);wall.hp=Math.ceil(wall.maxHp*ratio);}
  if(keyName==="trackStrength")for(const track of state.tracks.values()){const ratio=track.maxHp?track.hp/track.maxHp:1;track.baseMaxHp??=track.maxHp/oldMultiplier;track.maxHp=track.baseMaxHp*newMultiplier;track.hp=track.maxHp*ratio;}
  updateUI(true);render();
}

function purchaseResearchUpgrade(keyName){
  const selected=getSelected(),upgrade=researchUpgrade(keyName);
  if(!upgrade||selected?.type!=="research")return false;
  if(state.researchPoints+1e-9<RESEARCH_UPGRADE_COST)return fail(`Needs ${RESEARCH_UPGRADE_COST} Research points.`);
  state.researchPoints-=RESEARCH_UPGRADE_COST;
  state.researchUpgrades[keyName]=researchUpgradeCount(keyName)+1;
  applyResearchUpgrade(keyName);sounds.place();toast(`${upgrade.label} (${researchUpgradeCount(keyName)}) researched.`,"info");return true;
}

function updateResearch(dt){if(state.researchUnlocked)state.researchPoints+=dt*researchRate();}

function addResearchPoints(amount=1000){
  state.researchPoints+=amount;sounds.place();updateUI(true);toast(`Debug: Added ${amount.toLocaleString()} Research points.`,"info");return amount;
}
