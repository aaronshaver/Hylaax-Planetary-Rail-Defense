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
