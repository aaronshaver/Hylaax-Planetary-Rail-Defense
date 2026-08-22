"use strict";

if(window.__HYLAAX_TEST__){
  window.__HYLAAX_TEST_API__={
    constants:{NODE_MIN_CAPACITY,NODE_MAX_CAPACITY,INITIAL_HIVE_COUNT,ENEMY_SPEED,CREEP_ATTACK_INTERVAL,CREEP_ATTACK_DAMAGE,SIMULATION_STEP,TRACK_HIT_POINTS,TRAIN_HIT_POINTS,WALL_HIT_POINTS,TURRET_HIT_POINTS,RESEARCH_HIT_POINTS,RESEARCH_UPGRADE_COST,TRAIN_LOSS_SHAKE_SECONDS,ENEMY_SPAWN_BUFFER,REPAIR_PAUSE_SECONDS,TURRET_RANGE,COMBAT_TRAIN_RANGE,ARTILLERY_RANGE,ARTILLERY_HIT_POINTS,ARTILLERY_MAX_ENERGY,ARTILLERY_FIRE_INTERVAL,ARTILLERY_SHELL_FLIGHT_SECONDS,ARTILLERY_BLAST_SECONDS,ARTILLERY_SHOT_ENERGY,ARTILLERY_CENTER_DAMAGE,ARTILLERY_SPLASH_DAMAGE,ARTILLERY_OUTER_SPLASH_DAMAGE,CREEP_HEX_CAPACITY,CREEP_SLOT_RADIUS,CREEP_RENDER_SCALE,BASE_UNLOAD_TARGET,BASE_FOOTPRINT_OFFSETS,HIVE_LEVELS,COSTS,REBUILD_COSTS,BASE_RESOURCE_TYPES,TRAIN_CAR_COLORS,DIRECTIONS,RESEARCH_UPGRADES},
    get state(){return state;},
    sounds,
    reset({mapSeed=123456789,seedHives=false}={}){
      state=makeInitialState();state.mapSeed=mapSeed;state.hives.clear();state.enemies=[];state.projectiles=[];state.particles=[];
      terrainCacheSeed=null;terrainCache=new Map();terrainRevision=0;simulationAccumulator=0;selectionCache="";remindersOpen=false;sounds.enabled=false;
      resetEnemyNavigation();if(seedHives)seedInitialHives();return state;
    },
    key,fromKey,hexDistance,neighbors,footprintPerimeter,axialToWorld,worldToAxial,hexLineBetween,hasClearShot,baseTerrainAt,resourceHasOpenApproach,terrainAt,isPassable,resourceNodeAt,setNodeAmount,centerMapOnBase,
    getSelected,setMode,select,structureAt,structureFootprint,distanceToStructure,nearestStructureCell,structureWorldCenter,basePerimeter,ghostAt,trainAt,trainSegmentAt,handleHexClick,
    researchUpgrade,researchUpgradeCount,researchMultiplier,turretFireInterval,combatTrainFireInterval,turretDamage,turretRange,combatTrainRange,mineEfficiency,trainCapacity,trainSpeed,artilleryFireInterval,artilleryDamage,artilleryDamageAtDistance,artilleryRange,wallHitPoints,trackHitPoints,researchRate,researchFootprintCandidates,researchPlacementFootprint,researchPreviewFootprint,buildResearch,applyResearchUpgrade,purchaseResearchUpgrade,updateResearch,addResearchPoints,
    trainCode,trainName,randomTrainColorShade,trainCarColor,trainSegments,trainStopped,totalCargo,cargoSpace,removeCargo,addCargo,fillBaseCargo,refuelAtBase,serviceBaseLogistics,
    connectedTrackNeighbors,conceptualTrackNeighbors,tracksAreLinked,linkTracks,deleteTrack,curveIsExtreme,liveTrackWithinRange,layTrack,placeTrackOverGhost,buildTurret,buildMine,buildWall,buildArtillery,clearDepletedResourceNode,salvageStructure,clearGhost,requestTrainSalvage,requestResearchSalvage,cancelTrainSalvage,confirmTrainSalvage,deploymentPathsFrom,deployTrain,
    scheduleStopAt,addScheduleStop,finishSchedule,undoLastScheduleStop,clearTrainSchedule,findPath,findConceptualTrackPath,repairApproachFor,scheduleMinimumStops,scheduleLoopIsReachable,startScheduledLeg,updateTrainSchedules,
    hiveUnlockedLevel,nextHiveLevel,hiveExpansionLevel,createHive,hiveHexOpen,hiveReplicationRoll,hiveSpawnCandidates,spawnHiveNear,spawnEnemyAt,spawnEnemyFromHive,debugAddCreepAt,playerConstructionAnchors,outsidePlayerConstructionBuffer,encroachingHiveLocation,spawnEncroachingHive,encroachingHiveCount,encroachmentOccurs,updateEncroachingHives,hiveProductionDelay,queueDueHiveProductions,produceHiveOperation,processHiveProductionQueue,updateHives,
    trainOccupiedHexKeys,trainsShareHex,snapTrainToGrid,emergencyRefuelTrain,updateEmergencyTrainRefueling,showTrainEnergyWarning,updateTrainEnergyWarnings,repairPriority,updateAutomaticRepair,updateAutomaticLogistics,updateAutomaticRebuild,leaveGhost,rebuildGhost,trainPartDestroyed,damageTarget,damageEnemy,debugDestroyAt,
    enemySlotOffset,enemyWorldPosition,reserveEnemySpace,releaseEnemySpace,enemySpaceReservations,enemyHexHasRoom,chooseEnemySpaceSlot,resetEnemyNavigation,rebuildEnemyNavigation,ensureEnemyNavigation,nextEnemyNavigationStep,enemyNavigationStats,findEnemyStep,updateEnemies,
    updateTrains,updateCombatTrains,fireArtillery,resolveArtilleryImpact,updateProjectiles,updateStructures,update,advanceSimulation,
    showWorldActivity,showTrainActivity,worldMessagePriority,worldMessageLayout,terrainLayerStats,ensureTerrainLayer,stopSupplyTargets,stopSupplyConnections,drawStopSupplyLines,drawTracks,drawTrainStops,drawTurretRanges,drawBase,drawHives,drawGhosts,drawStructures,drawTrains,drawBuildTrackGlow,trackGlowPhase,trackGlowAnimationActive,drawEnemies,drawEffects,drawWorldMessages,screenShakeOffset,screenShakeActive,render,
    canBaseAfford,constructionModeCost,constructionModeAffordable,constructionModeUnavailableMessage,addBaseResources,
    selectedTrainPartLabel,selectionHtml,setStatusButtonMarkup,updateConstructionToolAvailability,setDebugMenuOpen,updateDebugUI,showTurretEnergyWarning,dismissTurretEnergyWarning,connectedUnminedResources,updateUI,formatSurvivalTime,
    tutorialMessage,tutorialLoopTargets,tutorialScheduleTargets,tutorialTargetsHaveMines,tutorialTurretIsByStop,tutorialEvent,startTutorial,finishTutorial,restartTutorial,startGame,resetGameState
  };
}

canvas.addEventListener("pointerdown",e=>{sounds.init();canvas.setPointerCapture(e.pointerId);const p=state.pointer;p.down=true;p.moved=false;p.startX=p.x=e.clientX;p.startY=p.y=e.clientY;p.camX=state.camera.x;p.camY=state.camera.y;canvas.focus();});
canvas.addEventListener("pointermove",e=>{state.hover=screenToHex(e.clientX,e.clientY);const p=state.pointer;if(!p.down){if(state.paused||state.gameOver)render();return;}p.x=e.clientX;p.y=e.clientY;const dx=p.x-p.startX,dy=p.y-p.startY;if(Math.hypot(dx,dy)>4)p.moved=true;if(p.moved){state.camera.x=p.camX-dx/state.camera.zoom;state.camera.y=p.camY-dy/state.camera.zoom;canvas.style.cursor="grabbing";render();}});
canvas.addEventListener("pointerup",e=>{const p=state.pointer;if(!p.down)return;p.down=false;canvas.style.cursor=state.mode==="select"?"default":"crosshair";if(!p.moved)handleHexClick(screenToHex(e.clientX,e.clientY));});
canvas.addEventListener("pointerleave",()=>{state.hover=null;if(!state.pointer.down)canvas.style.cursor=state.mode==="select"?"default":"crosshair";});
canvas.addEventListener("wheel",e=>{e.preventDefault();const rect=canvas.getBoundingClientRect(),sx=e.clientX-rect.left,sy=e.clientY-rect.top;const beforeX=(sx-width/2)/state.camera.zoom+state.camera.x,beforeY=(sy-height/2)/state.camera.zoom+state.camera.y;const factor=Math.exp(-e.deltaY*.0012);state.camera.zoom=clamp(state.camera.zoom*factor,.42,2.15);state.camera.x=beforeX-(sx-width/2)/state.camera.zoom;state.camera.y=beforeY-(sy-height/2)/state.camera.zoom;render();},{passive:false});

document.addEventListener("click",e=>{const modeButton=e.target.closest("[data-mode]");if(modeButton){if(!modeButton.disabled)setMode(modeButton.dataset.mode,modeButton.dataset.mode==="select");return;}const actionButton=e.target.closest("[data-action]");if(actionButton&&!actionButton.disabled)handleAction(actionButton.dataset.action,actionButton);});
document.addEventListener("keydown",e=>{if(remindersOpen){if(e.key==="Escape"||e.key==="Enter")startGame(false);return;}if(!ui.turretEnergyDialog.hidden){if(e.key==="Escape"||e.key==="Enter")dismissTurretEnergyWarning();return;}if(!ui.confirmDialog.hidden){if(e.key==="Escape")cancelTrainSalvage();return;}if(e.target.matches("input,textarea"))return;if(e.key>="1"&&e.key<="8"){setMode(["select","track","turret","mine","wall","artillery","salvage","research"][Number(e.key)-1]);}if(e.key==="9")centerMapOnBase();if(e.key==="Escape")setMode("select");});
document.querySelectorAll("[data-mode]").forEach(button=>button.addEventListener("click",()=>sounds.init()));
ui.pauseToggle.addEventListener("click",()=>{if(state.gameOver||tutorialLocksPause())return;state.paused=!state.paused;simulationAccumulator=0;lastWallTime=Date.now();updateUI(true);render();});
ui.soundToggle.addEventListener("click",()=>{state.sound=!state.sound;sounds.enabled=state.sound;if(state.sound)sounds.place();updateUI(true);});
ui.centerBaseButton.addEventListener("click",centerMapOnBase);
ui.debugToggle.addEventListener("click",()=>setDebugMenuOpen(ui.debugMenu.hidden));
ui.debugAddBaseResources.addEventListener("click",()=>{if(!state.gameOver)addBaseResources();});
ui.debugAddResearchPoints.addEventListener("click",()=>{if(!state.gameOver)addResearchPoints();});
ui.turretEnergyOkay.addEventListener("click",dismissTurretEnergyWarning);
ui.remindersTutorial.addEventListener("click",()=>startGame(true));
ui.remindersContinue.addEventListener("click",()=>startGame(false));
ui.tutorialOkay.addEventListener("click",finishTutorial);
ui.tutorialRestart.addEventListener("click",restartTutorial);
ui.confirmNo.addEventListener("click",cancelTrainSalvage);
ui.confirmYes.addEventListener("click",confirmTrainSalvage);
ui.viewMapButton.addEventListener("click",showFinalMap);
ui.viewFinalStats.addEventListener("click",showFinalStats);
function resetGameState(){state=makeInitialState();resetEnemyNavigation();seedInitialHives();lastWallTime=Date.now();simulationAccumulator=0;resetPerformanceMetrics();selectionCache="";ui.gameOver.hidden=true;ui.gameOver.classList.add("d-none");ui.viewFinalStats.hidden=true;ui.viewFinalStats.classList.add("d-none");ui.confirmDialog.hidden=true;ui.confirmDialog.classList.add("d-none");ui.turretEnergyDialog.hidden=true;ui.turretEnergyDialog.classList.add("d-none");setDebugMenuOpen(false);document.querySelectorAll("[data-mode]").forEach(button=>button.disabled=false);syncTutorialUI();setMode("select");}
ui.restartButton.addEventListener("click",()=>{resetGameState();showReminders();});
document.addEventListener("visibilitychange",()=>{if(!document.hidden){const now=Date.now();advanceSimulation((now-lastWallTime)/1000);lastWallTime=now;resetPerformanceMetrics();render();}});
window.addEventListener("resize",resize);
ui.gameOver.hidden=true;ui.viewFinalStats.hidden=true;ui.confirmDialog.hidden=true;ui.turretEnergyDialog.hidden=true;resize();initializeTooltips();updateUI(true);showReminders();
function frame(frameTime){const now=Date.now(),ticks=advanceSimulation((now-lastWallTime)/1000);lastWallTime=now;const rendered=ticks>0||screenShakeActive()||trackGlowAnimationActive();if(rendered)render();recordPerformance(frameTime,ticks,rendered);requestAnimationFrame(frame);}requestAnimationFrame(frame);
