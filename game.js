"use strict";

if(window.__HYLAAX_TEST__){
  window.__HYLAAX_TEST_API__={
    constants:{NODE_MIN_CAPACITY,NODE_MAX_CAPACITY,INITIAL_HIVE_COUNT,ENEMY_SPEED,SIMULATION_STEP,TRACK_HIT_POINTS,REPAIR_PAUSE_SECONDS,TURRET_RANGE,COMBAT_TRAIN_RANGE,BASE_UNLOAD_TARGET,HIVE_LEVELS,COSTS,REBUILD_COSTS,DIRECTIONS},
    get state(){return state;},
    reset({mapSeed=123456789,seedHives=false}={}){
      state=makeInitialState();state.mapSeed=mapSeed;state.hives.clear();state.enemies=[];state.projectiles=[];state.particles=[];
      terrainCacheSeed=null;terrainCache=new Map();terrainRevision=0;simulationAccumulator=0;selectionCache="";remindersOpen=false;sounds.enabled=false;
      resetEnemyNavigation();if(seedHives)seedInitialHives();return state;
    },
    key,fromKey,hexDistance,neighbors,axialToWorld,worldToAxial,terrainAt,isPassable,resourceNodeAt,setNodeAmount,
    getSelected,setMode,select,structureAt,ghostAt,trainAt,trainSegmentAt,handleHexClick,
    trainCode,trainName,trainSegments,trainStopped,totalCargo,cargoSpace,removeCargo,addCargo,fillBaseCargo,refuelAtBase,serviceBaseLogistics,
    connectedTrackNeighbors,conceptualTrackNeighbors,tracksAreLinked,linkTracks,deleteTrack,curveIsExtreme,layTrack,placeTrackOverGhost,salvageStructure,
    scheduleStopAt,addScheduleStop,clearTrainSchedule,findPath,findConceptualTrackPath,repairApproachFor,scheduleLoopIsReachable,startScheduledLeg,updateTrainSchedules,
    hiveUnlockedLevel,nextHiveLevel,hiveExpansionLevel,createHive,hiveHexOpen,hiveReplicationRoll,hiveSpawnCandidates,spawnHiveNear,spawnEnemyFromHive,updateHives,
    showTrainEnergyWarning,updateTrainEnergyWarnings,updateAutomaticRepair,updateAutomaticLogistics,updateAutomaticRebuild,leaveGhost,rebuildGhost,damageTarget,
    resetEnemyNavigation,rebuildEnemyNavigation,ensureEnemyNavigation,nextEnemyNavigationStep,enemyNavigationStats,findEnemyStep,updateEnemies,
    updateTrains,updateCombatTrains,updateStructures,update,advanceSimulation,
    activityColor,showWorldActivity,worldMessagePriority,worldMessageLayout,terrainLayerStats,ensureTerrainLayer,render,
    selectionHtml,updateUI,formatSurvivalTime
  };
}

canvas.addEventListener("pointerdown",e=>{sounds.init();canvas.setPointerCapture(e.pointerId);const p=state.pointer;p.down=true;p.moved=false;p.startX=p.x=e.clientX;p.startY=p.y=e.clientY;p.camX=state.camera.x;p.camY=state.camera.y;canvas.focus();});
canvas.addEventListener("pointermove",e=>{state.hover=screenToHex(e.clientX,e.clientY);const p=state.pointer;if(!p.down){if(state.paused||state.gameOver)render();return;}p.x=e.clientX;p.y=e.clientY;const dx=p.x-p.startX,dy=p.y-p.startY;if(Math.hypot(dx,dy)>4)p.moved=true;if(p.moved){state.camera.x=p.camX-dx/state.camera.zoom;state.camera.y=p.camY-dy/state.camera.zoom;canvas.style.cursor="grabbing";render();}});
canvas.addEventListener("pointerup",e=>{const p=state.pointer;if(!p.down)return;p.down=false;canvas.style.cursor=state.mode==="select"?"default":"crosshair";if(!p.moved)handleHexClick(screenToHex(e.clientX,e.clientY));});
canvas.addEventListener("pointerleave",()=>{state.hover=null;if(!state.pointer.down)canvas.style.cursor=state.mode==="select"?"default":"crosshair";});
canvas.addEventListener("wheel",e=>{e.preventDefault();const rect=canvas.getBoundingClientRect(),sx=e.clientX-rect.left,sy=e.clientY-rect.top;const beforeX=(sx-width/2)/state.camera.zoom+state.camera.x,beforeY=(sy-height/2)/state.camera.zoom+state.camera.y;const factor=Math.exp(-e.deltaY*.0012);state.camera.zoom=clamp(state.camera.zoom*factor,.42,2.15);state.camera.x=beforeX-(sx-width/2)/state.camera.zoom;state.camera.y=beforeY-(sy-height/2)/state.camera.zoom;render();},{passive:false});

document.addEventListener("click",e=>{const modeButton=e.target.closest("[data-mode]");if(modeButton){setMode(modeButton.dataset.mode);return;}const actionButton=e.target.closest("[data-action]");if(actionButton&&!actionButton.disabled)handleAction(actionButton.dataset.action,actionButton);});
document.addEventListener("keydown",e=>{if(remindersOpen){if(e.key==="Escape"||e.key==="Enter")closeReminders();return;}if(!ui.confirmDialog.hidden){if(e.key==="Escape")cancelTrainSalvage();return;}if(e.target.matches("input,textarea"))return;if(e.key>="1"&&e.key<="5"){setMode(["select","track","turret","mine","salvage"][Number(e.key)-1]);}if(e.key==="Escape")setMode("select");});
document.querySelectorAll("[data-mode]").forEach(button=>button.addEventListener("click",()=>sounds.init()));
ui.pauseToggle.addEventListener("click",()=>{if(state.gameOver)return;state.paused=!state.paused;simulationAccumulator=0;lastWallTime=Date.now();updateUI(true);render();});
ui.soundToggle.addEventListener("click",()=>{state.sound=!state.sound;sounds.enabled=state.sound;if(state.sound)sounds.place();updateUI(true);});
ui.remindersContinue.addEventListener("click",closeReminders);
ui.confirmNo.addEventListener("click",cancelTrainSalvage);
ui.confirmYes.addEventListener("click",confirmTrainSalvage);
ui.viewMapButton.addEventListener("click",showFinalMap);
ui.viewFinalStats.addEventListener("click",showFinalStats);
ui.restartButton.addEventListener("click",()=>{state=makeInitialState();resetEnemyNavigation();seedInitialHives();lastWallTime=Date.now();simulationAccumulator=0;resetPerformanceMetrics();selectionCache="";ui.gameOver.hidden=true;ui.gameOver.classList.add("d-none");ui.viewFinalStats.hidden=true;ui.viewFinalStats.classList.add("d-none");ui.confirmDialog.hidden=true;ui.confirmDialog.classList.add("d-none");setMode("select");showReminders();});
document.addEventListener("visibilitychange",()=>{if(!document.hidden){const now=Date.now();advanceSimulation((now-lastWallTime)/1000);lastWallTime=now;resetPerformanceMetrics();render();}});
window.addEventListener("resize",resize);
ui.gameOver.hidden=true;ui.viewFinalStats.hidden=true;ui.confirmDialog.hidden=true;resize();initializeTooltips();updateUI(true);showReminders();
function frame(frameTime){const now=Date.now(),ticks=advanceSimulation((now-lastWallTime)/1000);lastWallTime=now;const rendered=ticks>0;if(rendered)render();recordPerformance(frameTime,ticks,rendered);requestAnimationFrame(frame);}requestAnimationFrame(frame);
