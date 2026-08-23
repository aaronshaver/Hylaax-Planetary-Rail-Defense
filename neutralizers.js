"use strict";

const NEUTRALIZER_TARGET_REFRESH_SECONDS=.9;
const NEUTRALIZER_PATH_SEARCHES_PER_TICK=2;
const NEUTRALIZER_PATH_CACHE_SECONDS=.75;
let neutralizerPathStepCache=new Map(),neutralizerPathCacheVersion=-1;

function neutralizerFootprintCandidates(q,r){return DIRECTIONS.map(([dq,dr])=>[{q,r},{q:q+dq,r:r+dr}]);}

function neutralizerCellAvailable(cell){
  const site=nonMineConstructionSite(cell.q,cell.r);
  return isPassable(cell.q,cell.r)&&site.terrain.type==="ground"&&!structureAt(cell.q,cell.r)&&!hiveAt(cell.q,cell.r)&&!state.tracks.has(key(cell.q,cell.r))&&!trainClaimsHex(cell.q,cell.r)&&!creepOccupiesHex(cell.q,cell.r)&&!neutralizerOccupiesHex(cell.q,cell.r);
}

function neutralizerPlacementFootprint(q,r){return neutralizerFootprintCandidates(q,r).find(footprint=>footprint.every(neutralizerCellAvailable))||null;}
function neutralizerPreviewFootprint(q,r){return neutralizerPlacementFootprint(q,r)||neutralizerFootprintCandidates(q,r)[0];}

function showNeutralizerGateNotice(){
  if(state.neutralizerGateNoticeShown||state.gameOver)return false;
  state.neutralizerGateNoticeShown=true;state.neutralizerGateNoticeWasPaused=state.paused;state.paused=true;simulationAccumulator=0;
  ui.neutralizerGateDialog.hidden=false;ui.neutralizerGateDialog.classList.remove("d-none");updateUI(true);render();setTimeout(()=>ui.neutralizerGateOkay.focus(),0);return true;
}

function dismissNeutralizerGateNotice(){
  if(ui.neutralizerGateDialog.hidden)return false;
  ui.neutralizerGateDialog.hidden=true;ui.neutralizerGateDialog.classList.add("d-none");state.paused=state.neutralizerGateNoticeWasPaused;lastWallTime=Date.now();simulationAccumulator=0;updateUI(true);render();canvas.focus();return true;
}

function buildNeutralizer(q,r){
  const footprint=neutralizerPlacementFootprint(q,r);
  if(!footprint)return fail("Neutralizer buildings need two connected clear ground hexes without creeps or neutralizers.");
  const buildingSite={q,r,footprint};
  if(!requireNearbyTrainStop(buildingSite,1))return null;
  if(!payBase(COSTS.neutralizer,"neutralizer building"))return null;
  const replacedGhosts=new Map();
  for(const cell of footprint){const ghost=ghostAt(cell.q,cell.r);if(ghost)replacedGhosts.set(ghost.id,{ghost,site:nonMineConstructionSite(cell.q,cell.r)});}
  for(const {ghost,site} of replacedGhosts.values())replaceDestroyedSite(ghost,site);
  for(const cell of footprint){const site=nonMineConstructionSite(cell.q,cell.r);if(site.clearDepletedNode)clearDepletedResourceNode(cell.q,cell.r);}
  const maxStorage=neutralizerStorage(),building={id:`neutralizer-building-${state.nextId++}`,type:"neutralizer-building",q,r,footprint:footprint.map(cell=>({...cell})),hp:NEUTRALIZER_BUILDING_HIT_POINTS,maxHp:NEUTRALIZER_BUILDING_HIT_POINTS,material:NEUTRALIZER_BASE_STORAGE,energy:NEUTRALIZER_BASE_STORAGE,maxMaterial:maxStorage,maxEnergy:maxStorage,productionClock:0};
  state.structures.set(key(q,r),building);invalidateEnemyNavigation();
  if(spawnNeutralizer(building)){building.material-=NEUTRALIZER_UNIT_MATERIAL_COST;building.energy-=NEUTRALIZER_UNIT_ENERGY_COST;}
  sounds.place();for(const cell of footprint)burst(cell.q,cell.r,"#ef9b54",8);select("structure",building.id);showNeutralizerGateNotice();return building;
}

function neutralizerSpaceReservations(excludeId=null){
  const reservations=new Map();
  for(const unit of state.neutralizers){
    if(unit.id===excludeId)continue;
    const slot=Number.isInteger(unit.slot)?unit.slot:0;reserveEnemySpace(reservations,unit.q,unit.r,slot);
    if(unit.progress<1)reserveEnemySpace(reservations,unit.toQ,unit.toR,Number.isInteger(unit.toSlot)?unit.toSlot:slot);
  }
  return reservations;
}

function neutralizerCanTraverse(q,r){
  if(!isPassable(q,r)||hiveAt(q,r))return false;
  const structure=structureAt(q,r);
  return !structure||structure.type==="gate";
}

function neutralizerTargets(unit){
  const origin=worldToAxial(unit.x,unit.y),targets=[...state.enemies,...state.hives.values()];
  return targets.sort((a,b)=>{
    const aPosition=a.type==="enemy"?worldToAxial(a.x,a.y):a,bPosition=b.type==="enemy"?worldToAxial(b.x,b.y):b;
    return hexDistance(origin,aPosition)-hexDistance(origin,bPosition)||(a.type==="enemy"?-1:1)-(b.type==="enemy"?-1:1);
  });
}

function neutralizerTargetLookup(){
  const targets=new Map();
  for(const enemy of state.enemies)if(enemy.hp>0)targets.set(enemy.id,enemy);
  for(const hive of state.hives.values())if(hive.hp>0)targets.set(hive.id,hive);
  return targets;
}

function neutralizerTargetPosition(target){return target.type==="enemy"?worldToAxial(target.x,target.y):target;}

function neutralizerPathCacheKey(unit,targetPosition){return `${state.mapSeed}|${enemyNavigationVersion}|${unit.q},${unit.r}|${targetPosition.q},${targetPosition.r}`;}

function cachedNeutralizerPathStep(unit,targetPosition,passable,pathBudget){
  if(neutralizerPathCacheVersion!==enemyNavigationVersion){neutralizerPathStepCache.clear();neutralizerPathCacheVersion=enemyNavigationVersion;}
  const cacheKey=neutralizerPathCacheKey(unit,targetPosition),cached=neutralizerPathStepCache.get(cacheKey);
  if(cached&&cached.until>=state.elapsed&&passable(cached.position.q,cached.position.r))return cached.position;
  if(cached)neutralizerPathStepCache.delete(cacheKey);
  if(pathBudget&&pathBudget.remaining<=0)return false;
  if(pathBudget)pathBudget.remaining--;
  const position=findEnemyStep(unit,targetPosition,passable,1);
  if(position){
    if(neutralizerPathStepCache.size>=2048)neutralizerPathStepCache.clear();
    neutralizerPathStepCache.set(cacheKey,{position,until:state.elapsed+NEUTRALIZER_PATH_CACHE_SECONDS});
  }
  return position;
}

function cachedNeutralizerTarget(unit,targetById=neutralizerTargetLookup()){
  const cached=targetById.get(unit.targetId),refreshAt=unit.targetRefreshAt||0;
  if(cached&&cached.hp>0&&state.elapsed<refreshAt)return cached;
  const origin=worldToAxial(unit.x,unit.y),failedTargets=unit.failedTargets||{};
  for(const [targetId,until] of Object.entries(failedTargets))if(state.elapsed>=until)delete failedTargets[targetId];
  let best=null,bestDistance=Infinity,bestPriority=Infinity;
  for(const target of targetById.values()){
    if((failedTargets[target.id]||0)>state.elapsed||target.hp<=0)continue;
    const distance=hexDistance(origin,neutralizerTargetPosition(target)),priority=target.type==="enemy"?0:1;
    if(distance<bestDistance||(distance===bestDistance&&priority<bestPriority)){best=target;bestDistance=distance;bestPriority=priority;}
  }
  const unitNumber=Number(unit.id?.replace(/\D/g,""))||0;
  unit.targetId=best?.id||null;unit.targetRefreshAt=state.elapsed+NEUTRALIZER_TARGET_REFRESH_SECONDS+hash(unit.q,unit.r,state.mapSeed+unitNumber)*.2;
  return best;
}

function adjacentNeutralizerTarget(unit,enemyIndex=null,proximity=null){
  const origin=worldToAxial(unit.x,unit.y);
  const candidates=enemyIndex?indexedUnitsInRange(enemyIndex,origin.q,origin.r,1):state.enemies.filter(enemy=>enemy.hp>0);
  let best=null,bestDistance=Infinity,bestPriority=Infinity;
  for(const target of [...candidates,...state.hives.values()]){
    if(target.hp<=0)continue;
    const distance=hexDistance(origin,neutralizerTargetPosition(target)),priority=target.type==="enemy"?0:1;
    if(distance<=1&&(distance<bestDistance||(distance===bestDistance&&priority<bestPriority))){best=target;bestDistance=distance;bestPriority=priority;}
  }
  if(proximity&&enemyIndex?.destinations)for(const enemy of indexedUnitsInRange(enemyIndex.destinations,origin.q,origin.r,1)){
    if(hexDistance(origin,worldToAxial(enemy.x,enemy.y))>1){proximity.incoming=enemy;break;}
  }
  return best;
}

function neutralizerSpawnLocation(building,reservations=neutralizerSpaceReservations()){
  const target=neutralizerTargets({x:structureWorldCenter(building).x,y:structureWorldCenter(building).y})[0],targetPosition=target?(target.type==="enemy"?worldToAxial(target.x,target.y):target):null;
  return footprintPerimeter(structureFootprint(building)).filter(position=>neutralizerCanTraverse(position.q,position.r)&&!creepOccupiesHex(position.q,position.r)&&!trainClaimsHex(position.q,position.r)&&enemyHexHasRoom(reservations,position.q,position.r)).sort((a,b)=>(targetPosition?hexDistance(a,targetPosition)-hexDistance(b,targetPosition):0)||hash(b.q,b.r,state.mapSeed+state.nextId)-hash(a.q,a.r,state.mapSeed+state.nextId))[0]||null;
}

function spawnNeutralizerAt(q,r,spawnNumber=state.nextId,reservations=neutralizerSpaceReservations()){
  if(!neutralizerCanTraverse(q,r)||creepOccupiesHex(q,r)||trainClaimsHex(q,r)||!enemyHexHasRoom(reservations,q,r))return null;
  const unitId=`neutralizer-${state.nextId}`,prototype={id:unitId,moveCount:0},slot=chooseEnemySpaceSlot(reservations,q,r,prototype);
  if(slot===null)return null;
  const point=enemyWorldPosition(q,r,slot),maxHp=neutralizerHitPoints(),unit={id:`neutralizer-${state.nextId++}`,type:"neutralizer",q,r,slot,x:point.x,y:point.y,fromQ:q,fromR:r,fromSlot:slot,toQ:q,toR:r,toSlot:slot,progress:1,moveCount:0,speed:neutralizerSpeed(),hp:maxHp,maxHp,attackClock:0,nextPathAt:0,phase:hash(q,r,spawnNumber)*Math.PI*2};
  state.neutralizers.push(unit);return unit;
}

function spawnNeutralizer(building){
  const reservations=neutralizerSpaceReservations(),location=neutralizerSpawnLocation(building,reservations);
  return location?spawnNeutralizerAt(location.q,location.r,state.nextId,reservations):null;
}

function debugAddMaxNeutralizersAt(q,r){
  let added=0;
  for(const position of [{q,r},...neighbors(q,r)])for(let count=0;count<CREEP_HEX_CAPACITY&&spawnNeutralizerAt(position.q,position.r,state.nextId);count++)added++;
  if(!added)return fail("Cannot add neutralizers on that big hex.");
  updateUI(true);render();toast(`Debug: Added ${added} neutralizer${added===1?"":"s"}.`,"info");return added;
}

function updateNeutralizerProduction(dt){
  for(const building of state.structures.values()){
    if(building.type!=="neutralizer-building")continue;
    if(building.material<NEUTRALIZER_UNIT_MATERIAL_COST||building.energy<NEUTRALIZER_UNIT_ENERGY_COST){building.productionClock=0;continue;}
    building.productionClock+=dt;
    const interval=neutralizerProductionInterval();
    for(let produced=0;building.productionClock+1e-9>=interval&&produced<16;produced++){
      const unit=spawnNeutralizer(building);if(!unit){building.productionClock=Math.min(building.productionClock,interval);break;}
      building.productionClock-=interval;building.material-=NEUTRALIZER_UNIT_MATERIAL_COST;building.energy-=NEUTRALIZER_UNIT_ENERGY_COST;
    }
  }
}

function neutralizerNextStep(unit,reservations,enemyIndex=null,targetById=null,pathBudget=null){
  const currentSlot=Number.isInteger(unit.slot)?unit.slot:0;
  releaseEnemySpace(reservations,unit.q,unit.r,currentSlot);
  const target=cachedNeutralizerTarget(unit,targetById||neutralizerTargetLookup());
  if(!target){reserveEnemySpace(reservations,unit.q,unit.r,currentSlot);return null;}
  const passable=(q,r)=>neutralizerCanTraverse(q,r)&&!creepOccupiesHex(q,r,enemyIndex)&&enemyHexHasRoom(reservations,q,r);
  const position=cachedNeutralizerPathStep(unit,neutralizerTargetPosition(target),passable,pathBudget);
  if(position===false){reserveEnemySpace(reservations,unit.q,unit.r,currentSlot);return false;}
  let step=null;
  if(position){
    const slot=chooseEnemySpaceSlot(reservations,position.q,position.r,unit);
    if(slot!==null)step={...position,slot};
  }
  if(!step){
    unit.failedTargets??={};unit.failedTargets[target.id]=state.elapsed+1;unit.targetId=null;unit.targetRefreshAt=0;
  }
  reserveEnemySpace(reservations,unit.q,unit.r,currentSlot);return step;
}

let deferNeutralizerRemoval=false,neutralizerRemovalPending=false;
function compactDeadNeutralizers(){if(!neutralizerRemovalPending)return;state.neutralizers=state.neutralizers.filter(unit=>unit.hp>0);neutralizerRemovalPending=false;}

function damageNeutralizer(unit,amount){
  if(unit.hp<=0)return false;
  unit.hp-=amount;
  if(unit.hp>0)return false;
  neutralizerRemovalPending=true;
  if(!deferNeutralizerRemoval)compactDeadNeutralizers();
  if(state.selected?.type==="neutralizer"&&state.selected.id===unit.id)state.selected=null;
  addUnitDeathFlash("neutralizer-death-x",unit.x,unit.y,"#4bbcff");return true;
}

function updateNeutralizers(dt,initiativeRoll=Math.random){
  updateNeutralizerProduction(dt);
  if(!state.neutralizers.length)return;
  const units=[...state.neutralizers],start=(state.neutralizerPathCursor||0)%units.length;
  state.neutralizerPathCursor=(start+NEUTRALIZER_PATH_SEARCHES_PER_TICK)%units.length;
  const reservations=neutralizerSpaceReservations(),enemyIndex=unitHexIndex(state.enemies),neutralizerIndex=unitHexIndex(units),targetById=neutralizerTargetLookup(),pathBudget={remaining:NEUTRALIZER_PATH_SEARCHES_PER_TICK};
  deferEnemyRemoval=true;
  try{for(let offset=0;offset<units.length;offset++){
    const unit=units[(start+offset)%units.length];
    const proximity={},target=unit.progress>=1?adjacentNeutralizerTarget(unit,enemyIndex,proximity):null;
    if(target){
      unit.attackClock+=dt;const interval=neutralizerFireInterval(),shots=Math.floor((unit.attackClock+1e-9)/interval);
      if(shots>0){
        const simultaneousCreepShot=target.type==="enemy"&&target.progress>=1&&(target.attackClock||0)+dt+1e-9>=CREEP_ATTACK_INTERVAL&&adjacentEnemyTarget(target,neutralizerIndex)?.id===unit.id;
        if(simultaneousCreepShot&&initiativeRoll()>=.5){unit.attackClock=Math.min(unit.attackClock,interval);continue;}
        unit.attackClock-=shots*interval;const targetPoint=target.type==="enemy"?{x:target.x,y:target.y}:axialToWorld(target.q,target.r);
        addCombatBeam("neutralizer-beam",{x1:unit.x,y1:unit.y,x2:targetPoint.x,y2:targetPoint.y,life:.09,maxLife:.09,color:"#48baff",width:1.7,impactColor:"#a8e5ff"});
        if(target.type==="enemy")damageEnemy(target,shots*neutralizerDamage());else damageTarget(target,shots*neutralizerDamage(),{silent:true});
      }
      continue;
    }
    if(unit.progress>=1&&proximity.incoming)continue;
    if(unit.progress>=1&&state.elapsed>=(unit.nextPathAt||0)){
      const currentSlot=Number.isInteger(unit.slot)?unit.slot:0,next=neutralizerNextStep(unit,reservations,enemyIndex,targetById,pathBudget);
      if(next===false)continue;
      if(next){unit.previousQ=unit.q;unit.previousR=unit.r;unit.fromQ=unit.q;unit.fromR=unit.r;unit.fromSlot=currentSlot;unit.toQ=next.q;unit.toR=next.r;unit.toSlot=next.slot;unit.progress=0;unit.nextPathAt=0;unit.moveCount++;reserveEnemySpace(reservations,next.q,next.r,next.slot);}else unit.nextPathAt=state.elapsed+.25;
    }
    if(unit.progress<1){
      unit.progress=Math.min(1,unit.progress+dt*unit.speed);const a=enemyWorldPosition(unit.fromQ,unit.fromR,unit.fromSlot),b=enemyWorldPosition(unit.toQ,unit.toR,unit.toSlot),eased=unit.progress*unit.progress*(3-2*unit.progress);unit.x=lerp(a.x,b.x,eased);unit.y=lerp(a.y,b.y,eased);
      if(unit.progress>=1){unit.q=unit.toQ;unit.r=unit.toR;unit.slot=unit.toSlot;}
    }
  }}finally{deferEnemyRemoval=false;compactDeadEnemies();}
}
