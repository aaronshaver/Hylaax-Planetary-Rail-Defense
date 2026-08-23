"use strict";

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

function adjacentNeutralizerTarget(unit){
  const origin=worldToAxial(unit.x,unit.y);
  return neutralizerTargets(unit).find(target=>hexDistance(origin,target.type==="enemy"?worldToAxial(target.x,target.y):target)<=1)||null;
}

function neutralizerSpawnLocation(building,reservations=neutralizerSpaceReservations()){
  const target=neutralizerTargets({x:structureWorldCenter(building).x,y:structureWorldCenter(building).y})[0],targetPosition=target?(target.type==="enemy"?worldToAxial(target.x,target.y):target):null;
  return footprintPerimeter(structureFootprint(building)).filter(position=>neutralizerCanTraverse(position.q,position.r)&&!creepOccupiesHex(position.q,position.r)&&!trainClaimsHex(position.q,position.r)&&enemyHexHasRoom(reservations,position.q,position.r)).sort((a,b)=>(targetPosition?hexDistance(a,targetPosition)-hexDistance(b,targetPosition):0)||hash(b.q,b.r,state.mapSeed+state.nextId)-hash(a.q,a.r,state.mapSeed+state.nextId))[0]||null;
}

function spawnNeutralizer(building){
  const reservations=neutralizerSpaceReservations(),location=neutralizerSpawnLocation(building,reservations);
  if(!location)return null;
  const unitId=`neutralizer-${state.nextId}`,prototype={id:unitId,moveCount:0},slot=chooseEnemySpaceSlot(reservations,location.q,location.r,prototype);
  if(slot===null)return null;
  const point=enemyWorldPosition(location.q,location.r,slot),maxHp=neutralizerHitPoints(),unit={id:`neutralizer-${state.nextId++}`,type:"neutralizer",q:location.q,r:location.r,slot,x:point.x,y:point.y,fromQ:location.q,fromR:location.r,fromSlot:slot,toQ:location.q,toR:location.r,toSlot:slot,progress:1,moveCount:0,speed:neutralizerSpeed(),hp:maxHp,maxHp,attackClock:0,nextPathAt:0,phase:hash(location.q,location.r,state.nextId)*Math.PI*2};
  state.neutralizers.push(unit);return unit;
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

function neutralizerNextStep(unit,reservations){
  const currentSlot=Number.isInteger(unit.slot)?unit.slot:0;
  releaseEnemySpace(reservations,unit.q,unit.r,currentSlot);
  const passable=(q,r)=>neutralizerCanTraverse(q,r)&&!creepOccupiesHex(q,r)&&enemyHexHasRoom(reservations,q,r);
  let step=null;
  for(const target of neutralizerTargets(unit)){
    const targetPosition=target.type==="enemy"?worldToAxial(target.x,target.y):target;
    const position=findEnemyStep(unit,targetPosition,passable,1);
    if(!position)continue;
    const slot=chooseEnemySpaceSlot(reservations,position.q,position.r,unit);
    if(slot!==null){step={...position,slot};break;}
  }
  reserveEnemySpace(reservations,unit.q,unit.r,currentSlot);return step;
}

function damageNeutralizer(unit,amount){
  unit.hp-=amount;sounds.hit();
  if(unit.hp>0)return false;
  state.neutralizers=state.neutralizers.filter(candidate=>candidate.id!==unit.id);
  if(state.selected?.type==="neutralizer"&&state.selected.id===unit.id)state.selected=null;
  burstAt(unit.x,unit.y,"#4aaee8",7);return true;
}

function updateNeutralizers(dt,initiativeRoll=Math.random){
  updateNeutralizerProduction(dt);
  if(!state.neutralizers.length)return;
  const reservations=neutralizerSpaceReservations();
  for(const unit of [...state.neutralizers]){
    const target=unit.progress>=1?adjacentNeutralizerTarget(unit):null;
    if(target){
      unit.attackClock+=dt;const interval=neutralizerFireInterval(),shots=Math.floor((unit.attackClock+1e-9)/interval);
      if(shots>0){
        const simultaneousCreepShot=target.type==="enemy"&&target.progress>=1&&(target.attackClock||0)+dt+1e-9>=CREEP_ATTACK_INTERVAL&&adjacentEnemyTarget(target)?.id===unit.id;
        if(simultaneousCreepShot&&initiativeRoll()>=.5){unit.attackClock=Math.min(unit.attackClock,interval);continue;}
        unit.attackClock-=shots*interval;const targetPoint=target.type==="enemy"?{x:target.x,y:target.y}:axialToWorld(target.q,target.r);
        state.projectiles.push({x1:unit.x,y1:unit.y,x2:targetPoint.x,y2:targetPoint.y,life:.09,maxLife:.09,color:"#48baff",width:1.7,impactColor:"#a8e5ff"});
        for(let shot=0;shot<shots;shot++)sounds.shot();
        if(target.type==="enemy")damageEnemy(target,shots*neutralizerDamage());else damageTarget(target,shots*neutralizerDamage());
      }
      continue;
    }
    if(unit.progress>=1&&state.elapsed>=(unit.nextPathAt||0)){
      const currentSlot=Number.isInteger(unit.slot)?unit.slot:0,next=neutralizerNextStep(unit,reservations);
      if(next){unit.previousQ=unit.q;unit.previousR=unit.r;unit.fromQ=unit.q;unit.fromR=unit.r;unit.fromSlot=currentSlot;unit.toQ=next.q;unit.toR=next.r;unit.toSlot=next.slot;unit.progress=0;unit.nextPathAt=0;unit.moveCount++;reserveEnemySpace(reservations,next.q,next.r,next.slot);}else unit.nextPathAt=state.elapsed+.25;
    }
    if(unit.progress<1){
      unit.progress=Math.min(1,unit.progress+dt*unit.speed);const a=enemyWorldPosition(unit.fromQ,unit.fromR,unit.fromSlot),b=enemyWorldPosition(unit.toQ,unit.toR,unit.toSlot),eased=unit.progress*unit.progress*(3-2*unit.progress);unit.x=lerp(a.x,b.x,eased);unit.y=lerp(a.y,b.y,eased);
      if(unit.progress>=1){unit.q=unit.toQ;unit.r=unit.toR;unit.slot=unit.toSlot;}
    }
  }
}
