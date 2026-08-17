"use strict";

const TUTORIAL_MESSAGES = [
  "",
  "Click Build Track in the Actions panel",
  "Click the existing Track (a light gray circle inside a purple outline)",
  "Click nearby hex tiles to add one more Track segment.\n\nIf at any point you run out of Construction Material, simply use the Salvage/Clear Object tool to destroy and reclaim some of your constructions and try again with a more efficient layout.",
  "Keep adding Track until you have a complete loop that passes by the Base, an Energy node, and a Construction Material node; it must be a fully closed loop",
  "Click the Base",
  "Click Fabricate and Place Build/Mine Train",
  "Do two clicks to place the Train: one for the head of the Train, another for its tail",
  "Click Add Schedule in the Train's pane on the right",
  "Add at least three Stops, making sure there is a Stop by the Base, C resource node, and E resource node; be sure to click the first Stop again as the last Stop so that there is a loop",
  "Click Build Mine",
  "Click on the C and E nodes to add Mines to them",
  "Click Build Turret",
  "Place a Turret one tile away from one of the Train Stops",
  "That's it!\n\nYou now have a minimal automated train system for gathering Construction Material for new structures, Energy for the Train and Turrets, and a Turret to defend your Base.\n\nRemember that you can click the \"Playing\" button in the upper right to pause the game catch your breath at any time."
];

function tutorialLocksPause(){return Boolean(state.tutorial?.active);}

function tutorialMessage(step=state.tutorial?.step){return step?`Step ${step}: ${TUTORIAL_MESSAGES[step]}`:"";}

function syncTutorialUI(){
  const active=Boolean(state.tutorial?.active);
  ui.tutorialPrompt.hidden=!active;ui.tutorialPrompt.classList.toggle("d-none",!active);
  if(active)ui.tutorialText.textContent=tutorialMessage();
  const finalStep=active&&state.tutorial.step===14;
  ui.tutorialOkay.hidden=!finalStep;ui.tutorialOkay.classList.toggle("d-none",!finalStep);
  ui.pauseToggle.disabled=state.gameOver||tutorialLocksPause();
}

function nearbyResource(positions,type){
  for(const position of positions){
    for(const candidate of neighbors(position.q,position.r)){
      const terrain=terrainAt(candidate.q,candidate.r);
      if(terrain.type==="resource"&&terrain.resource===type)return resourceNodeAt(candidate.q,candidate.r);
    }
  }
  return null;
}

function tutorialLoopTargets(){
  const remaining=new Set(state.tracks.keys());
  const degree=new Map([...remaining].map(trackKey=>[trackKey,[...(state.tracks.get(trackKey)?.links||[])].filter(linkedKey=>remaining.has(linkedKey)).length]));
  const queue=[...remaining].filter(trackKey=>degree.get(trackKey)<2);
  for(let cursor=0;cursor<queue.length;cursor++){
    const trackKey=queue[cursor];
    if(!remaining.delete(trackKey))continue;
    for(const linkedKey of state.tracks.get(trackKey)?.links||[]){
      if(!remaining.has(linkedKey))continue;
      degree.set(linkedKey,degree.get(linkedKey)-1);
      if(degree.get(linkedKey)<2)queue.push(linkedKey);
    }
  }
  const unseen=new Set(remaining);
  while(unseen.size){
    const first=unseen.values().next().value,componentKeys=[],componentQueue=[first];unseen.delete(first);
    for(let cursor=0;cursor<componentQueue.length;cursor++){
      const trackKey=componentQueue[cursor];componentKeys.push(trackKey);
      for(const linkedKey of state.tracks.get(trackKey)?.links||[])if(unseen.delete(linkedKey))componentQueue.push(linkedKey);
    }
    const positions=componentKeys.map(fromKey);
    if(!positions.some(position=>hexDistance(position,state.base)<=1))continue;
    const material=nearbyResource(positions,"material"),energy=nearbyResource(positions,"energy");
    if(material&&energy)return {material,energy,trackKeys:new Set(componentKeys)};
  }
  return null;
}

function tutorialScheduleTargets(train){
  if(!train?.scheduleComplete||train.schedule.length<3)return null;
  if(!train.schedule.some(stop=>hexDistance(stop,state.base)<=1))return null;
  const material=nearbyResource(train.schedule,"material"),energy=nearbyResource(train.schedule,"energy");
  return material&&energy?{material,energy}:null;
}

function tutorialTargetsHaveMines(tutorial=state.tutorial){
  if(!tutorial?.materialNodeKey||!tutorial?.energyNodeKey)return false;
  const materialMine=state.structures.get(tutorial.materialNodeKey),energyMine=state.structures.get(tutorial.energyNodeKey);
  return materialMine?.type==="mine"&&materialMine.resource==="material"&&energyMine?.type==="mine"&&energyMine.resource==="energy";
}

function tutorialTurretIsByStop(turret,train){return Boolean(turret&&train?.schedule?.some(stop=>hexDistance(stop,turret)===1));}

function setTutorialStep(step){
  state.tutorial.step=step;
  if(step===5){
    state.mode="select";state.trackStart=null;canvas.style.cursor="default";
    document.querySelectorAll("[data-mode]").forEach(button=>button.classList.toggle("active",button.dataset.mode==="select"));
  }
  syncTutorialUI();
}

function tutorialEvent(type,detail={}){
  const tutorial=state.tutorial;
  if(!tutorial?.active||tutorial.step===14)return false;
  let advanced=false,keepChecking=true;
  while(keepChecking){
    keepChecking=false;
    if(tutorial.step===1&&type==="mode"&&detail.mode==="track")keepChecking=true;
    else if(tutorial.step===2&&type==="track-selected")keepChecking=true;
    else if(tutorial.step===3&&type==="track-built"&&state.tracks.size>=2)keepChecking=true;
    else if(tutorial.step===4&&(type==="track-built"||type==="track-linked")){
      const targets=tutorialLoopTargets();
      if(targets){tutorial.loopMaterialNodeKey=key(targets.material.q,targets.material.r);tutorial.loopEnergyNodeKey=key(targets.energy.q,targets.energy.r);keepChecking=true;}
    }
    else if(tutorial.step===5&&type==="base-selected")keepChecking=true;
    else if(tutorial.step===6&&type==="builder-fabrication-started")keepChecking=true;
    else if(tutorial.step===7&&type==="builder-train-deployed"){
      tutorial.trainId=detail.trainId;keepChecking=true;
    }
    else if(tutorial.step===8&&type==="schedule-started"&&detail.trainId===tutorial.trainId)keepChecking=true;
    else if(tutorial.step===9&&type==="schedule-completed"&&detail.trainId===tutorial.trainId){
      const train=state.trains.find(candidate=>candidate.id===tutorial.trainId),targets=tutorialScheduleTargets(train);
      if(targets){tutorial.materialNodeKey=key(targets.material.q,targets.material.r);tutorial.energyNodeKey=key(targets.energy.q,targets.energy.r);keepChecking=true;}
    }
    else if(tutorial.step===10&&type==="mode"&&detail.mode==="mine")keepChecking=true;
    else if(tutorial.step===11&&type==="mine-built"&&tutorialTargetsHaveMines())keepChecking=true;
    else if(tutorial.step===12&&type==="mode"&&detail.mode==="turret")keepChecking=true;
    else if(tutorial.step===13&&type==="turret-built"){
      const train=state.trains.find(candidate=>candidate.id===tutorial.trainId);
      if(tutorialTurretIsByStop(detail.turret,train))keepChecking=true;
    }
    if(keepChecking){setTutorialStep(tutorial.step+1);advanced=true;}
  }
  return advanced;
}

function startTutorial(){
  state.tutorial={active:true,step:1,trainId:null,loopMaterialNodeKey:null,loopEnergyNodeKey:null,materialNodeKey:null,energyNodeKey:null};
  state.paused=true;simulationAccumulator=0;syncTutorialUI();updateUI(true);render();
}

function finishTutorial(){
  state.tutorial=null;state.paused=false;simulationAccumulator=0;lastWallTime=Date.now();resetPerformanceMetrics();
  syncTutorialUI();updateUI(true);render();canvas.focus();
}

function restartTutorial(){
  resetGameState();remindersOpen=false;startTutorial();
}

function startGame(withTutorial=false){
  if(withTutorial)startTutorial();
  else {state.tutorial=null;state.paused=false;syncTutorialUI();updateUI(true);}
  closeReminders();
}
