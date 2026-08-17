"use strict";

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

function liveTrackWithinRange(target,range=3){
  return [...state.tracks.values()].some(track=>track.hp>0&&hexDistance(track,target)<=range);
}

function requireNearbyTrack(target, action) {
  if(trackWithinRange(target,3))return true;
  fail(`${capitalize(action)} must be within three hexes of track.`);
  return false;
}

function placeTrackOverGhost(ghost){
  if(!payBase(COSTS.track,"Track"))return null;
  const ghostKey=key(ghost.q,ghost.r),rebuilt={q:ghost.q,r:ghost.r,hp:TRACK_HIT_POINTS,maxHp:TRACK_HIT_POINTS,links:new Set()};
  state.tracks.set(ghostKey,rebuilt);
  for(const linkedKey of ghost.links||[]){const neighbor=state.tracks.get(linkedKey);if(neighbor){rebuilt.links.add(linkedKey);neighbor.links.add(ghostKey);}else{const neighborGhost=state.ghosts.get(linkedKey);if(neighborGhost?.objectType==="track"&&!neighborGhost.links.includes(ghostKey))neighborGhost.links.push(ghostKey);}}
  state.ghosts.delete(ghostKey);
  invalidateEnemyNavigation();
  if(state.selected?.type==="ghost"&&state.selected.id===ghostKey)state.selected={type:"track",id:ghostKey};
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
    state.trackStart=destination;toast("Track Start Selected. Click adjacent hexes to keep building.","info");tutorialEvent("track-selected",{q,r});updateUI(true);return;
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
    else {if(!payBase(COSTS.track,"Track"))return;state.tracks.set(destinationKey,{q,r,hp:TRACK_HIT_POINTS,maxHp:TRACK_HIT_POINTS,links:new Set()});state.stats.tracksLaid++;invalidateEnemyNavigation();}
  }
  linkTracks(start,destination);
  state.trackStart=destination;
  sounds.place();
  burst(q, r, "#d9bd78", 5);
  tutorialEvent(isNew?"track-built":"track-linked",{q,r});
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
  if(!liveTrackWithinRange({q,r},3))return fail("Building a turret must be within three hexes of non-destroyed Track.");
  if(ghostAt(q,r))return fail("A destroyed object occupies that hex. Rebuild it with an adjacent stopped locomotive.");
  if (!isPassable(q, r) || terrainAt(q, r).type === "resource" || structureAt(q, r) || hiveAt(q,r) || state.tracks.has(key(q,r))) return fail("Turrets need clear ground away from track.");
  if(!payBase(COSTS.turret,"Turret"))return;
  const turret = { id: `turret-${state.nextId++}`, type: "turret", q, r, hp: 18, maxHp: 18, energy: 20, maxEnergy: 20, cooldown: 0, showRangeUntil: state.elapsed + 3.5 };
  state.structures.set(key(q,r), turret);
  invalidateEnemyNavigation();
  state.stats.turretsBuilt++;
  sounds.place(); burst(q, r, "#65dbe0", 10); select("structure", turret.id);tutorialEvent("turret-built",{turret});
}

function buildWall(q, r) {
  if(!liveTrackWithinRange({q,r},3))return fail("Building a wall must be within three hexes of non-destroyed Track.");
  if(ghostAt(q,r))return fail("A destroyed object occupies that hex. Rebuild it with an adjacent stopped locomotive.");
  if(!isPassable(q,r)||terrainAt(q,r).type==="resource"||structureAt(q,r)||hiveAt(q,r)||state.tracks.has(key(q,r))||trainClaimsHex(q,r))return fail("Walls need clear ground away from Track.");
  if(!payBase(COSTS.wall,"Wall"))return;
  const wall={id:`wall-${state.nextId++}`,type:"wall",q,r,hp:WALL_HIT_POINTS,maxHp:WALL_HIT_POINTS};
  state.structures.set(key(q,r),wall);
  invalidateEnemyNavigation();
  sounds.place();burst(q,r,"#b7c1c5",10);select("structure",wall.id);
}

function buildArtillery(q,r){
  if(!liveTrackWithinRange({q,r},3))return fail("Building Artillery must be within three hexes of non-destroyed Track.");
  if(ghostAt(q,r))return fail("A destroyed object occupies that hex. Rebuild it with an adjacent stopped locomotive.");
  if(!isPassable(q,r)||terrainAt(q,r).type==="resource"||structureAt(q,r)||hiveAt(q,r)||state.tracks.has(key(q,r))||trainClaimsHex(q,r))return fail("Artillery needs clear ground away from Track.");
  if(!payBase(COSTS.artillery,"Artillery"))return;
  const artillery={id:`artillery-${state.nextId++}`,type:"artillery",q,r,hp:ARTILLERY_HIT_POINTS,maxHp:ARTILLERY_HIT_POINTS,energy:ARTILLERY_MAX_ENERGY,maxEnergy:ARTILLERY_MAX_ENERGY,cooldown:0,showRangeUntil:state.elapsed+3.5};
  state.structures.set(key(q,r),artillery);invalidateEnemyNavigation();sounds.place();burst(q,r,"#ef9b54",12);select("structure",artillery.id);
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
  sounds.place(); burst(q, r, terrain.resource === "energy" ? "#60d5db" : "#e6b94a", 10); select("structure", mine.id);tutorialEvent("mine-built",{mine});
}

function salvageStructure(structure) {
  if(!requireNearbyTrack(structure,`salvaging the ${structure.type}`))return;
  const mat = structure.type === "artillery" ? 12 : structure.type === "turret" ? 4 : structure.type === "wall" ? 8 : 6;
  const energy = ["turret","artillery"].includes(structure.type)?Math.floor(structure.energy):0;
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
  toast(["turret","artillery"].includes(structure.type)?`Salvaged ${mat} Construction Material and ${energy} Energy.`:`Salvaged ${mat} Construction Material.`);
}

function requestTrainSalvage(train){
  state.pendingTrainSalvageId=train.id;
  ui.confirmMessage.innerHTML=`<strong>${train.name}</strong> and all of its schedule stops will be removed. 30 Construction Material and all carried resources will return to Base.`;
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
  const wagons=roles.map((role,index)=>{const position=path[index+1],point=axialToWorld(position.q,position.r);return {id:`wagon-${state.nextId++}`,kind:"wagon",q:position.q,r:position.r,x:point.x,y:point.y,heading,role,type:role,amount:trainType==="combat"&&role==="energy"?10:0,capacity:30,hp:TRAIN_HIT_POINTS,maxHp:TRAIN_HIT_POINTS};});
  const train={id:`train-${state.nextId++}`,name:trainName(trainIndex,trainType),code,trainType,q:head.q,r:head.r,x:hp.x,y:hp.y,route:[],routePurpose:null,progress:0,speed:2.25,stepFrom:null,stepTo:null,schedule:[],scheduleComplete:false,scheduleTargetIndex:0,servicingStop:false,stopHoldUntil:0,scheduleRetryAt:0,repairHoldUntil:0,repairResumeStatus:null,energyDepleted:false,nextEnergyWarningAt:0,forwardDirection:{q:head.q-firstWagon.q,r:head.r-firstWagon.r},fuel:10,maxFuel:20,hp:TRAIN_HIT_POINTS,maxHp:TRAIN_HIT_POINTS,status:"Idle",wagons,heading,wheelClock:0,wasNearBase:false,combatCooldown:0,gunAngle:heading};
  state.trains.push(train);state.stats.trainsBuilt++;clearDeploymentReservation();sounds.place();select("train",train.id);setMode("select");toast(`${train.name} Deployed.`,"info");tutorialEvent("builder-train-deployed",{trainId:train.id,train});render();
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
    toast(`${train.name} Schedule Complete.`,"info");sounds.place();tutorialEvent("schedule-completed",{trainId:train.id,train});updateUI(true);return;
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
