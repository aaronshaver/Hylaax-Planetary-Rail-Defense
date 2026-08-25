"use strict";

if(window.__HYLAAX_TEST__){
  window.__HYLAAX_TEST_API__={
    constants:{NODE_MIN_CAPACITY,NODE_MAX_CAPACITY,ENERGY_NODE_MIN_CAPACITY,ENERGY_NODE_MAX_CAPACITY,BASE_TRAIN_STOP_SECONDS,TRAIN_ACTIVITY_MESSAGE_SECONDS,ENEMY_SPEED,CREEP_ATTACK_INTERVAL,CREEP_ATTACK_DAMAGE,COMBAT_BEAM_RENDER_CAP,COMBAT_DEATH_FLASH_RENDER_CAP,UNIT_SHADOW_RENDER_LIMIT,UNIT_DEATH_FLASH_SECONDS,UNIT_LIFESPAN_SECONDS,SIMULATION_STEP,TRACK_HIT_POINTS,TRAIN_HIT_POINTS,WALL_HIT_POINTS,TURRET_HIT_POINTS,RESEARCH_HIT_POINTS,RESEARCH_UPGRADE_COST,NEUTRALIZER_BUILDING_HIT_POINTS,NEUTRALIZER_BASE_HIT_POINTS,NEUTRALIZER_BASE_DAMAGE,NEUTRALIZER_ATTACK_INTERVAL,NEUTRALIZER_SPEED,NEUTRALIZER_BASE_STORAGE,NEUTRALIZER_PRODUCTION_INTERVAL,NEUTRALIZER_UNIT_MATERIAL_COST,NEUTRALIZER_UNIT_ENERGY_COST,NEUTRALIZER_LIVING_CAP,NEUTRALIZER_TARGET_REFRESH_SECONDS,NEUTRALIZER_PATH_SEARCHES_PER_TICK,NEUTRALIZER_PATH_CACHE_SECONDS,TRAIN_LOSS_SHAKE_SECONDS,ENEMY_SPAWN_BUFFER,REPAIR_PAUSE_SECONDS,WALL_SERVICE_RANGE,SALVAGE_BURST_SCALE,TURRET_RANGE,COMBAT_TRAIN_RANGE,ARTILLERY_RANGE,ARTILLERY_HIT_POINTS,ARTILLERY_MAX_ENERGY,ARTILLERY_FIRE_INTERVAL,ARTILLERY_SHELL_FLIGHT_SECONDS,ARTILLERY_BLAST_SECONDS,ARTILLERY_SHOT_ENERGY,ARTILLERY_CENTER_DAMAGE,ARTILLERY_SPLASH_DAMAGE,ARTILLERY_OUTER_SPLASH_DAMAGE,CREEP_HEX_CAPACITY,CREEP_SLOT_RADIUS,CREEP_RENDER_SCALE,BASE_UNLOAD_TARGET,BASE_FOOTPRINT_OFFSETS,HIVE_LEVELS,COSTS,REBUILD_COSTS,BASE_RESOURCE_TYPES,TRAIN_CAR_COLORS,DIRECTIONS,RESEARCH_UPGRADES},
    get state(){return state;},
    get staticWorldLayers(){return staticWorldLayers;},
    sounds,
    reset({mapSeed=123456789}={}){
      state=makeInitialState();state.mapSeed=mapSeed;state.hives.clear();state.enemies=[];state.neutralizerPathCursor=0;state.projectiles=[];state.particles=[];
      terrainCacheSeed=null;terrainCache=new Map();terrainReachabilitySeed=null;terrainReachabilityCache=new Map();terrainRevision=0;simulationAccumulator=0;selectionCache="";selectionCacheKey="";selectionInteractionActive=false;selectionRefreshPending=false;selectionRefreshPendingForce=false;zoomGestureActive=false;zoomRenderPending=false;panRenderPending=false;zoomSettleTimer=null;activeRenderBounds=null;invalidateStaticWorldLayers();remindersOpen=false;sounds.enabled=false;
      resetEnemyNavigation();return state;
    },
    key,fromKey,hexDistance,neighbors,unitHexIndex,unitSpaceReservations,indexedUnitsAt,indexedUnitsInRange,nearestIndexedUnit,creepOccupiesHex,neutralizerOccupiesHex,footprintPerimeter,axialToWorld,worldToAxial,hexLineBetween,hasClearShot,baseTerrainAt,resourceHasOpenApproach,terrainAt,terraformLand,hiveBlockerFootprint,hiveBlockerCellClear,hiveBlockerPlacementCost,placeHiveBlocker,isPassable,unitCanTraverse,unitTraversalCost,terrainCanReachBase,resourceNodeAt,setNodeAmount,centerMapOnBase,
    getSelected,setMode,select,structureAt,structureFootprint,distanceToStructure,nearestStructureCell,structureWorldCenter,basePerimeter,ghostAt,trainAt,trainSegmentAt,handleHexClick,
    researchUpgrade,researchUpgradeCount,researchUpgradeMaxLevel,researchMultiplier,turretFireInterval,combatTrainFireInterval,turretDamage,turretRange,combatTrainRange,turretEnergyStorage,mineEfficiency,trainCapacity,trainSpeed,loadUnloadDuration,artilleryFireInterval,artilleryDamage,artilleryDamageAtDistance,artilleryRange,artilleryEnergyStorage,wallHitPoints,trackHitPoints,researchRate,neutralizerHitPoints,neutralizerFireInterval,neutralizerDamage,neutralizerSpeed,neutralizerProductionInterval,neutralizerStorage,researchFootprintCandidates,researchPlacementFootprint,researchPreviewFootprint,buildResearch,applyResearchUpgrade,purchaseResearchUpgrade,updateResearch,addResearchPoints,
    trainCode,trainName,randomTrainColorShade,trainCarColor,trainSegments,trainStopped,totalCargo,cargoSpace,removeCargo,addCargo,fillBaseCargo,refuelAtBase,serviceBaseLogistics,
    connectedTrackNeighbors,conceptualTrackNeighbors,tracksAreLinked,linkTracks,deleteTrack,curveIsExtreme,resupplyTrainStops,trainStopWithinRange,constructionStopRequirement,requireNearbyTrainStop,requireNoCreep,requireNoUnit,layTrack,placeTrackOverGhost,buildTurret,buildMine,buildWall,buildGate,buildArtillery,clearDepletedResourceNode,salvageBurst,salvageStructure,clearGhost,requestTrainSalvage,requestResearchSalvage,cancelTrainSalvage,confirmTrainSalvage,deploymentPathsFrom,deployTrain,
    scheduleStopAt,addScheduleStop,finishSchedule,undoLastScheduleStop,discardScheduleDraft,clearTrainSchedule,findPath,findConceptualTrackPath,repairApproachFor,scheduleMinimumStops,scheduleLoopIsReachable,startScheduledLeg,updateTrainSchedules,
    hiveUnlockedLevel,nextHiveLevel,hiveExpansionLevel,createHive,hiveHexOpen,hiveReplicationRoll,hiveSpawnCandidates,spawnHiveNear,spawnEnemyAt,spawnEnemyFromHive,spawnCreepBatch,creepSpawnDelaySeconds,queueCreepBatch,queueHiveSpawn,runPendingHiveSpawns,runPendingCreepBatches,debugAddHiveAt,debugAddMaxCreepsAt,playerConstructionAnchors,outsidePlayerConstructionBuffer,encroachingHiveLocation,spawnEncroachingHive,encroachingHiveCount,updateEncroachingHives,runDueHiveCycles,produceHiveOperation,runNewHiveCycle,updateHives,
    trainOccupiedHexKeys,trainsShareHex,snapTrainToGrid,emergencyRefuelTrain,updateEmergencyTrainRefueling,showTrainEnergyWarning,updateTrainEnergyWarnings,repairPriority,updateAutomaticRepair,mineFromStructure,finalMineTopUp,updateAutomaticLogistics,updateAutomaticRebuild,leaveGhost,rebuildGhost,trainPartDestroyed,damageTarget,damageEnemy,debugDestroyAt,
    enemySlotOffset,enemyWorldPosition,reserveEnemySpace,releaseEnemySpace,enemySpaceReservations,enemyHexHasRoom,chooseEnemySpaceSlot,resetEnemyNavigation,rebuildEnemyNavigation,ensureEnemyNavigation,nextEnemyNavigationStep,adjacentEnemyTarget,enemyNavigationStats,findEnemyPath,findEnemyStep,expireCreeps,updateEnemies,
    neutralizerFootprintCandidates,neutralizerCellAvailable,neutralizerPlacementFootprint,neutralizerPreviewFootprint,showNeutralizerGateNotice,dismissNeutralizerGateNotice,buildNeutralizer,neutralizerSpaceReservations,neutralizerCanTraverse,neutralizerTargets,neutralizerTargetLookup,cachedNeutralizerTarget,cachedNeutralizerPathStep,adjacentNeutralizerTarget,neutralizerSpawnLocation,spawnNeutralizerAt,spawnNeutralizer,livingNeutralizersFrom,debugAddMaxNeutralizersAt,updateNeutralizerProduction,neutralizerNextStep,damageNeutralizer,expireNeutralizers,updateNeutralizers,
    updateTrains,updateCombatTrains,fireArtillery,resolveArtilleryImpact,addCombatBeam,addUnitDeathFlash,updateProjectiles,updateStructures,burstAt,burst,update,advanceSimulation,
    showWorldActivity,showTrainActivity,worldMessagePriority,worldMessageLayout,terrainLayerStats,ensureTerrainLayer,terrainLayerPreviewCoversViewport,worldRenderBounds,renderPointVisible,renderSegmentVisible,renderFootprintVisible,staticWorldContentSignatures,staticWorldLayerPreviewCoversViewport,ensureStaticWorldLayer,drawStaticWorldLayer,staticWorldLayerStats,invalidateStaticWorldLayers,drawTerrainBase,drawTerrainLayer,drawResourceNode,stopSupplyTargets,stopSupplyConnections,drawStopSupplyLines,drawTracks,drawTrackFocus,drawTrainStops,drawTurretRanges,drawBase,drawHives,drawGhosts,drawStructures,drawTrains,drawEnemies,drawNeutralizers,drawEffects,drawWorldMessages,drawHover,screenShakeOffset,screenShakeActive,drawWorldPass,render,
    canBaseAfford,constructionModeCost,constructionModeAffordable,constructionModeUnavailableMessage,trainFabricationCost,trainFabricationDisabledReason,payBase,handleAction,addBaseResources,
    selectedTrainPartLabel,selectionHtml,setStatusButtonMarkup,updateConstructionToolAvailability,setDebugMenuOpen,updateDebugUI,showTurretEnergyWarning,dismissTurretEnergyWarning,showTrackDestroyedWarning,dismissTrackDestroyedWarning,showLowBaseResourceWarning,dismissLowBaseResourceWarning,connectedUnminedResources,beginSelectionInteraction,finishSelectionInteraction,scheduleSelectionInteractionFinish,currentSelectionCacheKey,researchSelectionDescription,updateResearchSelectionContent,updateBaseSelectionContent,updateUI,formatSurvivalTime,
    tutorialMessage,tutorialLoopTargets,tutorialScheduleTargets,tutorialTargetsHaveMines,tutorialTurretIsByStop,tutorialNearestResource,tutorialArrowSpecs,syncTutorialArrows,tutorialEvent,startTutorial,handleTutorialOkay,finishTutorial,restartTutorial,startGame,resetGameState,queueCameraPan,queueCameraZoom,finishZoomGesture,handleVisibilityChange,runFrame
  };
}

canvas.addEventListener("pointerdown",e=>{sounds.init();canvas.setPointerCapture(e.pointerId);const p=state.pointer;p.down=true;p.moved=false;p.startX=p.x=e.clientX;p.startY=p.y=e.clientY;p.camX=state.camera.x;p.camY=state.camera.y;canvas.focus();});
function queueCameraPan(clientX,clientY){
  const p=state.pointer;p.x=clientX;p.y=clientY;const dx=p.x-p.startX,dy=p.y-p.startY;if(Math.hypot(dx,dy)>4)p.moved=true;
  if(!p.moved)return false;
  state.camera.x=p.camX-dx/state.camera.zoom;state.camera.y=p.camY-dy/state.camera.zoom;canvas.style.cursor="grabbing";panRenderPending=true;return true;
}
canvas.addEventListener("pointermove",e=>{state.hover=screenToHex(e.clientX,e.clientY);const p=state.pointer;if(!p.down){if(state.paused||state.gameOver)render();return;}queueCameraPan(e.clientX,e.clientY);});
canvas.addEventListener("pointerup",e=>{const p=state.pointer;if(!p.down)return;p.down=false;canvas.style.cursor=state.mode==="select"?"default":"crosshair";if(!p.moved)handleHexClick(screenToHex(e.clientX,e.clientY));else panRenderPending=true;});
canvas.addEventListener("pointerleave",()=>{state.hover=null;if(!state.pointer.down)canvas.style.cursor=state.mode==="select"?"default":"crosshair";});
function finishZoomGesture(){
  if(!zoomGestureActive)return false;
  zoomGestureActive=false;zoomSettleTimer=null;if(terrainLayerSignature!==currentTerrainLayerSignature())invalidateTerrainLayer();zoomRenderPending=true;return true;
}

function queueCameraZoom(deltaY,sx,sy){
  const beforeX=(sx-width/2)/state.camera.zoom+state.camera.x,beforeY=(sy-height/2)/state.camera.zoom+state.camera.y,factor=Math.exp(-deltaY*.0012),nextZoom=clamp(state.camera.zoom*factor,.42,2.15);
  if(nextZoom===state.camera.zoom)return false;
  state.camera.zoom=nextZoom;state.camera.x=beforeX-(sx-width/2)/state.camera.zoom;state.camera.y=beforeY-(sy-height/2)/state.camera.zoom;zoomGestureActive=true;zoomRenderPending=true;
  if(zoomSettleTimer!==null)clearTimeout(zoomSettleTimer);zoomSettleTimer=setTimeout(finishZoomGesture,120);return true;
}

canvas.addEventListener("wheel",e=>{e.preventDefault();const rect=canvas.getBoundingClientRect();queueCameraZoom(e.deltaY,e.clientX-rect.left,e.clientY-rect.top);},{passive:false});

document.addEventListener("click",e=>{const modeButton=e.target.closest("[data-mode]");if(modeButton){if(!modeButton.disabled)setMode(modeButton.dataset.mode,modeButton.dataset.mode==="select");return;}const actionButton=e.target.closest("[data-action]");if(actionButton&&!actionButton.disabled)handleAction(actionButton.dataset.action,actionButton);});
document.addEventListener("keydown",e=>{if(remindersOpen){if(e.key==="Escape"||e.key==="Enter")startGame(false);return;}if(!ui.turretEnergyDialog.hidden){if(e.key==="Escape"||e.key==="Enter")dismissTurretEnergyWarning();return;}if(!ui.trackDestroyedDialog.hidden){if(e.key==="Escape"||e.key==="Enter")dismissTrackDestroyedWarning();return;}if(!ui.lowBaseResourceDialog.hidden){if(e.key==="Escape"||e.key==="Enter")dismissLowBaseResourceWarning();return;}if(!ui.neutralizerGateDialog.hidden){if(e.key==="Enter")dismissNeutralizerGateNotice();return;}if(!ui.confirmDialog.hidden){if(e.key==="Escape")cancelTrainSalvage();return;}if(e.target.matches("input,textarea"))return;if(e.key>="1"&&e.key<="9"){setMode(["select","track","turret","mine","wall","artillery","salvage","research","gate"][Number(e.key)-1]);}if(e.key==="0")setMode("neutralizer");if(e.key==="Escape")setMode("select");});
document.querySelectorAll("[data-mode]").forEach(button=>button.addEventListener("click",()=>sounds.init()));
selectionContent.addEventListener("pointerdown",beginSelectionInteraction);
window.addEventListener("pointerup",scheduleSelectionInteractionFinish);
window.addEventListener("pointercancel",scheduleSelectionInteractionFinish);
window.addEventListener("blur",finishSelectionInteraction);
ui.pauseToggle.addEventListener("click",()=>{if(state.gameOver||tutorialLocksPause())return;state.paused=!state.paused;simulationAccumulator=0;lastWallTime=Date.now();updateUI(true);render();});
ui.soundToggle.addEventListener("click",()=>{state.sound=!state.sound;sounds.enabled=state.sound;if(state.sound)sounds.place();updateUI(true);});
ui.centerBaseButton.addEventListener("click",centerMapOnBase);
ui.debugToggle.addEventListener("click",()=>setDebugMenuOpen(ui.debugMenu.hidden));
ui.debugAddBaseResources.addEventListener("click",()=>{if(!state.gameOver)addBaseResources();});
ui.debugAddResearchPoints.addEventListener("click",()=>{if(!state.gameOver)addResearchPoints();});
ui.turretEnergyOkay.addEventListener("click",dismissTurretEnergyWarning);
ui.trackDestroyedOkay.addEventListener("click",dismissTrackDestroyedWarning);
ui.neutralizerGateOkay.addEventListener("click",dismissNeutralizerGateNotice);
ui.lowBaseResourceOkay.addEventListener("click",dismissLowBaseResourceWarning);
ui.remindersTutorial.addEventListener("click",()=>startGame(true));
ui.remindersContinue.addEventListener("click",()=>startGame(false));
ui.tutorialOkay.addEventListener("click",handleTutorialOkay);
ui.tutorialRestart.addEventListener("click",restartTutorial);
ui.confirmNo.addEventListener("click",cancelTrainSalvage);
ui.confirmYes.addEventListener("click",confirmTrainSalvage);
ui.viewMapButton.addEventListener("click",showFinalMap);
ui.viewFinalStats.addEventListener("click",showFinalStats);
function resetGameState(){state=makeInitialState();resetEnemyNavigation();lastWallTime=Date.now();simulationAccumulator=0;selectionCache="";selectionCacheKey="";selectionInteractionActive=false;selectionRefreshPending=false;selectionRefreshPendingForce=false;zoomGestureActive=false;zoomRenderPending=false;panRenderPending=false;activeRenderBounds=null;invalidateStaticWorldLayers();if(zoomSettleTimer!==null)clearTimeout(zoomSettleTimer);zoomSettleTimer=null;ui.gameOver.hidden=true;ui.gameOver.classList.add("d-none");ui.viewFinalStats.hidden=true;ui.viewFinalStats.classList.add("d-none");ui.confirmDialog.hidden=true;ui.confirmDialog.classList.add("d-none");ui.turretEnergyDialog.hidden=true;ui.turretEnergyDialog.classList.add("d-none");ui.trackDestroyedDialog.hidden=true;ui.trackDestroyedDialog.classList.add("d-none");ui.neutralizerGateDialog.hidden=true;ui.neutralizerGateDialog.classList.add("d-none");ui.lowBaseResourceDialog.hidden=true;ui.lowBaseResourceDialog.classList.add("d-none");setDebugMenuOpen(false);document.querySelectorAll("[data-mode]").forEach(button=>button.disabled=false);syncTutorialUI();setMode("select");}
ui.restartButton.addEventListener("click",()=>{resetGameState();showReminders();});
function handleVisibilityChange(eventOrNow){
  const now=typeof eventOrNow==="number"?eventOrNow:Date.now();
  lastWallTime=now;simulationAccumulator=0;
  if(!document.hidden)render();
}
document.addEventListener("visibilitychange",handleVisibilityChange);
window.addEventListener("resize",resize);
ui.gameOver.hidden=true;ui.viewFinalStats.hidden=true;ui.confirmDialog.hidden=true;ui.turretEnergyDialog.hidden=true;ui.trackDestroyedDialog.hidden=true;ui.neutralizerGateDialog.hidden=true;ui.lowBaseResourceDialog.hidden=true;resize();initializeTooltips();updateUI(true);showReminders();
function runFrame(now=Date.now()){
  if(document.hidden){lastWallTime=now;simulationAccumulator=0;return;}
  const ticks=advanceSimulation((now-lastWallTime)/1000),cameraChanged=zoomRenderPending||panRenderPending;lastWallTime=now;zoomRenderPending=false;panRenderPending=false;if(ticks>0||screenShakeActive()||cameraChanged)render();
}
function frame(){runFrame();requestAnimationFrame(frame);}requestAnimationFrame(frame);
