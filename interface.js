"use strict";

function hpBlock(object){const ratio=clamp(object.hp/object.maxHp*100,0,100);return `<div class="status-bar"><span style="width:${ratio}%"></span></div><div class="status-caption"><span>Hit points</span><span>${Math.ceil(object.hp)} / ${Math.ceil(object.maxHp)}</span></div>`;}
function energyBlock(object,label="Energy"){const ratio=clamp(object.energy/object.maxEnergy*100,0,100);return `<div class="status-bar energy"><span style="width:${ratio}%"></span></div><div class="status-caption"><span>${label}</span><span>${Math.floor(object.energy)} / ${object.maxEnergy}</span></div>`;}
function resourceBlock(node){const ratio=clamp(node.amount/node.maxAmount*100,0,100);return `<div class="status-bar resource"><span style="width:${ratio}%"></span></div><div class="status-caption"><span>Resource units</span><span>${Math.floor(node.amount)} / ${node.maxAmount}</span></div>`;}
function cargoHtml(train){if(!train.wagons.length)return `<div class="action-note">No supplies attached.</div>`;return `<div class="cargo-list">${train.wagons.map((w,i)=>`<div class="cargo-row ${w.type||"empty"}"><i></i><span>Supply ${i+1} · ${w.type?resourceLabel(w.type):"empty"}</span><strong>${Math.floor(w.amount)} / ${w.capacity}</strong></div>`).join("")}</div>`;}
function baseInventoryHtml(){return `<div class="cargo-list">${BASE_RESOURCE_TYPES.map(resource=>`<div class="cargo-row ${resource.key}" data-base-resource="${resource.key}"><i></i><span>${capitalize(resource.label)}</span><strong>${Math.floor(state[resource.stateKey]||0)}</strong></div>`).join("")}</div>`;}
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
  if(!segmentId||segmentId===train.id)return "locomotive";
  const wagon=train.wagons.find(candidate=>candidate.id===segmentId);
  if(!wagon)return "locomotive";
  const role=wagon.role||wagon.type;
  if(role==="energy")return "energy supply";
  if(role==="material")return "construction material supply";
  return `supply ${train.wagons.indexOf(wagon)+1}`;
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
    const builderUnavailable=trainFabricationDisabledReason("builder"),combatUnavailable=trainFabricationDisabledReason("combat"),canPlaceBuilder=!builderUnavailable,canPlaceCombat=!combatUnavailable,builderUnavailableTip=builderUnavailable?`&#10;• Unavailable: ${builderUnavailable}`:"",combatUnavailableTip=combatUnavailable?`&#10;• Unavailable: ${combatUnavailable}`:"",deployLength=state.deploymentTrainType==="combat"?2:3,deployDistance=deployLength===2?"one":"two";
    const deployNote=state.mode==="deploy"?`<div class="action-note">${state.deploymentHead?`Head selected. Click a highlighted tail point exactly ${deployDistance} connected track ${deployDistance==="one"?"hex":"hexes"} away.`:`Click an empty track hex for the head, then click a highlighted tail point. ${deployLength} connected track hexes must be clear.`}</div>`:"";
    const builderTip=`• Costs ${COSTS.train.material} C, ${COSTS.train.energy} E&#10;• Places one locomotive with an empty construction material supply and an empty energy supply.&#10;• Mines resources, repairs buildings, rebuilds destroyed track, supplies turrets and artillery with shot energy${builderUnavailableTip}`;
    const combatTip=`• Costs ${COSTS.combatTrain.material} C, ${COSTS.combatTrain.energy} E&#10;• Places one locomotive with one energy supply holding 10 energy.&#10;• Automatically fires at hives and creeps within 6 hexes, including while moving.&#10;• Must normally be refueled and have shot energy resupplied from the base (cannot be supplied by mines); another train can provide emergency fuel when it has no fuel energy remaining${combatUnavailableTip}`;
    const actions=state.gameOver?"":`<div class="panel-actions">${button("fabricate-place-builder-train","Fabricate and place build/mine train",canPlaceBuilder?"btn-command":"btn-quiet",builderTip,!canPlaceBuilder)}${button("fabricate-place-combat-train","Fabricate and place turret train",canPlaceCombat?"btn-cyan":"btn-quiet",combatTip,!canPlaceCombat)}</div>`;
    const unloadingNote=destroyed?"":`<div class="selection-subtitle">Trains will only fill resources to 110 units so that they don't endlessly dump resources into the base and starve buildings that need those resources</div>`;
    return `<div class="selection-title"><h2>${destroyed?"Destroyed base":"Base"}</h2></div>${destroyed?`<div class="selection-subtitle">Destroyed · The base cannot be rebuilt or salvaged</div>`:""}${hpBlock(selected)}${baseInventoryHtml()}${unloadingNote}${state.gameOver?"":deployNote}${actions}`;
  }
  if(selected.wagons){const adding=state.mode==="schedule"&&state.scheduleTrainId===selected.id,hasStops=(selected.schedule?.length||0)>0,canAdd=!selected.scheduleComplete&&trainStopped(selected)&&!adding,minimumStops=scheduleMinimumStops(),title=`${selected.name}: ${selectedTrainPartLabel(selected)}`,combatNote=selected.trainType==="combat"?`<div class="selection-subtitle">A mobile turret train · Shot range 6 hexes · 1 damage every 1 second(s) · Restocks its fuel energy and shot energy at base · Another train can provide emergency fuel when it has no fuel energy remaining</div>`:"",primary=adding?button("finish-schedule","Done adding","btn-command","Finishes the schedule and automatically loops it back to stop 1."):button("add-schedule","Add schedule",canAdd?"btn-command":"btn-quiet",`Add ${minimumStops} to 9 track or destroyed track stops. The train automatically loops back to stop 1 when you click Done adding.`,!canAdd),undo=adding?button("undo-last-stop","Undo last stop",hasStops?"btn-command":"btn-quiet","Removes the most recently added stop.",!hasStops):"",actions=state.gameOver?"":`<div class="panel-actions">${primary}${undo}${button("clear-schedule","Clear schedule",hasStops||adding?"btn-danger":"btn-quiet","Clears every stop and stops the train; while paused, it settles immediately onto the nearest track hex.",!hasStops&&!adding)}</div>`;return `<div class="selection-title"><h2>${title}</h2></div>${combatNote}${hpBlock(selected)}<div class="status-bar energy"><span style="width:${selected.fuel/selected.maxFuel*100}%"></span></div><div class="status-caption"><span>Energy for fuel</span><span>${selected.fuel} / ${selected.maxFuel}</span></div>${cargoHtml(selected)}${actions}`;}
  if(selected.type==="turret")return `<div class="selection-title"><h2>Turret</h2></div><div class="selection-subtitle">Range ${displayStat(turretRange())} hexes · Shoots every ${displayStat(turretFireInterval())} second(s) for ${displayStat(turretDamage())} damage · Instantly refills when a build/mine train is stopped at an adjacent non-destroyed train stop</div>${hpBlock(selected)}${energyBlock(selected,"Energy for shots")}`;
  if(selected.type==="artillery")return `<div class="selection-title"><h2>Artillery</h2></div><div class="selection-subtitle">Targets hives only · Range ${displayStat(artilleryRange())} hexes · Shoots every ${displayStat(artilleryFireInterval())} seconds · Uses 10 energy per shot · ${displayStat(artilleryDamageAtDistance(0))} center damage + ${displayStat(artilleryDamageAtDistance(1))} adjacent-ring damage + ${displayStat(artilleryDamageAtDistance(2))} outer-ring damage per hex · Creeps can take splash damage · No friendly fire</div>${hpBlock(selected)}${energyBlock(selected,"Energy for shots")}`;
  if(selected.type==="mine"){const node=resourceNodeAt(selected.q,selected.r),exhausted=node.amount<=0,title=`${exhausted?"Exhausted ":""}${resourceLabel(selected.resource)} mine`,description=exhausted?"This resource node is exhausted":`A train stopped at an adjacent non-destroyed train stop instantly mines and loads ${resourceLabel(selected.resource)} · ${displayStat(mineEfficiency())}× mining efficiency`;return `<div class="selection-title"><h2>${capitalize(title)}</h2></div><div class="selection-subtitle">${description}</div>${hpBlock(selected)}${resourceBlock(node)}`;}
  if(selected.type==="wall")return `<div class="selection-title"><h2>Wall</h2></div><div class="selection-subtitle">A train stopped at a non-destroyed train stop instantly repairs damaged walls within ${WALL_SERVICE_RANGE} hexes</div>${hpBlock(selected)}`;
  if(selected.type==="research"){
    let currentGroup="";
    const upgrades=RESEARCH_UPGRADES.map(upgrade=>{const heading=upgrade.group!==currentGroup?(currentGroup=upgrade.group,`<h3 class="research-group-heading">${upgrade.group}</h3>`):"";return `${heading}${button(`research-${upgrade.key}`,`${upgrade.label} (${researchUpgradeCount(upgrade.key)+1})`,"btn-quiet","",state.researchPoints+1e-9<RESEARCH_UPGRADE_COST)}`;}).join("");
    const actions=state.gameOver?"":`<div class="panel-actions research-actions">${upgrades}</div>`;
    return `<div class="selection-title"><h2>Research building</h2></div><div class="selection-subtitle">${displayStat(researchRate())} research point(s) gained for each second of survival · All research items cost 30 research points · Upgrades apply instantly and can be researched indefinitely</div>${hpBlock(selected)}<div class="research-points-summary">Research points <strong>${Math.floor(state.researchPoints)}</strong></div>${actions}`;
  }
  if(selected.type==="node")return `<div class="selection-title"><h2>${capitalize(resourceLabel(selected.resource))} node</h2></div>${resourceBlock(selected)}<div class="selection-subtitle">Build a mine here to extract its resources</div>`;
  if(selected.type==="hive"){const rate=selected.level;return `<div class="selection-title"><h2>Level ${rate} hive</h2></div><div class="selection-subtitle">Periodically produces either ${rate} more creeps or a new hive · 1 in ${rate} chance of a hive spawn</div>${hpBlock(selected)}`;}
  if(selected.type==="enemy")return `<div class="selection-title"><h2>Creep</h2></div>${hpBlock(selected)}`;
  if(selected.type==="ghost"){const name=selected.objectType==="track"?"track":selected.objectType==="turret"?"turret":selected.objectType==="artillery"?"artillery":selected.objectType==="wall"?"wall":selected.objectType==="research"?"research building":`${resourceLabel(selected.resource)} mine`,scheduled=selected.objectType==="track"?scheduleStopAt(selected.q,selected.r):null,title=scheduled?`Destroyed stop ${trainScheduleCode(scheduled.train)}${scheduled.index+1} (${scheduled.train.name})`:`Destroyed ${name}`,mineNode=selected.objectType==="mine"?resourceNodeAt(selected.q,selected.r):null,mineNote=mineNode?.amount>0?" Because this resource node still has resources, only a mine can be built here.":"",rebuildNote=selected.objectType==="track"?`An adjacent stopped train carrying ${REBUILD_COSTS.track} construction material can rebuild destroyed track even when the train is not at a stop.`:`A train stopped at an adjacent non-destroyed train stop and carrying ${REBUILD_COSTS[selected.objectType]} construction material can rebuild the original object automatically.`;return `<div class="selection-title"><h2>${title}</h2></div><div class="selection-subtitle">Destroyed · Any construction normally allowed on this terrain can replace this wreckage directly. ${rebuildNote} Salvage/clear object removes the wreckage without recovering resources.${mineNote}</div>`;}
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

function beginSelectionInteraction(){selectionInteractionActive=true;}

function finishSelectionInteraction(){
  selectionInteractionActive=false;
  if(!selectionRefreshPending)return;
  const force=selectionRefreshPendingForce;
  selectionRefreshPending=false;selectionRefreshPendingForce=false;updateUI(force);
}

function scheduleSelectionInteractionFinish(){setTimeout(finishSelectionInteraction,0);}

function currentSelectionCacheKey(){
  const selected=getSelected();
  if(!selected)return "none";
  const baseKey=`${state.selected?.type||selected.type}:${state.selected?.id||selected.id}:${state.selected?.segmentId||""}:${state.gameOver}`;
  if(selected.type!=="base")return baseKey;
  return `${baseKey}:${selected.hp<=0}:${state.mode}:${Boolean(state.deploymentHead)}:${Boolean(trainFabricationDisabledReason("builder"))}:${Boolean(trainFabricationDisabledReason("combat"))}`;
}

function researchSelectionDescription(){return `${displayStat(researchRate())} research point(s) gained for each second of survival · All research items cost 30 research points · Upgrades apply instantly and can be researched indefinitely`;}

function updateResearchSelectionContent(research){
  const query=selector=>selectionContent.querySelector?.(selector)||null;
  const subtitle=query(".selection-subtitle");if(subtitle)subtitle.textContent=researchSelectionDescription();
  const hpFill=query(".status-bar > span");if(hpFill)hpFill.style.width=`${clamp(research.hp/research.maxHp*100,0,100)}%`;
  const hpValue=query(".status-caption span:last-child");if(hpValue)hpValue.textContent=`${Math.ceil(research.hp)} / ${Math.ceil(research.maxHp)}`;
  const points=query(".research-points-summary strong");if(points)points.textContent=Math.floor(state.researchPoints);
  for(const upgrade of RESEARCH_UPGRADES){
    const upgradeButton=query(`[data-action="research-${upgrade.key}"]`);if(!upgradeButton)continue;
    upgradeButton.textContent=`${upgrade.label} (${researchUpgradeCount(upgrade.key)+1})`;
    const disabled=state.researchPoints+1e-9<RESEARCH_UPGRADE_COST;upgradeButton.disabled=disabled;upgradeButton.setAttribute("aria-disabled",String(disabled));
  }
}

function updateBaseSelectionContent(base){
  const query=selector=>selectionContent.querySelector?.(selector)||null;
  const hpFill=query(".status-bar > span");if(hpFill)hpFill.style.width=`${clamp(base.hp/base.maxHp*100,0,100)}%`;
  const hpValue=query(".status-caption span:last-child");if(hpValue)hpValue.textContent=`${Math.ceil(base.hp)} / ${Math.ceil(base.maxHp)}`;
  for(const resource of BASE_RESOURCE_TYPES){const value=query(`[data-base-resource="${resource.key}"] strong`);if(value)value.textContent=Math.floor(state[resource.stateKey]||0);}
}

function updateUI(force=false){
  updateConstructionToolAvailability();
  updateDebugUI();
  const paused=state.paused||state.gameOver,pauseStatus=paused?"paused":"playing";setStatusButtonMarkup(ui.pauseToggle,pauseStatus,`${statusIcon(paused?"pause":"play")}<span>${paused?"Paused":"Playing"}</span>`);ui.pauseToggle.classList.toggle("status-playing",!paused);ui.pauseToggle.classList.toggle("status-paused",paused);ui.pauseToggle.disabled=state.gameOver||tutorialLocksPause();ui.pauseToggle.ariaLabel=paused?"Play simulation":"Pause simulation";
  const soundStatus=state.sound?"sound-on":"sound-off";setStatusButtonMarkup(ui.soundToggle,soundStatus,`${statusIcon(soundStatus)}<span>Sound: ${state.sound?"on":"off"}</span>`);ui.soundToggle.classList.toggle("status-sound-on",state.sound);ui.soundToggle.classList.toggle("status-sound-off",!state.sound);ui.baseEnergyHud.textContent=Math.floor(state.baseEnergy);ui.baseMaterialHud.textContent=Math.floor(state.baseMaterial);const unmined=connectedUnminedResources();ui.unminedMaterialHud.textContent=Math.floor(unmined.material);ui.unminedEnergyHud.textContent=Math.floor(unmined.energy);ui.researchPointsHud.textContent=state.researchUnlocked?Math.floor(state.researchPoints):0;ui.timeSurvived.textContent=formatSurvivalTime(state.elapsed);
  const selected=getSelected(),hasSelection=Boolean(selected);ui.selectionLabel.hidden=!hasSelection;
  const selectionMarkup=selectionHtml(),cacheKey=currentSelectionCacheKey();
  if(force||selectionMarkup!==selectionCache){
    if(selectionInteractionActive){selectionRefreshPending=true;selectionRefreshPendingForce||=force;return;}
    if(selected?.type==="research"&&cacheKey===selectionCacheKey&&selectionCache){updateResearchSelectionContent(selected);selectionCache=selectionMarkup;return;}
    if(selected?.type==="base"&&cacheKey===selectionCacheKey&&selectionCache){updateBaseSelectionContent(selected);selectionCache=selectionMarkup;return;}
    disposeTooltips(selectionContent);selectionContent.innerHTML=selectionMarkup;selectionCache=selectionMarkup;initializeTooltips(selectionContent);
  }
  selectionCacheKey=cacheKey;
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
  lastWallTime=Date.now();simulationAccumulator=0;sounds.init();render();
}
