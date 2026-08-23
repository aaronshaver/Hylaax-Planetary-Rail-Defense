"use strict";

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

function hiveSpawnDelay(q,r,spawnNumber=0,spawnTime=state.elapsed){return Math.min(15,1+Math.floor(hash(q,r,(state.mapSeed+spawnNumber*2377+Math.floor(spawnTime*1000))|0)*15));}

function queueHiveSpawn(location,{kind="replication",level=2,spawnNumber=0,spawnTime=state.elapsed,sourceHiveId=null,forceFirstCreepBatch=false,encroachmentMinute=null}={}){
  if(!location)return null;
  const delay=hiveSpawnDelay(location.q,location.r,spawnNumber,spawnTime),operation={kind,q:location.q,r:location.r,level,spawnNumber,spawnTime,sourceHiveId,forceFirstCreepBatch,encroachmentMinute,delay,executeAt:state.elapsed+delay};
  state.hiveSpawnQueue.push(operation);state.hiveSpawnQueue.sort((a,b)=>a.executeAt-b.executeAt||a.q-b.q||a.r-b.r);return operation;
}

function spawnHiveNear(hive,spawnNumber=hive.spawnCount,level=hiveExpansionLevel(hive,state.elapsed)){
  const constructionAnchors=playerConstructionAnchors(),location=hiveSpawnCandidates(hive,spawnNumber).find(candidate=>hiveHexOpen(candidate.q,candidate.r,constructionAnchors));
  return queueHiveSpawn(location,{kind:"replication",level,spawnNumber,spawnTime:state.elapsed,sourceHiveId:hive.id});
}

function spawnEnemyAt(q,r,spawnNumber=state.nextId){
  const reservations=enemySpaceReservations(),enemyId=`enemy-${state.nextId}`;
  if(!isPassable(q,r)||hiveAt(q,r)||(state.hiveSpawnQueue||[]).some(operation=>operation.q===q&&operation.r===r)||structureAt(q,r)||trainAt(q,r)||neutralizerOccupiesHex(q,r)||!enemyHexHasRoom(reservations,q,r))return null;
  const slot=chooseEnemySpaceSlot(reservations,q,r,{id:enemyId,moveCount:spawnNumber});
  if(slot===null)return null;
  const p=enemyWorldPosition(q,r,slot),enemy={id:`enemy-${state.nextId++}`,type:"enemy",q,r,slot,x:p.x,y:p.y,fromQ:q,fromR:r,fromSlot:slot,toQ:q,toR:r,toSlot:slot,progress:1,moveCount:0,speed:ENEMY_SPEED,hp:1,maxHp:1,attackClock:0,nextPathAt:0,phase:hash(q,r,spawnNumber)*Math.PI*2};
  state.enemies.push(enemy);return enemy;
}

function debugAddCreepAt(q,r){
  const enemy=spawnEnemyAt(q,r,state.nextId);
  if(!enemy)return fail("Cannot add a creep on that hex.");
  updateUI(true);render();toast("Debug: Creep added.","info");return enemy;
}

function spawnEnemyFromHive(hive,spawnNumber=hive.spawnCount){
  const reservations=enemySpaceReservations(),constructionAnchors=playerConstructionAnchors();
  const options=[];
  for(let dq=-4;dq<=4;dq++){
    const r0=Math.max(-4,-dq-4),r1=Math.min(4,-dq+4);
    for(let dr=r0;dr<=r1;dr++){
      const distance=hexDistance({q:0,r:0},{q:dq,r:dr});
      if(distance<1||distance>4)continue;
      const position={q:hive.q+dq,r:hive.r+dr};
      if(isPassable(position.q,position.r)&&terrainCanReachBase(position.q,position.r)&&outsidePlayerConstructionBuffer(position.q,position.r,ENEMY_SPAWN_BUFFER,constructionAnchors)&&!hiveAt(position.q,position.r)&&!(state.hiveSpawnQueue||[]).some(operation=>operation.q===position.q&&operation.r===position.r)&&!structureAt(position.q,position.r)&&!neutralizerOccupiesHex(position.q,position.r)&&enemyHexHasRoom(reservations,position.q,position.r))options.push(position);
    }
  }
  options.sort((a,b)=>hash(b.q,b.r,(state.mapSeed+spawnNumber)|0)-hash(a.q,a.r,(state.mapSeed+spawnNumber)|0));
  const location=options[0];return location?spawnEnemyAt(location.q,location.r,spawnNumber):null;
}

function creepSpawnDelay(q,r,spawnNumber=0,spawnTime=state.elapsed){return Math.min(15,1+Math.floor(hash(q,r,(state.mapSeed+spawnNumber*4211+Math.floor(spawnTime*1000))|0)*15));}

function queueCreepBatch(hive,count,spawnNumber,spawnTime=state.elapsed){
  const delay=creepSpawnDelay(hive.q,hive.r,spawnNumber,spawnTime),operation={kind:"creep-batch",hiveId:hive.id,q:hive.q,r:hive.r,count,spawnNumber,spawnTime,delay,executeAt:state.elapsed+delay};
  state.creepSpawnQueue.push(operation);state.creepSpawnQueue.sort((a,b)=>a.executeAt-b.executeAt||a.spawnNumber-b.spawnNumber);return operation;
}

function processCreepSpawnQueue(){
  let processed=0;
  while(state.creepSpawnQueue.length&&state.creepSpawnQueue[0].executeAt<=state.elapsed+1e-9){
    const operation=state.creepSpawnQueue.shift(),source=[...state.hives.values()].find(candidate=>candidate.id===operation.hiveId);let spawned=false;
    for(let creep=0;creep<operation.count;creep++)spawned=Boolean(spawnEnemyFromHive(operation,operation.spawnNumber*32+creep))||spawned;
    if(spawned&&source)source.productionPulseUntil=state.elapsed+.75;
    processed++;
  }
  return processed;
}

function encroachingHiveLocation(spawnTime=state.nextEncroachmentAt){
  const minute=Math.floor(spawnTime/60),anchors=playerConstructionAnchors().sort((a,b)=>hash(b.q,b.r,state.mapSeed+minute*1223)-hash(a.q,a.r,state.mapSeed+minute*1223));
  for(const anchor of anchors){
    const preferred=6+Math.floor(hash(anchor.q,anchor.r,state.mapSeed+minute*2371)*9);
    const distances=Array.from({length:9},(_,index)=>6+index).sort((a,b)=>Math.abs(a-preferred)-Math.abs(b-preferred)||hash(anchor.q,a,state.mapSeed+minute)-hash(anchor.q,b,state.mapSeed+minute));
    for(const distance of distances){
      const candidates=[];
      for(let dq=-distance;dq<=distance;dq++)for(let dr=Math.max(-distance,-dq-distance);dr<=Math.min(distance,-dq+distance);dr++){
        if(hexDistance({q:0,r:0},{q:dq,r:dr})!==distance)continue;
        const q=anchor.q+dq,r=anchor.r+dr;
        candidates.push({q,r,score:hash(q,r,state.mapSeed+minute*3571)});
      }
      candidates.sort((a,b)=>b.score-a.score);
      const open=candidates.find(candidate=>hiveHexOpen(candidate.q,candidate.r,anchors));
      if(open)return {...open,anchor,distance};
    }
  }
  return null;
}

function spawnEncroachingHive(spawnTime=state.nextEncroachmentAt,spawnNumber=0){
  const location=encroachingHiveLocation(spawnTime);
  if(!location)return null;
  return queueHiveSpawn(location,{kind:"encroachment",level:hiveUnlockedLevel(spawnTime),spawnNumber,spawnTime,forceFirstCreepBatch:true,encroachmentMinute:Math.floor(spawnTime/60)});
}

function encroachingHiveCount(spawnTime=state.nextEncroachmentAt){
  return spawnTime>=300?Math.floor(spawnTime/60)-4:0;
}

function encroachmentOccurs(spawnTime=state.nextEncroachmentAt,mapSeed=state.mapSeed){return hash(Math.floor(spawnTime/60),mapSeed|0,8171)<.5;}

function updateEncroachingHives(){
  for(let cycles=0;state.elapsed>=state.nextEncroachmentAt&&cycles<64;cycles++){
    const spawnTime=state.nextEncroachmentAt,count=encroachmentOccurs(spawnTime)?encroachingHiveCount(spawnTime):0;
    for(let index=0;index<count;index++)spawnEncroachingHive(spawnTime,index);
    state.nextEncroachmentAt+=60;
  }
}

function processHiveSpawnQueue(){
  let spawned=0;
  while(state.hiveSpawnQueue.length&&state.hiveSpawnQueue[0].executeAt<=state.elapsed+1e-9){
    const operation=state.hiveSpawnQueue.shift(),constructionAnchors=playerConstructionAnchors();let location=operation;
    if(!hiveHexOpen(location.q,location.r,constructionAnchors)){
      if(operation.kind==="encroachment")location=encroachingHiveLocation(operation.spawnTime);
      else location=hiveSpawnCandidates(operation,operation.spawnNumber).find(candidate=>hiveHexOpen(candidate.q,candidate.r,constructionAnchors));
    }
    if(!location)continue;
    const hive=createHive(location.q,location.r,operation.level,true,operation.forceFirstCreepBatch);
    if(operation.kind==="encroachment"){hive.encroaching=true;hive.encroachmentMinute=operation.encroachmentMinute;}
    const source=[...state.hives.values()].find(candidate=>candidate.id===operation.sourceHiveId);if(source)source.productionPulseUntil=state.elapsed+.75;
    spawned++;
  }
  return spawned;
}

function hiveProductionDelay(hive,spawnNumber){return .05+hash(hive.q,hive.r,(state.mapSeed+spawnNumber*1877)|0)*.15;}

function queueDueHiveProductions(){
  const due=[];
  for(const hive of [...state.hives.values()]){
    for(let cycles=0;state.elapsed>=hive.nextSpawnAt&&cycles<32;cycles++){
      const spawnTime=hive.nextSpawnAt,spawnNumber=hive.spawnCount++;
      const forceCreepBatch=hive.forceFirstCreepBatch&&spawnNumber===0;
      if(forceCreepBatch)hive.forceFirstCreepBatch=false;
      due.push({hiveId:hive.id,q:hive.q,r:hive.r,spawnTime,spawnNumber,forceCreepBatch,order:hash(hive.q,hive.r,(state.mapSeed+Math.floor(spawnTime*1000))|0)});
      hive.nextSpawnAt=(Math.floor(spawnTime/60)+1)*60;
    }
  }
  due.sort((a,b)=>a.spawnTime-b.spawnTime||a.order-b.order);
  let availableAt=Math.max(state.elapsed,state.hiveProductionAvailableAt||0);
  for(const operation of due){operation.executeAt=availableAt;state.hiveProductionQueue.push(operation);const hive=state.hives.get(key(operation.q,operation.r));availableAt+=hiveProductionDelay(hive||operation,operation.spawnNumber);}
  if(due.length)state.hiveProductionAvailableAt=availableAt;
  return due.length;
}

function produceHiveOperation(operation){
  const hive=state.hives.get(key(operation.q,operation.r));
  if(!hive||hive.id!==operation.hiveId)return false;
  const rate=hive.level;let produced=false,hiveSpawnQueued=null;
  if(!operation.forceCreepBatch&&hiveReplicationRoll(hive,operation.spawnNumber,rate))hiveSpawnQueued=spawnHiveNear(hive,operation.spawnNumber,hiveExpansionLevel(hive,operation.spawnTime));
  if(hiveSpawnQueued)produced=true;
  else produced=Boolean(queueCreepBatch(hive,rate,operation.spawnNumber,operation.spawnTime));
  return produced;
}

function processHiveProductionQueue(){
  let processed=0;
  while(state.hiveProductionQueue.length&&state.hiveProductionQueue[0].executeAt<=state.elapsed+1e-9){produceHiveOperation(state.hiveProductionQueue.shift());processed++;}
  return processed;
}

function updateHives(){
  processHiveSpawnQueue();processCreepSpawnQueue();updateEncroachingHives();queueDueHiveProductions();processHiveProductionQueue();
}

function targetHexFor(enemy,target) {
  if (!target.wagons) return target;
  return trainSegments(target).slice().sort((a,b)=>hexDistance(enemy,a)-hexDistance(enemy,b))[0];
}

function enemySlotOffset(slot=0){
  if(slot===0)return {x:0,y:0};
  const angle=-Math.PI/2+(slot-1)*Math.PI/3;
  return {x:Math.cos(angle)*CREEP_SLOT_RADIUS,y:Math.sin(angle)*CREEP_SLOT_RADIUS};
}

function enemyWorldPosition(q,r,slot=0){const center=axialToWorld(q,r),offset=enemySlotOffset(slot);return {x:center.x+offset.x,y:center.y+offset.y};}

function reserveEnemySpace(reservations,q,r,slot){
  const positionKey=key(q,r),slots=reservations.get(positionKey)||new Set();
  slots.add(slot);reservations.set(positionKey,slots);
}

function releaseEnemySpace(reservations,q,r,slot){
  const positionKey=key(q,r),slots=reservations.get(positionKey);if(!slots)return;
  slots.delete(slot);if(!slots.size)reservations.delete(positionKey);
}

function enemySpaceReservations(excludeId=null){
  const reservations=new Map();
  for(const enemy of state.enemies){
    if(enemy.id===excludeId)continue;
    const slot=Number.isInteger(enemy.slot)?enemy.slot:0;
    reserveEnemySpace(reservations,enemy.q,enemy.r,slot);
    if(enemy.progress<1)reserveEnemySpace(reservations,enemy.toQ,enemy.toR,Number.isInteger(enemy.toSlot)?enemy.toSlot:slot);
  }
  return reservations;
}

function enemyHexHasRoom(reservations,q,r){return (reservations.get(key(q,r))?.size||0)<CREEP_HEX_CAPACITY;}

function chooseEnemySpaceSlot(reservations,q,r,enemy,salt=0){
  const occupied=reservations.get(key(q,r))||new Set(),available=[];
  for(let slot=0;slot<CREEP_HEX_CAPACITY;slot++)if(!occupied.has(slot))available.push(slot);
  if(!available.length)return null;
  const enemyNumber=Number(enemy.id?.replace(/\D/g,""))||0,roll=hash(q,r,(state.mapSeed+enemyNumber*7919+(enemy.moveCount||0)*3571+salt)|0);
  return available[Math.min(available.length-1,Math.floor(roll*available.length))];
}

function invalidateEnemyNavigation(){enemyNavigationVersion++;}

function resetEnemyNavigation(){
  enemyNavigationVersion++;
  enemyNavigationCache={signature:"",distances:new Map(),targetKeys:new Set(),bounds:null,builds:0};
}

function enemyNavigationSignature(){return `${enemyNavigationVersion}|${state.base.q},${state.base.r}|${state.structures.size}`;}

function rebuildEnemyNavigation(){
  const targets=[state.base,...state.structures.values()],targetCells=targets.flatMap(target=>structureFootprint(target)),targetKeys=new Set(targetCells.map(target=>key(target.q,target.r)));
  const points=[...targetCells,...state.enemies];
  if(!points.length){enemyNavigationCache={signature:enemyNavigationSignature(),distances:new Map(),targetKeys,bounds:null,builds:enemyNavigationCache.builds+1};return enemyNavigationCache;}
  let baseMinQ=Infinity,baseMaxQ=-Infinity,baseMinR=Infinity,baseMaxR=-Infinity;
  for(const point of points){baseMinQ=Math.min(baseMinQ,point.q);baseMaxQ=Math.max(baseMaxQ,point.q);baseMinR=Math.min(baseMinR,point.r);baseMaxR=Math.max(baseMaxR,point.r);}
  let distances=new Map(),bounds=null;
  for(const margin of [8,24,64]){
    bounds={minQ:baseMinQ-margin,maxQ:baseMaxQ+margin,minR:baseMinR-margin,maxR:baseMaxR+margin};
    const inBounds=(q,r)=>q>=bounds.minQ&&q<=bounds.maxQ&&r>=bounds.minR&&r<=bounds.maxR;
    const passable=(q,r)=>inBounds(q,r)&&isPassable(q,r)&&!targetKeys.has(key(q,r));
    distances=new Map();const queue=[];
    for(const target of targetCells)for(const position of neighbors(target.q,target.r)){
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

function nextEnemyNavigationStep(enemy,reservations){
  const navigation=enemyNavigationCache,currentDistance=navigation.distances.get(key(enemy.q,enemy.r));
  if(currentDistance===undefined)return null;
  const enemyNumber=Number(enemy.id.replace(/\D/g,""))||0;
  const options=neighbors(enemy.q,enemy.r).filter(position=>{
    const positionKey=key(position.q,position.r);
    return enemyHexHasRoom(reservations,position.q,position.r)&&!neutralizerOccupiesHex(position.q,position.r)&&!navigation.targetKeys.has(positionKey)&&navigation.distances.has(positionKey);
  }).map(position=>({...position,slot:chooseEnemySpaceSlot(reservations,position.q,position.r,enemy),distance:navigation.distances.get(key(position.q,position.r)),score:hash(position.q,position.r,(state.mapSeed+enemyNumber*7919)|0)}));
  options.sort((a,b)=>a.distance-b.distance||a.score-b.score);
  const forward=options.find(option=>option.distance<currentDistance);
  if(forward)return forward;
  const notBacktracking=option=>option.q!==enemy.previousQ||option.r!==enemy.previousR;
  return options.find(option=>option.distance===currentDistance&&notBacktracking(option))||options.find(option=>option.distance===currentDistance+1&&notBacktracking(option))||null;
}

function adjacentEnemyTarget(enemy){
  const neutralizer=state.neutralizers.filter(unit=>hexDistance(enemy,worldToAxial(unit.x,unit.y))<=1).sort((a,b)=>hexDistance(enemy,worldToAxial(a.x,a.y))-hexDistance(enemy,worldToAxial(b.x,b.y)))[0];
  if(neutralizer)return neutralizer;
  if(distanceToStructure(enemy,state.base)<=1)return state.base;
  const positions=[{q:enemy.q,r:enemy.r},...neighbors(enemy.q,enemy.r)];
  for(const position of positions){const structure=structureAt(position.q,position.r);if(structure&&structure.type!=="base")return structure;}
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
  if(target.footprint)ghost.footprint=target.footprint.map(cell=>({...cell}));
  if(objectType==="track"){
    ghost.hp=0;ghost.maxHp=trackHitPoints();
    ghost.links=[...target.links];
    for(const neighborGhost of state.ghosts.values())if(neighborGhost.objectType==="track"&&(neighborGhost.links||[]).includes(ghost.id)&&!ghost.links.includes(neighborGhost.id))ghost.links.push(neighborGhost.id);
  }
  if(objectType==="mine")ghost.resource=target.resource;
  state.ghosts.set(ghost.id,ghost);
  return ghost;
}

function rebuiltLabel(ghost){
  if(ghost.objectType==="track")return "track";
  if(ghost.objectType==="turret")return "turret";
  if(ghost.objectType==="artillery")return "artillery";
  if(ghost.objectType==="wall")return "wall";
  if(ghost.objectType==="gate")return "gate";
  if(ghost.objectType==="research")return "research";
  if(ghost.objectType==="neutralizer-building")return "neutralizer building";
  return `${resourceLabel(ghost.resource)} mine`;
}

function rebuildGhost(ghost,train){
  const cost=REBUILD_COSTS[ghost.objectType];
  if(totalCargo(train,"material")<cost)return false;
  removeCargo(train,"material",cost);
  let rebuilt;
  if(ghost.objectType==="track"){
    const maxHp=trackHitPoints();rebuilt={q:ghost.q,r:ghost.r,hp:maxHp,maxHp,baseMaxHp:TRACK_HIT_POINTS,links:new Set()};
    state.tracks.set(ghost.id,rebuilt);
    for(const linkedKey of ghost.links||[]){
      const neighbor=state.tracks.get(linkedKey);
      if(neighbor){rebuilt.links.add(linkedKey);neighbor.links.add(ghost.id);}else{const neighborGhost=state.ghosts.get(linkedKey);if(neighborGhost?.objectType==="track"&&!neighborGhost.links.includes(ghost.id))neighborGhost.links.push(ghost.id);}
    }
  }else if(ghost.objectType==="turret"){
    rebuilt={id:`turret-${state.nextId++}`,type:"turret",q:ghost.q,r:ghost.r,hp:TURRET_HIT_POINTS,maxHp:TURRET_HIT_POINTS,energy:0,maxEnergy:turretEnergyStorage(),baseMaxEnergy:20,cooldown:0};
    state.structures.set(ghost.id,rebuilt);
  }else if(ghost.objectType==="wall"){
    const maxHp=wallHitPoints();rebuilt={id:`wall-${state.nextId++}`,type:"wall",q:ghost.q,r:ghost.r,hp:maxHp,maxHp,baseMaxHp:WALL_HIT_POINTS};
    state.structures.set(ghost.id,rebuilt);
  }else if(ghost.objectType==="gate"){
    const maxHp=wallHitPoints();rebuilt={id:`gate-${state.nextId++}`,type:"gate",q:ghost.q,r:ghost.r,hp:maxHp,maxHp,baseMaxHp:WALL_HIT_POINTS};
    state.structures.set(ghost.id,rebuilt);
  }else if(ghost.objectType==="artillery"){
    rebuilt={id:`artillery-${state.nextId++}`,type:"artillery",q:ghost.q,r:ghost.r,hp:ARTILLERY_HIT_POINTS,maxHp:ARTILLERY_HIT_POINTS,energy:0,maxEnergy:artilleryEnergyStorage(),baseMaxEnergy:ARTILLERY_MAX_ENERGY,cooldown:0,showRangeUntil:state.elapsed+3.5};
    state.structures.set(ghost.id,rebuilt);
  }else if(ghost.objectType==="research"){
    rebuilt={id:`research-${state.nextId++}`,type:"research",q:ghost.q,r:ghost.r,footprint:structureFootprint(ghost).map(cell=>({...cell})),hp:RESEARCH_HIT_POINTS,maxHp:RESEARCH_HIT_POINTS};
    state.structures.set(ghost.id,rebuilt);state.researchUnlocked=true;
  }else if(ghost.objectType==="neutralizer-building"){
    const maxStorage=neutralizerStorage();rebuilt={id:`neutralizer-building-${state.nextId++}`,type:"neutralizer-building",q:ghost.q,r:ghost.r,footprint:structureFootprint(ghost).map(cell=>({...cell})),hp:NEUTRALIZER_BUILDING_HIT_POINTS,maxHp:NEUTRALIZER_BUILDING_HIT_POINTS,material:0,energy:0,maxMaterial:maxStorage,maxEnergy:maxStorage,productionClock:0};
    state.structures.set(ghost.id,rebuilt);
  }else{
    rebuilt={id:`mine-${state.nextId++}`,type:"mine",resource:ghost.resource,q:ghost.q,r:ghost.r,hp:22,maxHp:22};
    state.structures.set(ghost.id,rebuilt);
  }
  invalidateEnemyNavigation();
  state.ghosts.delete(ghost.id);
  if(state.selected?.type==="ghost"&&state.selected.id===ghost.id)state.selected=ghost.objectType==="track"?{type:"track",id:ghost.id}:{type:"structure",id:rebuilt.id};
  sounds.place();burst(ghost.q,ghost.r,ghost.objectType==="turret"?"#65dbe0":ghost.objectType==="artillery"?"#ef9b54":ghost.objectType==="wall"?"#b7c1c5":"#d9bd78",8);
  showTrainActivity(train,rebuilt,`Rebuilt ${rebuiltLabel(ghost)}`,1.4);
  return true;
}

function updateAutomaticRebuild(){
  const ghosts=[...state.ghosts.values()].sort((a,b)=>(a.objectType==="track"?0:1)-(b.objectType==="track"?0:1));
  for(const ghost of ghosts){
    const predicate=candidate=>totalCargo(candidate,"material")>=REBUILD_COSTS[ghost.objectType];
    const train=ghost.objectType==="track"
      ?state.trains.filter(candidate=>predicate(candidate)&&trainStopped(candidate)&&hexDistance(candidate,ghost)<=1).sort((a,b)=>hexDistance(a,ghost)-hexDistance(b,ghost))[0]||null
      :nearestStoppedLoco(ghost,1,predicate);
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
  ui.defeatEnergyMined.textContent=Math.floor(state.stats.energyMined);
  ui.defeatMaterialMined.textContent=Math.floor(state.stats.materialMined);
  ui.viewFinalStats.hidden=true;ui.viewFinalStats.classList.add("d-none");
  ui.gameOver.hidden=false;ui.gameOver.classList.remove("d-none");updateUI(true);
}

function showFinalMap(){
  if(!state.gameOver)return;
  state.finalMapView=true;state.mode="select";canvas.style.cursor="default";document.querySelectorAll("[data-mode]").forEach(button=>{const selectButton=button.dataset.mode==="select";button.classList.toggle("active",selectButton);button.disabled=!selectButton;});ui.gameOver.hidden=true;ui.gameOver.classList.add("d-none");ui.viewFinalStats.hidden=false;ui.viewFinalStats.classList.remove("d-none");updateUI(true);render();
}

function showFinalStats(){
  if(!state.gameOver)return;
  state.finalMapView=false;ui.viewFinalStats.hidden=true;ui.viewFinalStats.classList.add("d-none");ui.gameOver.hidden=false;ui.gameOver.classList.remove("d-none");
}

function trainPartDestroyed(train,partLabel){
  sounds.trainDestroyed();
  state.screenShakeUntil=Math.max(state.screenShakeUntil,state.elapsed+TRAIN_LOSS_SHAKE_SECONDS);
  state.screenShakeUntilWallTime=Math.max(state.screenShakeUntilWallTime||0,Date.now()+TRAIN_LOSS_SHAKE_SECONDS*1000);
  toast(`${train.name}: ${partLabel} destroyed.`,"danger");
}

function supplyLabel(supply){return `${resourceLabel(supply.role||supply.type)} supply`;}

function damageTarget(target, amount) {
  if(target.type==="neutralizer")return damageNeutralizer(target,amount);
  const targetIsTrack=state.tracks.get(key(target.q,target.r))===target;
  target.hp=targetIsTrack&&target.maxHp<=TRACK_HIT_POINTS&&amount>0?0:target.hp-amount;
  const fatalTrainPart=target.hp<=0&&(target.kind==="wagon"||Boolean(target.wagons));
  if(!fatalTrainPart)sounds.hit();
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
      const index=train.wagons.indexOf(target),destroyed=train.wagons.slice(index);
      train.wagons.splice(index);
      trainPartDestroyed(train,destroyed.map(supplyLabel).join(" and "));
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
    if(state.scheduleTrainId===target.id){state.scheduleTrainId=null;state.scheduleDraft=null;state.mode="select";canvas.style.cursor="default";document.querySelectorAll("[data-mode]").forEach(button=>button.classList.toggle("active",button.dataset.mode==="select"));}
    trainPartDestroyed(target,"locomotive");
  } else if (["turret","artillery","mine","wall","gate","research","neutralizer-building"].includes(target.type)) {
    leaveGhost(target,target.type);
    salvageBurst(target);
    state.structures.delete(key(target.q,target.r));
    invalidateEnemyNavigation();
    if (state.selected?.id === target.id) state.selected = null;
    toast(`${target.type==="neutralizer-building"?"Neutralizer building":capitalize(target.type)} destroyed.`, "danger");
  } else {
    leaveGhost(target,"track");
    salvageBurst(target);
    deleteTrack(target.q,target.r);
    if (state.selected?.type === "track" && state.selected.id === key(target.q,target.r)) state.selected = null;
  }
  if(target.wagons)burst(target.q,target.r,"#d94a4a",12);
  updateUI(true);
}

function updateEnemies(dt) {
  if(state.gameOver||!state.enemies.length)return;
  ensureEnemyNavigation();
  const reservations=enemySpaceReservations();
  for (const enemy of state.enemies) {
    if(state.gameOver)break;
    enemy.phase += dt*2.2;
    const target=enemy.progress>=1?adjacentEnemyTarget(enemy):null;
    if (target) {
      enemy.attackClock += dt;
      const shots=Math.floor((enemy.attackClock+1e-9)/CREEP_ATTACK_INTERVAL);
      if(shots>0){
        enemy.attackClock-=shots*CREEP_ATTACK_INTERVAL;
        const targetPoint=target.type==="neutralizer"?{x:target.x,y:target.y}:axialToWorld(target.q,target.r);
        for(let shot=0;shot<shots;shot++)state.projectiles.push({x1:enemy.x,y1:enemy.y,x2:targetPoint.x,y2:targetPoint.y,life:.09,maxLife:.09,color:"#ff3348",width:1.7,impactColor:"#ff8790"});
        damageTarget(target,shots*CREEP_ATTACK_DAMAGE);
      }
      continue;
    }
    if (enemy.progress >= 1 && state.elapsed >= (enemy.nextPathAt||0)) {
      const currentSlot=Number.isInteger(enemy.slot)?enemy.slot:0;
      releaseEnemySpace(reservations,enemy.q,enemy.r,currentSlot);
      const next=nextEnemyNavigationStep(enemy,reservations);
      reserveEnemySpace(reservations,enemy.q,enemy.r,currentSlot);
      if (next) {
        enemy.previousQ=enemy.q;enemy.previousR=enemy.r;
        enemy.fromQ=enemy.q;enemy.fromR=enemy.r;enemy.fromSlot=currentSlot;enemy.toQ=next.q;enemy.toR=next.r;enemy.toSlot=next.slot;enemy.progress=0;enemy.nextPathAt=0;enemy.moveCount=(enemy.moveCount||0)+1;
        reserveEnemySpace(reservations,next.q,next.r,next.slot);
      }else enemy.nextPathAt=state.elapsed+.25;
    }
    if (enemy.progress < 1) {
      enemy.progress = Math.min(1,enemy.progress + dt*enemy.speed);
      const a=enemyWorldPosition(enemy.fromQ,enemy.fromR,enemy.fromSlot),b=enemyWorldPosition(enemy.toQ,enemy.toR,enemy.toSlot);
      const eased=enemy.progress*enemy.progress*(3-2*enemy.progress);
      enemy.x=lerp(a.x,b.x,eased); enemy.y=lerp(a.y,b.y,eased);
      if (enemy.progress>=1) { enemy.q=enemy.toQ;enemy.r=enemy.toR;enemy.slot=enemy.toSlot; }
    }
  }
}

function updateCombatTrains(dt){
  for(const train of state.trains){
    if(train.trainType!=="combat")continue;
    train.combatCooldown=(train.combatCooldown||0)-dt;
    if(train.combatCooldown>0||totalCargo(train,"energy")<1)continue;
    const center=worldToAxial(train.x,train.y);
    const range=combatTrainRange(),hive=[...state.hives.values()].filter(candidate=>hexDistance(center,candidate)<=range&&hasClearShot(center,candidate)).sort((a,b)=>hexDistance(center,a)-hexDistance(center,b))[0];
    const enemy=!hive?state.enemies.filter(candidate=>{const position=worldToAxial(candidate.x,candidate.y);return hexDistance(center,position)<=range&&hasClearShot(center,position);}).sort((a,b)=>hexDistance(center,worldToAxial(a.x,a.y))-hexDistance(center,worldToAxial(b.x,b.y)))[0]:null;
    if(!hive&&!enemy)continue;
    const targetPoint=hive?axialToWorld(hive.q,hive.r):{x:enemy.x,y:enemy.y};
    removeCargo(train,"energy",1);train.combatCooldown=combatTrainFireInterval();train.gunAngle=Math.atan2(targetPoint.y-train.y,targetPoint.x-train.x);
    state.projectiles.push({x1:train.x,y1:train.y,x2:targetPoint.x,y2:targetPoint.y,life:.12,maxLife:.12});
    if(hive)damageTarget(hive,turretDamage());
    else damageEnemy(enemy,turretDamage());
    sounds.shot();
  }
}

function damageEnemy(enemy,amount){
  enemy.hp-=amount;
  if(enemy.hp>0)return false;
  state.enemies=state.enemies.filter(candidate=>candidate.id!==enemy.id);
  if(state.selected?.type==="enemy"&&state.selected.id===enemy.id)state.selected=null;
  state.creepsNeutralized++;burstAt(enemy.x,enemy.y,"#e35050",7);return true;
}

function debugDestroyAt(q,r){
  if(state.gameOver)return false;
  const trainPart=trainSegmentAt(q,r);
  if(trainPart){damageTarget(trainPart.segment,Math.max(1,trainPart.segment.hp));render();return true;}
  const structure=structureAt(q,r);
  if(structure){damageTarget(structure,Math.max(1,structure.hp));render();return true;}
  const hive=hiveAt(q,r);
  if(hive){damageTarget(hive,Math.max(1,hive.hp));render();return true;}
  const enemy=state.enemies.find(candidate=>{const visible=worldToAxial(candidate.x,candidate.y);return visible.q===q&&visible.r===r;});
  if(enemy){sounds.hit();damageEnemy(enemy,Math.max(1,enemy.hp));updateUI(true);render();return true;}
  const neutralizer=state.neutralizers.find(candidate=>{const visible=worldToAxial(candidate.x,candidate.y);return visible.q===q&&visible.r===r;});
  if(neutralizer){damageNeutralizer(neutralizer,Math.max(1,neutralizer.hp));updateUI(true);render();return true;}
  const track=state.tracks.get(key(q,r));
  if(track){damageTarget(track,Math.max(1,track.hp));render();return true;}
  if(ghostAt(q,r))return fail("That object is already destroyed.");
  return fail("There is no destructible object on that hex.");
}

function resolveArtilleryImpact(projectile){
  const center={q:projectile.centerQ,r:projectile.centerR},affected=[];
  for(let q=center.q-2;q<=center.q+2;q++)for(let r=center.r-2;r<=center.r+2;r++){const position={q,r};if(hexDistance(center,position)<=2)affected.push(position);}
  for(const position of affected){
    const damage=artilleryDamageAtDistance(hexDistance(center,position));
    const targetHive=state.hives.get(key(position.q,position.r));if(targetHive)damageTarget(targetHive,damage);
    for(const targetEnemy of [...state.enemies]){const visible=worldToAxial(targetEnemy.x,targetEnemy.y);if(visible.q===position.q&&visible.r===position.r)damageEnemy(targetEnemy,damage);}
    burst(position.q,position.r,"#ff9d58",4);
  }
}

function updateProjectiles(dt){
  const active=[];
  for(const projectile of state.projectiles){
    projectile.life-=dt;
    if(projectile.kind==="artillery-shell"&&projectile.life<=0){
      resolveArtilleryImpact(projectile);
      active.push({kind:"artillery-blast",q:projectile.centerQ,r:projectile.centerR,life:ARTILLERY_BLAST_SECONDS,maxLife:ARTILLERY_BLAST_SECONDS});
    }else if(projectile.life>0)active.push(projectile);
  }
  state.projectiles=active;
}

function fireArtillery(artillery){
  if(artillery.energy<ARTILLERY_SHOT_ENERGY||artillery.cooldown>1e-9)return false;
  const hive=[...state.hives.values()].filter(candidate=>hexDistance(artillery,candidate)<=artilleryRange()).sort((a,b)=>hexDistance(artillery,a)-hexDistance(artillery,b))[0];
  if(!hive)return false;
  const center={q:hive.q,r:hive.r},from=axialToWorld(artillery.q,artillery.r),to=axialToWorld(center.q,center.r);
  artillery.energy-=ARTILLERY_SHOT_ENERGY;artillery.cooldown=artilleryFireInterval();if(artillery.energy<=0)showTurretEnergyWarning();
  state.projectiles.push({kind:"artillery-shell",x1:from.x,y1:from.y,x2:to.x,y2:to.y,centerQ:center.q,centerR:center.r,life:ARTILLERY_SHELL_FLIGHT_SECONDS,maxLife:ARTILLERY_SHELL_FLIGHT_SECONDS});
  sounds.shot();return true;
}

function updateStructures(dt) {
  for (const structure of state.structures.values()) {
    if (structure.type === "turret") {
      structure.cooldown -= dt;
      if (structure.energy >= 1 && structure.cooldown <= 1e-9) {
        const range=turretRange(),hive=[...state.hives.values()].filter(candidate=>hexDistance(structure,candidate)<=range&&hasClearShot(structure,candidate)).sort((a,b)=>hexDistance(structure,a)-hexDistance(structure,b))[0];
        const enemy=!hive?state.enemies.filter(candidate=>{const position=worldToAxial(candidate.x,candidate.y);return hexDistance(structure,position)<=range&&hasClearShot(structure,position);}).sort((a,b)=>hexDistance(structure,worldToAxial(a.x,a.y))-hexDistance(structure,worldToAxial(b.x,b.y)))[0]:null;
        if(hive){
          const from=axialToWorld(structure.q,structure.r),to=axialToWorld(hive.q,hive.r);
          state.projectiles.push({x1:from.x,y1:from.y,x2:to.x,y2:to.y,life:.12,maxLife:.12});
          structure.energy--;structure.cooldown=turretFireInterval();damageTarget(hive,turretDamage());sounds.shot();if(structure.energy<=0)showTurretEnergyWarning();
        }else if (enemy) {
          const from=axialToWorld(structure.q,structure.r);
          state.projectiles.push({x1:from.x,y1:from.y,x2:enemy.x,y2:enemy.y,life:.12,maxLife:.12});
          structure.energy--;structure.cooldown=turretFireInterval();damageEnemy(enemy,turretDamage());sounds.shot();if(structure.energy<=0)showTurretEnergyWarning();
        }
      }
    }else if(structure.type==="artillery"){
      structure.cooldown-=dt;fireArtillery(structure);
    }
  }
  updateProjectiles(dt);
  state.particles.forEach(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.95;p.vy*=.95;});
  state.particles=state.particles.filter(p=>p.life>0);
}
