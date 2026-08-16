"use strict";

function hpBlock(object){const ratio=clamp(object.hp/object.maxHp*100,0,100);return `<div class="status-bar"><span style="width:${ratio}%"></span></div><div class="status-caption"><span>HIT POINTS</span><span>${Math.ceil(object.hp)} / ${object.maxHp}</span></div>`;}
function energyBlock(object){const ratio=clamp(object.energy/object.maxEnergy*100,0,100);return `<div class="status-bar energy"><span style="width:${ratio}%"></span></div><div class="status-caption"><span>ENERGY</span><span>${Math.floor(object.energy)} / ${object.maxEnergy}</span></div>`;}
function resourceBlock(node){const ratio=clamp(node.amount/node.maxAmount*100,0,100);return `<div class="status-bar resource"><span style="width:${ratio}%"></span></div><div class="status-caption"><span>RESOURCE UNITS</span><span>${Math.floor(node.amount)} / ${node.maxAmount}</span></div>`;}
function cargoHtml(train){if(!train.wagons.length)return `<div class="action-note">No cargo wagons attached.</div>`;return `<div class="cargo-list">${train.wagons.map((w,i)=>`<div class="cargo-row ${w.type||"empty"}"><i></i><span>Wagon ${i+1} · ${w.type?resourceLabel(w.type).toUpperCase():"EMPTY"}</span><strong>${Math.floor(w.amount)} / ${w.capacity}</strong></div>`).join("")}</div>`;}
function baseInventoryHtml(){return `<div class="cargo-list"><div class="cargo-row material"><i></i><span>CONSTRUCTION MATERIAL</span><strong>${Math.floor(state.baseMaterial)}</strong></div><div class="cargo-row energy"><i></i><span>ENERGY</span><strong>${Math.floor(state.baseEnergy)}</strong></div></div>`;}
function capitalize(value){return value.charAt(0).toUpperCase()+value.slice(1);}
function resourceLabel(value){return value==="material"?"Construction Material":"Energy";}
function button(action,label,cls="btn-quiet",tooltip="",disabled=false){
  const tipAttributes=tooltip?`data-bs-toggle="tooltip" data-bs-placement="left" title="${tooltip}"`:"";
  const markup=`<button class="btn ${cls}" data-action="${action}" ${disabled?"disabled aria-disabled=\"true\"":""} ${disabled?"":tipAttributes}>${label}</button>`;
  return disabled&&tooltip?`<span class="disabled-button-tip" ${tipAttributes}>${markup}</span>`:markup;
}

function selectionHtml(){
  const selected=getSelected();
  if(!selected)return "";
  if(selected.type==="base"){
    const unavailable=trainFabricationDisabledReason(),canPlaceTrain=!unavailable,unavailableTip=unavailable?`&#10;&#10;Unavailable: ${unavailable}`:"",deployLength=state.deploymentTrainType==="combat"?2:3,deployDistance=deployLength===2?"one":"two";
    const deployNote=state.mode==="deploy"?`<div class="action-note">${state.deploymentHead?`Head selected. Click a highlighted Tail point exactly ${deployDistance} connected Track ${deployDistance==="one"?"hex":"hexes"} away.`:`Click an empty Track hex for the Head, then click a highlighted Tail point. ${deployLength} connected Track hexes must be clear.`}</div>`:"";
    const builderTip=`Places one Locomotive with an empty Construction Material Wagon and an empty Energy Wagon. It mines resources, repairs, rebuilds, and supplies Turrets. Placement uses two clicks: Head, then Tail.&#10;&#10;Costs 30 Construction Material.${unavailableTip}`;
    const combatTip=`Places one Locomotive with one empty Energy Wagon. It automatically fires at Hives and Creeps within 6 hexes, including while moving. Locomotive Energy and weapon Energy can only be restocked at Base. Placement uses two clicks: Head, then Tail.&#10;&#10;Costs 30 Construction Material.${unavailableTip}`;
    return `<div class="selection-title"><h2>Base</h2></div>${hpBlock(selected)}${baseInventoryHtml()}${deployNote}<div class="panel-actions">${button("fabricate-place-builder-train","Fabricate and Place Build and Mine Train",canPlaceTrain?"btn-command":"btn-quiet",builderTip,!canPlaceTrain)}${button("fabricate-place-combat-train","Fabricate and Place Combat Train",canPlaceTrain?"btn-cyan":"btn-quiet",combatTip,!canPlaceTrain)}</div>`;
  }
  if(selected.wagons){const adding=state.mode==="schedule"&&state.scheduleTrainId===selected.id,hasStops=(selected.schedule?.length||0)>0,canAdd=!hasStops&&trainStopped(selected)&&!adding;const code=trainScheduleCode(selected);const note=adding?`<div class="action-note">Click Track or Destroyed Track to add Stop ${code}${selected.schedule.length+1}. Add at least 3 stops, then click ${code}1 again to start.</div>`:"",combatNote=selected.trainType==="combat"?`<div class="selection-subtitle">Moving defense train · Range 6 hexes · Locomotive and weapon Energy restock only at Base</div>`:"";return `<div class="selection-title"><h2>${selected.name}</h2></div>${combatNote}${hpBlock(selected)}<div class="status-bar energy"><span style="width:${selected.fuel/selected.maxFuel*100}%"></span></div><div class="status-caption"><span>ENERGY</span><span>${selected.fuel.toFixed(1)} / ${selected.maxFuel}</span></div>${cargoHtml(selected)}${note}<div class="panel-actions">${button("clear-schedule","Clear Schedule",hasStops||adding?"btn-danger":"btn-quiet","Clears every stop and stops the train at the next Track hex.",!hasStops&&!adding)}${button("add-schedule","Add Schedule",canAdd?"btn-command":"btn-quiet","Click at least 3 Track or Destroyed Track stops, then click the first stop again to complete the loop. Maximum 9 stops.",!canAdd)}</div>`;}
  if(selected.type==="turret")return `<div class="selection-title"><h2>Turret</h2></div><div class="selection-subtitle">Range 4 hexes · Instantly refills when a stopped Build and Mine Train Locomotive is adjacent</div>${hpBlock(selected)}${energyBlock(selected)}`;
  if(selected.type==="mine"){const node=resourceNodeAt(selected.q,selected.r),exhausted=node.amount<=0,title=`${exhausted?"Exhausted ":""}${resourceLabel(selected.resource)} Mine`,description=exhausted?"This Resource Node is exhausted":selected.resource==="energy"?"An adjacent stopped locomotive instantly refuels, then loads available Energy":"An adjacent stopped locomotive instantly loads available Construction Material";return `<div class="selection-title"><h2>${title}</h2></div><div class="selection-subtitle">${description}</div>${hpBlock(selected)}${resourceBlock(node)}`;}
  if(selected.type==="node")return `<div class="selection-title"><h2>${resourceLabel(selected.resource)} Node</h2></div>${resourceBlock(selected)}<div class="selection-subtitle">Build a Mine here to extract its resources</div>`;
  if(selected.type==="hive"){const rate=selected.level;return `<div class="selection-title"><h2>Level ${rate} Hive</h2></div>${hpBlock(selected)}`;}
  if(selected.type==="ghost"){const name=selected.objectType==="track"?"Track":selected.objectType==="turret"?"Turret":`${resourceLabel(selected.resource)} Mine`,scheduled=selected.objectType==="track"?scheduleStopAt(selected.q,selected.r):null,title=scheduled?`Destroyed Track with Train Stop ${trainScheduleCode(scheduled.train)}${scheduled.index+1} (Train ${trainScheduleCode(scheduled.train)})`:`Destroyed ${name}`;return `<div class="selection-title"><h2>${title}</h2></div><div class="selection-subtitle">Stops being a ghost when a locomotive carrying ${REBUILD_COSTS[selected.objectType]} Construction Material stops adjacent to it</div>`;}
  if(state.tracks.get(key(selected.q,selected.r))===selected){const scheduled=scheduleStopAt(selected.q,selected.r),title=scheduled?`Track with Train Stop ${trainScheduleCode(scheduled.train)}${scheduled.index+1} (Train ${trainScheduleCode(scheduled.train)})`:"Track";return `<div class="selection-title"><h2>${title}</h2></div>${hpBlock(selected)}`;}
  return `<div class="selection-empty">Unknown selection.</div>`;
}

function updateUI(force=false){
  ui.pauseToggle.textContent=state.gameOver?"Paused":state.paused?"Play":"Pause";ui.pauseToggle.disabled=state.gameOver;ui.pauseToggle.ariaLabel=state.paused||state.gameOver?"Play simulation":"Pause simulation";ui.soundToggle.textContent=state.sound?"Sound: ON":"Sound: OFF";ui.hivesNeutralized.textContent=state.hivesNeutralized;ui.creepsNeutralized.textContent=state.creepsNeutralized;ui.hivesInWorld.textContent=state.hives.size;ui.creepsInWorld.textContent=state.enemies.length;ui.timeSurvived.textContent=formatSurvivalTime(state.elapsed);
  const selectionMarkup=selectionHtml();
  if(force||selectionMarkup!==selectionCache){disposeTooltips(selectionContent);selectionContent.innerHTML=selectionMarkup;selectionCache=selectionMarkup;initializeTooltips(selectionContent);}
}

function initializeTooltips(root=document){if(!window.bootstrap)return;root.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(element=>bootstrap.Tooltip.getOrCreateInstance(element,{container:"body",trigger:"hover focus"}));}
function disposeTooltips(root){if(!window.bootstrap)return;root.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(element=>bootstrap.Tooltip.getInstance(element)?.dispose());}

function updateHoverStatus(hex){
  if(!hex){ui.hoverStatus.classList.add("d-none");ui.hoverTitle.textContent="";ui.hoverDetail.textContent="";return;}
  ui.hoverStatus.classList.remove("d-none");
  const {q,r}=hex;
  const enemy=state.enemies.find(item=>{const h=worldToAxial(item.x,item.y);return h.q===q&&h.r===r;});
  if(enemy){ui.hoverTitle.textContent="Biomass";ui.hoverDetail.textContent="Hostile · Moving Toward The Rail Network";return;}
  const trainInfo=trainSegmentAt(q,r);
  if(trainInfo){const {train,segment,index}=trainInfo;ui.hoverTitle.textContent=index===0?`${train.name} · Locomotive`:`${train.name} · Wagon ${index}`;ui.hoverDetail.textContent=index===0?`Energy ${train.fuel.toFixed(1)} · Hit Points ${Math.ceil(train.hp)}/${train.maxHp}`:`${segment.type?resourceLabel(segment.type):"Empty"} ${Math.floor(segment.amount)}/${segment.capacity} · Hit Points ${Math.ceil(segment.hp)}/${segment.maxHp}`;return;}
  const structure=structureAt(q,r);
  if(structure){const node=structure.type==="mine"?resourceNodeAt(q,r):null,exhausted=node?.amount<=0;ui.hoverTitle.textContent=structure.type==="base"?"Base":structure.type==="turret"?"Turret":`${exhausted?"Exhausted ":""}${resourceLabel(structure.resource)} Mine`;ui.hoverDetail.textContent=`Hit Points ${Math.ceil(structure.hp)}/${structure.maxHp}${structure.energy!==undefined?` · Energy ${Math.floor(structure.energy)}/${structure.maxEnergy}`:""}${node?` · Resource ${Math.floor(node.amount)}/${node.maxAmount}`:""}`;return;}
  const track=state.tracks.get(key(q,r));
  if(track){ui.hoverTitle.textContent="Track";ui.hoverDetail.textContent=`Hit Points ${Math.ceil(track.hp)}/${track.maxHp}`;return;}
  const ghost=ghostAt(q,r);
  if(ghost){const name=ghost.objectType==="track"?"Track":ghost.objectType==="turret"?"Turret":`${resourceLabel(ghost.resource)} Mine`,scheduled=ghost.objectType==="track"?scheduleStopAt(q,r):null;ui.hoverTitle.textContent=scheduled?`Destroyed Track · Stop ${trainScheduleCode(scheduled.train)}${scheduled.index+1}`:`Destroyed ${name}`;ui.hoverDetail.textContent=`Requires ${REBUILD_COSTS[ghost.objectType]} Construction Material in an adjacent stopped locomotive to rebuild`;return;}
  const hive=hiveAt(q,r);
  if(hive){const rate=hive.level;ui.hoverTitle.textContent=`Level ${rate} Hive`;ui.hoverDetail.textContent=`Hit Points ${Math.ceil(hive.hp)}/${hive.maxHp} · ${rate} Creeps per batch · 1 in ${rate} expansion chance`;return;}
  const terrain=terrainAt(q,r);
  if(terrain.type==="resource"){const node=resourceNodeAt(q,r);ui.hoverTitle.textContent=`${resourceLabel(terrain.resource)} Node`;ui.hoverDetail.textContent=`${Math.floor(node.amount)} / ${node.maxAmount} Units Remaining`;return;}
  ui.hoverTitle.textContent=terrain.type==="water"?"Body of Water":terrain.type==="rock"?"Mountain":terrain.type==="trees"?"Trees":capitalize(terrain.type);ui.hoverDetail.textContent=terrain.type==="ground"?"Clear terrain":"Impassable terrain";
}

function formatSurvivalTime(seconds){const total=Math.max(0,Math.floor(seconds)),hours=Math.floor(total/3600),minutes=Math.floor(total%3600/60);return `${String(hours).padStart(2,"0")}h ${String(minutes).padStart(2,"0")}m ${String(total%60).padStart(2,"0")}s`;}

function showReminders(){
  remindersOpen=true;simulationAccumulator=0;
  ui.remindersDialog.hidden=false;ui.remindersDialog.classList.remove("d-none");
  setTimeout(()=>ui.remindersContinue.focus(),0);
}

function closeReminders(){
  remindersOpen=false;ui.remindersDialog.hidden=true;ui.remindersDialog.classList.add("d-none");
  lastWallTime=Date.now();simulationAccumulator=0;resetPerformanceMetrics();sounds.init();render();
}
