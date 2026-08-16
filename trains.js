"use strict";

function handleHexClick(hex) {
  if (state.gameOver) return;
  const { q, r } = hex;
  const structure = structureAt(q,r);
  const hive=hiveAt(q,r);
  const enemy=state.enemies.find(item=>{const position=worldToAxial(item.x,item.y);return position.q===q&&position.r===r;});
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
  if (structure) {select(structure.type === "base" ? "base" : "structure", structure.id);if(structure.type==="base")tutorialEvent("base-selected");return;}
  if (hive) return select("hive",hive.id);
  if (enemy) return select("enemy",enemy.id);
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
    if(payBase(COSTS.train,trainType==="combat"?"Turret Train":"Build/Mine Train")){state.deploymentPaid=true;state.deploymentTrainType=trainType;sounds.place();setMode("deploy");toast("Click an empty Track hex for the Train Head, then click a highlighted Tail point.","info");if(trainType==="builder")tutorialEvent("builder-fabrication-started");}
  }
  if(action==="add-schedule"&&selected?.wagons){
    if(!trainStopped(selected))return fail("Clear the current schedule and wait for the train to stop first.");
    if(selected.schedule?.length)return fail("Use Clear Schedule before creating a new schedule.");
    selected.schedule=[];selected.scheduleComplete=false;selected.scheduleTargetIndex=0;selected.servicingStop=false;selected.stopHoldUntil=0;
    state.scheduleTrainId=selected.id;state.mode="schedule";canvas.style.cursor="crosshair";
    document.querySelectorAll("[data-mode]").forEach(button=>button.classList.remove("active"));
    tutorialEvent("schedule-started",{trainId:selected.id,train:selected});
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
