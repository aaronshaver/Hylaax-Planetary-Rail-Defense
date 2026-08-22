"use strict";

const TUTORIAL_MESSAGES = [
  "",
  "Click 'Build track' in the actions panel",
  "Click the existing track (a light gray circle inside a purple outline)",
  "Click nearby hexes to add one more track segment.",
  "Keep adding track until you have a complete loop that passes by the base, an energy node, and a construction material node; it must be a fully closed loop",
  "Click the base",
  "Click 'Fabricate and place build/mine train'",
  "Do two clicks to place the train: one for the head of the train, another for its tail",
  "Click 'Add schedule' in the train's pane on the right",
  "Add three stops, making sure there is a stop by the base, C resource node, and E resource node. Click 'Done adding' when finished.",
  "Click 'Build mine'",
  "Click on the C and E nodes to add mines to them",
  "Click 'Build turret'",
  "Place a turret one hex away from one of the train stops",
  "You now have a basic automated train system for gathering construction material for building new structures, energy for fueling trains and turrets, and a turret to defend part of your base.\n\nClick the 'Playing' button in the upper right to pause the game and catch your breath if you need time to think.\n\nThere are more buildings you can build, like walls and artillery and a research building to give you more tools to survive and improve efficiency."
];
const TUTORIAL_INTRO="This is a tower defense game where automating train networks is the key to successful survival.";

function tutorialLocksPause(){return Boolean(state.tutorial?.active);}

function tutorialMessage(step=state.tutorial?.step){return step?`${step===1?`${TUTORIAL_INTRO}\n\n`:""}Step ${step}: ${TUTORIAL_MESSAGES[step]}`:"";}

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
    if(!positions.some(position=>distanceToStructure(position,state.base)===1))continue;
    const material=nearbyResource(positions,"material"),energy=nearbyResource(positions,"energy");
    if(material&&energy)return {material,energy,trackKeys:new Set(componentKeys)};
  }
  return null;
}

function tutorialScheduleTargets(train){
  if(!train?.scheduleComplete||train.schedule.length<3)return null;
  if(!train.schedule.some(stop=>distanceToStructure(stop,state.base)===1))return null;
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
  state.tutorial=null;state.paused=false;simulationAccumulator=0;lastWallTime=Date.now();
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
