"use strict";

function hpBlock(object){const ratio=clamp(object.hp/object.maxHp*100,0,100);return `<div class="status-bar"><span style="width:${ratio}%"></span></div><div class="status-caption"><span>HIT POINTS</span><span>${Math.ceil(object.hp)} / ${Math.ceil(object.maxHp)}</span></div>`;}
function energyBlock(object){const ratio=clamp(object.energy/object.maxEnergy*100,0,100);return `<div class="status-bar energy"><span style="width:${ratio}%"></span></div><div class="status-caption"><span>ENERGY</span><span>${Math.floor(object.energy)} / ${object.maxEnergy}</span></div>`;}
function resourceBlock(node){const ratio=clamp(node.amount/node.maxAmount*100,0,100);return `<div class="status-bar resource"><span style="width:${ratio}%"></span></div><div class="status-caption"><span>RESOURCE UNITS</span><span>${Math.floor(node.amount)} / ${node.maxAmount}</span></div>`;}
function cargoHtml(train){if(!train.wagons.length)return `<div class="action-note">No Supplies attached.</div>`;return `<div class="cargo-list">${train.wagons.map((w,i)=>`<div class="cargo-row ${w.type||"empty"}"><i></i><span>Supply ${i+1} · ${w.type?resourceLabel(w.type).toUpperCase():"EMPTY"}</span><strong>${Math.floor(w.amount)} / ${w.capacity}</strong></div>`).join("")}</div>`;}
function baseInventoryHtml(){return `<div class="cargo-list">${BASE_RESOURCE_TYPES.map(resource=>`<div class="cargo-row ${resource.key}"><i></i><span>${resource.label.toUpperCase()}</span><strong>${Math.floor(state[resource.stateKey]||0)}</strong></div>`).join("")}</div>`;}
function capitalize(value){return value.charAt(0).toUpperCase()+value.slice(1);}
function resourceLabel(value){return BASE_RESOURCE_TYPES.find(resource=>resource.key===value)?.label||capitalize(value);}
function displayStat(value){return Number.isInteger(value)?String(value):Number(value.toFixed(2)).toString();}
function button(action,label,cls="btn-quiet",tooltip="",disabled=false){
  const tipAttributes=tooltip?`data-bs-toggle="tooltip" data-bs-placement="left" title="${tooltip}"`:"";
  const markup=`<button class="btn ${cls}" data-action="${action}" ${disabled?"disabled aria-disabled=\"true\"":""} ${disabled?"":tipAttributes}>${label}</button>`;
  return disabled&&tooltip?`<span class="disabled-button-tip" ${tipAttributes}>${markup}</span>`:markup;
}

function selectedTrainPartLabel(train){
  const segmentId=state.selected?.type==="train"&&state.selected.id===train.id?state.selected.segmentId:null;
  if(!segmentId||segmentId===train.id)return "Locomotive";
  const wagon=train.wagons.find(candidate=>candidate.id===segmentId);
  if(!wagon)return "Locomotive";
  const role=wagon.role||wagon.type;
  if(role==="energy")return "Energy Supply";
  if(role==="material")return "Construction Material Supply";
  return `Supply ${train.wagons.indexOf(wagon)+1}`;
}

function statusIcon(name){
  if(name==="play")return `<svg class="flat-status-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2.5 13 8 3 13.5Z"/></svg>`;
  if(name==="pause")return `<svg class="flat-status-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2.5h3.5v11H3ZM9.5 2.5H13v11H9.5Z"/></svg>`;
  if(name==="sound-on")return `<svg class="flat-status-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h3l4-3v10l-4-3H2Z"/><path d="M11 5.2c1.5 1.5 1.5 4.1 0 5.6M12.7 3.5c2.5 2.5 2.5 6.5 0 9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  return `<svg class="flat-status-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h3l4-3v10l-4-3H2Z"/><path d="m10.5 5 4 6m0-6-4 6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;
}

function setStatusButtonMarkup(element,status,markup){
  if(element.dataset.renderedStatus===status)return;
  element.innerHTML=markup;element.dataset.renderedStatus=status;
}

function selectionHtml(){
  const selected=getSelected();
  if(!selected)return "";
  if(selected.type==="base"){
    const destroyed=selected.hp<=0;
    const unavailable=trainFabricationDisabledReason(),canPlaceTrain=!unavailable,unavailableTip=unavailable?`&#10;&#10;Unavailable: ${unavailable}`:"",deployLength=state.deploymentTrainType==="combat"?2:3,deployDistance=deployLength===2?"one":"two";
    const deployNote=state.mode==="deploy"?`<div class="action-note">${state.deploymentHead?`Head selected. Click a highlighted Tail point exactly ${deployDistance} connected Track ${deployDistance==="one"?"hex":"hexes"} away.`:`Click an empty Track hex for the Head, then click a highlighted Tail point. ${deployLength} connected Track hexes must be clear.`}</div>`:"";
    const builderTip=`Places one Locomotive with an empty Construction Material Supply and an empty Energy Supply. It mines resources, repairs, rebuilds, and supplies Turrets. Placement uses two clicks: Head, then Tail.&#10;&#10;Costs 30 (C)onstruction Material.${unavailableTip}`;
    const combatTip=`Places one Locomotive with one Energy Supply holding 10 Energy. It automatically fires at Hives and Creeps within 6 hexes, including while moving. Locomotive and Energy Supply Energy can only be restocked at Base. Placement uses two clicks: Head, then Tail.&#10;&#10;Costs 30 (C)onstruction Material.${unavailableTip}`;
    const actions=state.gameOver?"":`<div class="panel-actions">${button("fabricate-place-builder-train","Fabricate and Place Build/Mine Train",canPlaceTrain?"btn-command":"btn-quiet",builderTip,!canPlaceTrain)}${button("fabricate-place-combat-train","Fabricate and Place Turret Train",canPlaceTrain?"btn-cyan":"btn-quiet",combatTip,!canPlaceTrain)}</div>`;
    return `<div class="selection-title"><h2>${destroyed?"Destroyed Base":"Base"}</h2></div>${destroyed?`<div class="selection-subtitle">Destroyed · The Base cannot be rebuilt or salvaged</div>`:""}${hpBlock(selected)}${baseInventoryHtml()}${state.gameOver?"":deployNote}${actions}`;
  }
  if(selected.wagons){const adding=state.mode==="schedule"&&state.scheduleTrainId===selected.id,hasStops=(selected.schedule?.length||0)>0,canAdd=!selected.scheduleComplete&&trainStopped(selected)&&!adding,minimumStops=scheduleMinimumStops(),title=`${selected.name}: ${selectedTrainPartLabel(selected)}`,combatNote=selected.trainType==="combat"?`<div class="selection-subtitle">Moving defense train · Range ${displayStat(combatTrainRange())} hexes · ${displayStat(turretDamage())} damage every ${displayStat(combatTrainFireInterval())} seconds · Locomotive and Energy Supply restock only at Base</div>`:"",primary=adding?button("finish-schedule","Done Adding","btn-command","Finishes the schedule and automatically loops it back to Stop 1."):button("add-schedule","Add Schedule",canAdd?"btn-command":"btn-quiet",`Add ${minimumStops} to 9 Track or Destroyed Track Stops. The Train automatically loops back to Stop 1 when you click Done Adding.`,!canAdd),undo=adding?button("undo-last-stop","Undo Last Stop",hasStops?"btn-command":"btn-quiet","Removes the most recently added Stop.",!hasStops):"",actions=state.gameOver?"":`<div class="panel-actions">${primary}${undo}${button("clear-schedule","Clear Schedule",hasStops||adding?"btn-danger":"btn-quiet","Clears every Stop and stops the Train; while paused, it settles immediately onto the nearest Track hex.",!hasStops&&!adding)}</div>`;return `<div class="selection-title"><h2>${title}</h2></div>${combatNote}${hpBlock(selected)}<div class="status-bar energy"><span style="width:${selected.fuel/selected.maxFuel*100}%"></span></div><div class="status-caption"><span>ENERGY</span><span>${selected.fuel.toFixed(1)} / ${selected.maxFuel}</span></div>${cargoHtml(selected)}${actions}`;}
  if(selected.type==="turret")return `<div class="selection-title"><h2>Turret</h2></div><div class="selection-subtitle">Range ${displayStat(turretRange())} hexes · ${displayStat(turretDamage())} damage every ${displayStat(turretFireInterval())} seconds · Instantly refills when a stopped Build/Mine Train Locomotive is adjacent</div>${hpBlock(selected)}${energyBlock(selected)}`;
  if(selected.type==="artillery")return `<div class="selection-title"><h2>Artillery</h2></div><div class="selection-subtitle">Targets Hives only · Range ${displayStat(artilleryRange())} hexes · Lobs a shell every ${displayStat(artilleryFireInterval())} seconds · 10 Energy per shot · ${displayStat(artilleryDamageAtDistance(0))} center damage + ${displayStat(artilleryDamageAtDistance(1))} adjacent-ring damage + ${displayStat(artilleryDamageAtDistance(2))} outer-ring damage per hex · Creeps can take splash damage · No friendly fire</div>${hpBlock(selected)}${energyBlock(selected)}`;
  if(selected.type==="mine"){const node=resourceNodeAt(selected.q,selected.r),exhausted=node.amount<=0,title=`${exhausted?"Exhausted ":""}${resourceLabel(selected.resource)} Mine`,description=exhausted?"This Resource Node is exhausted":`A Train at an adjacent Stop instantly Mines and loads ${resourceLabel(selected.resource)} · ${displayStat(mineEfficiency())}× mining efficiency`;return `<div class="selection-title"><h2>${title}</h2></div><div class="selection-subtitle">${description}</div>${hpBlock(selected)}${resourceBlock(node)}`;}
  if(selected.type==="wall")return `<div class="selection-title"><h2>Wall</h2></div><div class="selection-subtitle">A Train at a Stop instantly repairs damaged Walls within 3 hexes</div>${hpBlock(selected)}`;
  if(selected.type==="research"){
    let currentGroup="";
    const upgrades=RESEARCH_UPGRADES.map(upgrade=>{const heading=upgrade.group!==currentGroup?(currentGroup=upgrade.group,`<h3 class="research-group-heading">${upgrade.group}</h3>`):"";return `${heading}${button(`research-${upgrade.key}`,`${upgrade.label} (${researchUpgradeCount(upgrade.key)+1})`,"btn-quiet","",state.researchPoints+1e-9<RESEARCH_UPGRADE_COST)}`;}).join("");
    const actions=state.gameOver?"":`<div class="panel-actions research-actions">${upgrades}</div>`;
    return `<div class="selection-title"><h2>Research</h2></div><div class="selection-subtitle">${displayStat(researchRate())} Research point(s) gained for each second of survival · All Research items cost 30 Research points · Upgrades apply instantly and can be researched indefinitely</div>${hpBlock(selected)}<div class="research-points-summary">Research Points <strong>${Math.floor(state.researchPoints)}</strong></div>${actions}`;
  }
  if(selected.type==="node")return `<div class="selection-title"><h2>${resourceLabel(selected.resource)} Node</h2></div>${resourceBlock(selected)}<div class="selection-subtitle">Build a Mine here to extract its resources</div>`;
  if(selected.type==="hive"){const rate=selected.level;return `<div class="selection-title"><h2>Level ${rate} Hive</h2></div><div class="selection-subtitle">${rate} Creeps per spawn cycle · 1 in ${rate} new Hive expansion chance</div>${hpBlock(selected)}`;}
  if(selected.type==="enemy")return `<div class="selection-title"><h2>Creep</h2></div>${hpBlock(selected)}`;
  if(selected.type==="ghost"){const name=selected.objectType==="track"?"Track":selected.objectType==="turret"?"Turret":selected.objectType==="artillery"?"Artillery":selected.objectType==="wall"?"Wall":selected.objectType==="research"?"Research":`${resourceLabel(selected.resource)} Mine`,scheduled=selected.objectType==="track"?scheduleStopAt(selected.q,selected.r):null,title=scheduled?`Destroyed Stop ${trainScheduleCode(scheduled.train)}${scheduled.index+1} (${scheduled.train.name})`:`Destroyed ${name}`,mineNode=selected.objectType==="mine"?resourceNodeAt(selected.q,selected.r):null,mineNote=mineNode?.amount>0?" Because this Resource Node still has resources, only a Mine can be built here.":"";return `<div class="selection-title"><h2>${title}</h2></div><div class="selection-subtitle">Destroyed · Any construction normally allowed on this terrain can replace this wreckage directly. An adjacent stopped Train carrying ${REBUILD_COSTS[selected.objectType]} Construction Material can rebuild the original object automatically. Salvage/Clear Object removes the wreckage without recovering resources.${mineNote}</div>`;}
  if(state.tracks.get(key(selected.q,selected.r))===selected){const scheduled=scheduleStopAt(selected.q,selected.r),title=scheduled?`Stop ${trainScheduleCode(scheduled.train)}${scheduled.index+1} (${scheduled.train.name})`:"Track";return `<div class="selection-title"><h2>${title}</h2></div>${hpBlock(selected)}`;}
  return `<div class="selection-empty">Unknown selection.</div>`;
}

function updateConstructionToolAvailability(){
  const tools=[
    ["select",ui.selectTool],["track",ui.trackTool],["turret",ui.turretTool],["mine",ui.mineTool],
    ["wall",ui.wallTool],["artillery",ui.artilleryTool],["salvage",ui.salvageTool],["research",ui.researchTool]
  ];
  if(!state.gameOver&&!constructionModeAffordable(state.mode)){
    state.mode="select";state.trackStart=null;canvas.style.cursor="default";
  }
  for(const [mode,tool] of tools){
    const unavailable=!state.gameOver&&!constructionModeAffordable(mode),disabled=state.gameOver&&mode!=="select";
    tool.disabled=disabled;tool.ariaDisabled=String(disabled||unavailable);tool.classList.toggle("unavailable",unavailable);tool.classList.toggle("active",mode===state.mode);
  }
}

function setDebugMenuOpen(open){
  ui.debugMenu.hidden=!open;ui.debugMenu.classList.toggle("d-none",!open);ui.debugToggle.ariaExpanded=String(open);
  if(!open&&state.mode.startsWith("debug-"))setMode("select");
  return open;
}

function updateDebugUI(){
  ui.debugDestroyObject.disabled=state.gameOver;ui.debugAddCreep.disabled=state.gameOver;ui.debugAddBaseResources.disabled=state.gameOver;ui.debugAddResearchPoints.disabled=state.gameOver;
  ui.debugDestroyObject.classList.toggle("active",state.mode==="debug-destroy");
  ui.debugAddCreep.classList.toggle("active",state.mode==="debug-add-creep");
}

function showTurretEnergyWarning(){
  if(state.turretEnergyWarningShown||state.gameOver)return false;
  state.turretEnergyWarningShown=true;state.turretEnergyWarningWasPaused=state.paused;state.paused=true;simulationAccumulator=0;
  ui.turretEnergyDialog.hidden=false;ui.turretEnergyDialog.classList.remove("d-none");updateUI(true);render();setTimeout(()=>ui.turretEnergyOkay.focus(),0);return true;
}

function dismissTurretEnergyWarning(){
  if(ui.turretEnergyDialog.hidden)return false;
  ui.turretEnergyDialog.hidden=true;ui.turretEnergyDialog.classList.add("d-none");state.paused=state.turretEnergyWarningWasPaused;lastWallTime=Date.now();simulationAccumulator=0;updateUI(true);render();canvas.focus();return true;
}

function connectedUnminedResources(){
  const totals={material:0,energy:0};
  const liveStops=state.trains.filter(train=>train.scheduleComplete).flatMap(train=>(train.schedule||[]).filter(stop=>state.tracks.has(key(stop.q,stop.r))));
  for(const mine of state.structures.values()){
    if(mine.type!=="mine"||mine.hp<=0||!liveStops.some(stop=>hexDistance(stop,mine)===1))continue;
    const node=resourceNodeAt(mine.q,mine.r);
    if(node?.amount>0)totals[mine.resource]+=node.amount;
  }
  return totals;
}

function updateUI(force=false){
  updateConstructionToolAvailability();
  updateDebugUI();
  const paused=state.paused||state.gameOver,pauseStatus=paused?"paused":"playing";setStatusButtonMarkup(ui.pauseToggle,pauseStatus,`${statusIcon(paused?"pause":"play")}<span>${paused?"Paused":"Playing"}</span>`);ui.pauseToggle.classList.toggle("status-playing",!paused);ui.pauseToggle.classList.toggle("status-paused",paused);ui.pauseToggle.disabled=state.gameOver||tutorialLocksPause();ui.pauseToggle.ariaLabel=paused?"Play simulation":"Pause simulation";
  const soundStatus=state.sound?"sound-on":"sound-off";setStatusButtonMarkup(ui.soundToggle,soundStatus,`${statusIcon(soundStatus)}<span>Sound: ${state.sound?"ON":"OFF"}</span>`);ui.soundToggle.classList.toggle("status-sound-on",state.sound);ui.soundToggle.classList.toggle("status-sound-off",!state.sound);ui.baseEnergyHud.textContent=Math.floor(state.baseEnergy);ui.baseMaterialHud.textContent=Math.floor(state.baseMaterial);const unmined=connectedUnminedResources();ui.unminedMaterialHud.textContent=Math.floor(unmined.material);ui.unminedEnergyHud.textContent=Math.floor(unmined.energy);ui.researchPointsHud.textContent=state.researchUnlocked?Math.floor(state.researchPoints):"-";ui.timeSurvived.textContent=formatSurvivalTime(state.elapsed);
  const hasSelection=Boolean(getSelected());ui.selectionLabel.hidden=!hasSelection;
  const selectionMarkup=selectionHtml();
  if(force||selectionMarkup!==selectionCache){disposeTooltips(selectionContent);selectionContent.innerHTML=selectionMarkup;selectionCache=selectionMarkup;initializeTooltips(selectionContent);}
}

function initializeTooltips(root=document){if(!window.bootstrap)return;root.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(element=>bootstrap.Tooltip.getOrCreateInstance(element,{container:"body",trigger:"hover focus"}));}
function disposeTooltips(root){if(!window.bootstrap)return;root.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(element=>bootstrap.Tooltip.getInstance(element)?.dispose());}

function formatSurvivalTime(seconds){const total=Math.max(0,Math.floor(seconds)),hours=Math.floor(total/3600),minutes=Math.floor(total%3600/60);return `${String(hours).padStart(2,"0")}h ${String(minutes).padStart(2,"0")}m ${String(total%60).padStart(2,"0")}s`;}

function showReminders(){
  remindersOpen=true;simulationAccumulator=0;
  syncTutorialUI();
  ui.remindersDialog.hidden=false;ui.remindersDialog.classList.remove("d-none");
  setTimeout(()=>ui.remindersContinue.focus(),0);
}

function closeReminders(){
  remindersOpen=false;ui.remindersDialog.hidden=true;ui.remindersDialog.classList.add("d-none");
  lastWallTime=Date.now();simulationAccumulator=0;resetPerformanceMetrics();sounds.init();render();
}
