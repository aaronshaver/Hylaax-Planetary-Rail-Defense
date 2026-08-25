"use strict";

const TUTORIAL_MESSAGES = [
  "",
  "Click 'Build track' in the actions panel",
  "Click the existing track (a light gray circle inside a purple outline)",
  "Click nearby hexes to add one more track segment.",
  "Keep adding track until you have a complete loop that passes by the base building, an energy node, and a construction material node; it must be a fully closed loop",
  "Click the base building",
  "Click 'Fabricate and place build/mine train'",
  "Do two clicks to place the train: one for the head of the train, another for its tail",
  "Click 'Add schedule' in the train's pane on the right",
  "Add three stops, making sure there is a stop by the base building, C resource node, and E resource node. Click 'Done adding' when finished.",
  "Tips\n\n- Trains will try to refuel another train when passing through if that other train is out of fuel\n- Trains will try to rebuild destroyed track and destroyed buildings",
  "Click 'Build mine'",
  "Click on the C and E nodes to add mines to them",
  "Click 'Build turret'",
  "Place a turret one hex away from one of the train stops",
  "You now have a basic automated train system for gathering construction material for building new structures, energy for fueling trains and turrets, and a turret to defend part of your base (you'll want to keep building more turrets).\n\nClick the 'Playing' button in the upper right to pause the game if you feel overwhelmed by enemies and need time to build with less pressure.\n\nThere are more tools to help you survive and improve efficiency: they're in the Actions pane on the right."
];
const TUTORIAL_INTRO="This is a tower defense game where automating train networks is the key to successful survival.";
const TUTORIAL_ARROW_VECTORS={
  right:{x:1,y:0},ne:{x:1,y:-1},se:{x:1,y:1},left:{x:-1,y:0},nw:{x:-1,y:-1},sw:{x:-1,y:1},up:{x:0,y:-1},down:{x:0,y:1}
};

function tutorialLocksPause(){return Boolean(state.tutorial?.active);}

function tutorialMessage(step=state.tutorial?.step){return step?`${step===1?`${TUTORIAL_INTRO}\n\n`:""}Step ${step}: ${TUTORIAL_MESSAGES[step]}`:"";}

function tutorialViewportSize(){
  return {width:window.innerWidth||document.documentElement?.clientWidth||1024,height:window.innerHeight||document.documentElement?.clientHeight||768};
}

function tutorialRect(element){
  if(!element?.getBoundingClientRect)return null;
  const rect=element.getBoundingClientRect();
  if(rect.width<=0||rect.height<=0)return null;
  return {left:rect.left,top:rect.top,width:rect.width,height:rect.height,right:rect.right??rect.left+rect.width,bottom:rect.bottom??rect.top+rect.height};
}

function normalizedArrowVector(vector){const length=Math.hypot(vector.x,vector.y)||1;return {x:vector.x/length,y:vector.y/length};}

function tutorialPointSegmentDistance(point,start,end){
  const dx=end.x-start.x,dy=end.y-start.y,lengthSquared=dx*dx+dy*dy;
  const amount=lengthSquared?clamp(((point.x-start.x)*dx+(point.y-start.y)*dy)/lengthSquared,0,1):0;
  return Math.hypot(point.x-(start.x+dx*amount),point.y-(start.y+dy*amount));
}

function tutorialSegmentsCross(first,second){
  const orientation=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const a=orientation(first.start,first.end,second.start),b=orientation(first.start,first.end,second.end),c=orientation(second.start,second.end,first.start),d=orientation(second.start,second.end,first.end);
  return a*b<0&&c*d<0;
}

function tutorialSegmentIntersectsRect(segment,rect,padding=0){
  const area={left:rect.left-padding,top:rect.top-padding,right:rect.right+padding,bottom:rect.bottom+padding};
  const inside=point=>point.x>=area.left&&point.x<=area.right&&point.y>=area.top&&point.y<=area.bottom;
  if(inside(segment.start)||inside(segment.end))return true;
  const corners=[{x:area.left,y:area.top},{x:area.right,y:area.top},{x:area.right,y:area.bottom},{x:area.left,y:area.bottom}];
  return corners.some((corner,index)=>tutorialSegmentsCross(segment,{start:corner,end:corners[(index+1)%corners.length]}));
}

function tutorialArrowDistance(first,second){
  if(tutorialSegmentsCross(first,second))return 0;
  return Math.min(
    tutorialPointSegmentDistance(first.start,second.start,second.end),tutorialPointSegmentDistance(first.end,second.start,second.end),
    tutorialPointSegmentDistance(second.start,first.start,first.end),tutorialPointSegmentDistance(second.end,first.start,first.end)
  );
}

function tutorialArrowLength(bounds){return clamp(Math.min(bounds.width,bounds.height)*.17,105,155);}

function tutorialArrowLine(target,vector,{clearance=28,length=null,bounds=null}={}){
  const direction=normalizedArrowVector(vector),viewport=tutorialViewportSize(),area=bounds||{left:0,top:0,right:viewport.width,bottom:viewport.height,width:viewport.width,height:viewport.height};
  const end={x:target.x-direction.x*clearance,y:target.y-direction.y*clearance};
  let arrowLength=length||tutorialArrowLength(area),start={x:end.x-direction.x*arrowLength,y:end.y-direction.y*arrowLength};
  const inset=34;
  while(arrowLength>82&&(start.x<area.left+inset||start.x>area.right-inset||start.y<area.top+inset||start.y>area.bottom-inset)){
    arrowLength-=8;start={x:end.x-direction.x*arrowLength,y:end.y-direction.y*arrowLength};
  }
  return {start,end};
}

function tutorialElementArrow(element,vectorName,edgeInset=8){
  const rect=tutorialRect(element);if(!rect)return null;
  const vector=normalizedArrowVector(TUTORIAL_ARROW_VECTORS[vectorName]);
  const center={x:rect.left+rect.width/2,y:rect.top+rect.height/2};
  const edgeDistance=Math.min(Math.abs(vector.x)>.001?rect.width/(2*Math.abs(vector.x)):Infinity,Math.abs(vector.y)>.001?rect.height/(2*Math.abs(vector.y)):Infinity);
  return tutorialArrowLine(center,vector,{clearance:Math.max(0,edgeDistance-edgeInset),length:120});
}

function tutorialWorldPoint(position){
  const rect=tutorialRect(canvas);if(!rect)return null;
  const world=Number.isFinite(position?.q)?axialToWorld(position.q,position.r):position;
  if(!world||!Number.isFinite(world.x)||!Number.isFinite(world.y))return null;
  return {
    x:rect.left+(width/2+(world.x-state.camera.x)*state.camera.zoom)*(rect.width/width),
    y:rect.top+(height/2+(world.y-state.camera.y)*state.camera.zoom)*(rect.height/height)
  };
}

function tutorialArrowScore(arrow,used=[],targetTrackKey=null){
  const worldRect=tutorialRect(worldWrap),inset=34;let score=0;
  if(worldRect){
    for(const point of [arrow.start,arrow.end]){
      if(point.x<worldRect.left+inset)score+=(worldRect.left+inset-point.x)*30;
      if(point.x>worldRect.right-inset)score+=(point.x-worldRect.right+inset)*30;
      if(point.y<worldRect.top+inset)score+=(worldRect.top+inset-point.y)*30;
      if(point.y>worldRect.bottom-inset)score+=(point.y-worldRect.bottom+inset)*30;
    }
  }
  const promptRect=tutorialRect(ui.tutorialPrompt);if(promptRect&&tutorialSegmentIntersectsRect(arrow,promptRect,5))score+=100000;
  for(const other of used){const distance=tutorialArrowDistance(arrow,other);if(distance<58)score+=(58-distance)*180;}
  for(const [trackKey,track] of state.tracks){
    if(trackKey===targetTrackKey)continue;
    const point=tutorialWorldPoint(track);if(!point)continue;
    const distance=tutorialPointSegmentDistance(point,arrow.start,arrow.end);if(distance<31)score+=(31-distance)*16;
  }
  return score;
}

function tutorialWorldArrow(position,vectorNames,used=[],options={}){
  const target=tutorialWorldPoint(position),bounds=tutorialRect(worldWrap);if(!target||!bounds)return null;
  const choices=vectorNames.map(name=>({...tutorialArrowLine(target,TUTORIAL_ARROW_VECTORS[name],{clearance:options.clearance??28,bounds}),vectorName:name}));
  choices.sort((a,b)=>tutorialArrowScore(a,used,options.targetTrackKey)-tutorialArrowScore(b,used,options.targetTrackKey));
  return choices[0]?{...choices[0],target:{...position}}:null;
}

function tutorialNearestResource(resource){
  const candidates=[];
  for(let q=-16;q<=16;q++)for(let r=-16;r<=16;r++){
    const terrain=terrainAt(q,r);if(terrain.type!=="resource"||terrain.resource!==resource)continue;
    candidates.push({q,r,distance:distanceToStructure({q,r},state.base)});
  }
  candidates.sort((a,b)=>a.distance-b.distance||hexDistance(a,state.base)-hexDistance(b,state.base)||a.q-b.q||a.r-b.r);
  return candidates[0]||null;
}

function tutorialTrackTarget(requireDeploymentSpace=false){
  const tracks=[...state.tracks.values()].sort((a,b)=>distanceToStructure(a,state.base)-distanceToStructure(b,state.base)||a.q-b.q||a.r-b.r);
  if(requireDeploymentSpace){const deployable=tracks.find(track=>deploymentPathsFrom(track.q,track.r,3).length);if(deployable)return deployable;}
  return tracks[0]||null;
}

function tutorialDistanceToTarget(position,target){return target?.footprint?.length?distanceToStructure(position,target):hexDistance(position,target);}

function tutorialClearLandHex(position){
  return terrainAt(position.q,position.r).type==="land"&&!structureAt(position.q,position.r)&&!state.tracks.has(key(position.q,position.r))&&!ghostAt(position.q,position.r)&&!hiveAt(position.q,position.r)&&!trainAt(position.q,position.r)&&!creepOccupiesHex(position.q,position.r)&&!neutralizerOccupiesHex(position.q,position.r);
}

function tutorialClearLandNextTo(target,{near=null,awayFrom=null}={}){
  if(!target)return null;
  const candidates=new Map();
  for(const cell of structureFootprint(target))for(const position of neighbors(cell.q,cell.r))if(tutorialClearLandHex(position))candidates.set(key(position.q,position.r),position);
  let available=[...candidates.values()];
  available.sort((a,b)=>{
    if(near){const difference=tutorialDistanceToTarget(a,near)-tutorialDistanceToTarget(b,near);if(difference)return difference;}
    if(awayFrom){const difference=tutorialDistanceToTarget(b,awayFrom)-tutorialDistanceToTarget(a,awayFrom);if(difference)return difference;}
    return a.q-b.q||a.r-b.r;
  });
  return available[0]||null;
}

function tutorialTrackNextTo(target,allowedKeys=null){
  if(!target)return null;
  const tracks=[...state.tracks.entries()].filter(([trackKey,track])=>(!allowedKeys||allowedKeys.has(trackKey))&&tutorialDistanceToTarget(track,target)===1).map(([,track])=>track);
  tracks.sort((a,b)=>a.q-b.q||a.r-b.r);return tracks[0]||null;
}

function tutorialClearLandByStop(stop,usedKeys=new Set()){
  if(!stop)return null;
  const available=neighbors(stop.q,stop.r).filter(position=>!usedKeys.has(key(position.q,position.r))&&tutorialClearLandHex(position));
  available.sort((a,b)=>a.q-b.q||a.r-b.r);
  return available[0]||null;
}

function tutorialAddWorldArrow(arrows,position,vectorNames,options={}){
  if(!position)return;
  const arrow=tutorialWorldArrow(position,vectorNames,arrows,options);if(arrow)arrows.push(arrow);
}

function tutorialStep4Arrow(arrows,tutorial,targetProperty,directionProperty,targetFactory,vectorNames){
  if(!tutorial[targetProperty]){const target=targetFactory();if(target)tutorial[targetProperty]=key(target.q,target.r);}
  const target=tutorial[targetProperty]?fromKey(tutorial[targetProperty]):null;if(!target)return;
  if(state.tracks.has(key(target.q,target.r)))return;
  const directions=tutorial[directionProperty]?[tutorial[directionProperty]]:vectorNames;
  const arrow=tutorialWorldArrow(target,directions,arrows,{clearance:18,targetTrackKey:key(target.q,target.r)});
  if(!arrow)return;
  tutorial[directionProperty]||=arrow.vectorName;arrows.push(arrow);
}

function tutorialArrowSpecs(step=state.tutorial?.step){
  if(!state.tutorial?.active||!step)return [];
  const arrows=[],tutorial=state.tutorial;
  if(step===1){const arrow=tutorialElementArrow(ui.trackTool,"ne");if(arrow)arrows.push(arrow);}
  else if(step===2){const track=tutorialTrackTarget();tutorialAddWorldArrow(arrows,track,["right"],{clearance:25,targetTrackKey:track?key(track.q,track.r):null});}
  else if(step===3){
    const track=state.trackStart||tutorialTrackTarget(),land=tutorialClearLandNextTo(track,{awayFrom:state.base});
    tutorialAddWorldArrow(arrows,land,["right","se","sw","ne","nw","down","up","left"],{clearance:18});
  }
  else if(step===4){
    const energy=tutorialNearestResource("energy"),material=tutorialNearestResource("material");
    tutorialStep4Arrow(arrows,tutorial,"step4BaseLandKey","step4BaseDirection",()=>tutorialClearLandNextTo(state.base,{near:state.trackStart}),["se","sw","right","down","ne","nw"]);
    tutorialStep4Arrow(arrows,tutorial,"step4EnergyLandKey","step4EnergyDirection",()=>tutorialClearLandNextTo(energy,{near:state.base}),["ne","se","right","up","down"]);
    tutorialStep4Arrow(arrows,tutorial,"step4MaterialLandKey","step4MaterialDirection",()=>tutorialClearLandNextTo(material,{near:state.base}),["sw","nw","left","down","up"]);
  }
  else if(step===5){tutorialAddWorldArrow(arrows,structureWorldCenter(state.base),["right"],{clearance:62});}
  else if(step===6){const arrow=tutorialElementArrow(document.querySelector?.('[data-action="fabricate-place-builder-train"]'),"se");if(arrow)arrows.push(arrow);}
  else if(step===7){const track=tutorialTrackTarget(true);tutorialAddWorldArrow(arrows,track,["se","sw","ne","nw","down","up","right","left"],{clearance:27,targetTrackKey:track?key(track.q,track.r):null});}
  else if(step===8){const arrow=tutorialElementArrow(document.querySelector?.('[data-action="add-schedule"]'),"se");if(arrow)arrows.push(arrow);}
  else if(step===9){
    const material=tutorial.loopMaterialNodeKey?fromKey(tutorial.loopMaterialNodeKey):null,energy=tutorial.loopEnergyNodeKey?fromKey(tutorial.loopEnergyNodeKey):null,loop=tutorialLoopTargets(),allowedKeys=loop?.trackKeys||null;
    const baseTrack=tutorialTrackNextTo(state.base,allowedKeys),materialTrack=tutorialTrackNextTo(material,allowedKeys),energyTrack=tutorialTrackNextTo(energy,allowedKeys);
    const train=state.trains.find(candidate=>candidate.id===tutorial.trainId),draft=state.scheduleDraft?.trainId===train?.id?state.scheduleDraft:null,newStops=train?(train.schedule?.length||0)-(draft?.originalSchedule.length||0):0;
    const isStop=track=>track&&train?.schedule?.some(stop=>stop.q===track.q&&stop.r===track.r);
    if(!isStop(baseTrack))tutorialAddWorldArrow(arrows,baseTrack,["se","sw","right","down","ne","nw"],{clearance:25,targetTrackKey:baseTrack?key(baseTrack.q,baseTrack.r):null});
    if(!isStop(materialTrack))tutorialAddWorldArrow(arrows,materialTrack,["ne","se","right","up","down","left"],{clearance:25,targetTrackKey:materialTrack?key(materialTrack.q,materialTrack.r):null});
    if(!isStop(energyTrack))tutorialAddWorldArrow(arrows,energyTrack,["sw","nw","left","down","up","right"],{clearance:25,targetTrackKey:energyTrack?key(energyTrack.q,energyTrack.r):null});
    if(newStops>=3){const arrow=tutorialElementArrow(document.querySelector?.('[data-action="finish-schedule"]'),"se");if(arrow)arrows.push(arrow);}
  }
  else if(step===11){const arrow=tutorialElementArrow(ui.mineTool,"ne");if(arrow)arrows.push(arrow);}
  else if(step===12){
    tutorialAddWorldArrow(arrows,tutorial.materialNodeKey?fromKey(tutorial.materialNodeKey):null,["ne","se","right","up","down"],{clearance:29});
    tutorialAddWorldArrow(arrows,tutorial.energyNodeKey?fromKey(tutorial.energyNodeKey):null,["sw","nw","left","down","up"],{clearance:29});
  }
  else if(step===13){const arrow=tutorialElementArrow(ui.turretTool,"ne");if(arrow)arrows.push(arrow);}
  else if(step===14){
    const train=state.trains.find(candidate=>candidate.id===tutorial.trainId),usedTargetKeys=new Set(),targets=[];
    for(const stop of (train?.schedule||[]).slice(0,3)){const target=tutorialClearLandByStop(stop,usedTargetKeys);if(target)usedTargetKeys.add(key(target.q,target.r));targets.push(target);}
    const vectors=[["se","right","down","ne"],["sw","left","down","nw"],["ne","up","right","nw"]];
    for(const [index,target] of targets.entries())tutorialAddWorldArrow(arrows,target,vectors[index],{clearance:18});
  }
  else if(step===15){const arrow=tutorialElementArrow(ui.pauseToggle,"ne");if(arrow)arrows.push(arrow);}
  return arrows;
}

function tutorialArrowPolygon({start,end}){
  const direction=normalizedArrowVector({x:end.x-start.x,y:end.y-start.y}),normal={x:-direction.y,y:direction.x},length=Math.hypot(end.x-start.x,end.y-start.y),headLength=Math.min(39,length*.34),shaftHalf=10,headHalf=25,base={x:end.x-direction.x*headLength,y:end.y-direction.y*headLength};
  const points=[
    {x:start.x+normal.x*shaftHalf,y:start.y+normal.y*shaftHalf},{x:base.x+normal.x*shaftHalf,y:base.y+normal.y*shaftHalf},
    {x:base.x+normal.x*headHalf,y:base.y+normal.y*headHalf},end,{x:base.x-normal.x*headHalf,y:base.y-normal.y*headHalf},
    {x:base.x-normal.x*shaftHalf,y:base.y-normal.y*shaftHalf},{x:start.x-normal.x*shaftHalf,y:start.y-normal.y*shaftHalf}
  ];
  return points.map(point=>`${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

function syncTutorialArrows(){
  const overlay=ui.tutorialArrows;if(!overlay)return;
  const arrows=tutorialArrowSpecs(),active=Boolean(state.tutorial?.active&&arrows.length);
  overlay.hidden=!active;overlay.toggleAttribute?.("hidden",!active);overlay.classList.toggle("d-none",!active);
  if(!active){overlay.innerHTML="";return;}
  const viewport=tutorialViewportSize();overlay.setAttribute?.("viewBox",`0 0 ${viewport.width} ${viewport.height}`);
  overlay.innerHTML=arrows.map((arrow,index)=>`<polygon class="tutorial-arrow" data-tutorial-arrow="${index+1}" points="${tutorialArrowPolygon(arrow)}"></polygon>`).join("");
}

function syncTutorialUI(){
  const active=Boolean(state.tutorial?.active);
  ui.tutorialPrompt.hidden=!active;ui.tutorialPrompt.classList.toggle("d-none",!active);
  if(active)ui.tutorialText.textContent=tutorialMessage();
  const okayStep=active&&[10,15].includes(state.tutorial.step);
  ui.tutorialOkay.hidden=!okayStep;ui.tutorialOkay.classList.toggle("d-none",!okayStep);
  ui.pauseToggle.disabled=state.gameOver||tutorialLocksPause();
  syncTutorialArrows();
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
  if(!tutorial?.active||tutorial.step===15)return false;
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
    else if(tutorial.step===11&&type==="mode"&&detail.mode==="mine")keepChecking=true;
    else if(tutorial.step===12&&type==="mine-built"&&tutorialTargetsHaveMines())keepChecking=true;
    else if(tutorial.step===13&&type==="mode"&&detail.mode==="turret")keepChecking=true;
    else if(tutorial.step===14&&type==="turret-built"){
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

function handleTutorialOkay(){
  if(state.tutorial?.active&&state.tutorial.step===10){setTutorialStep(11);return;}
  finishTutorial();
}

function restartTutorial(){
  resetGameState();remindersOpen=false;startTutorial();
}

function startGame(withTutorial=false){
  if(withTutorial)startTutorial();
  else {state.tutorial=null;state.paused=false;syncTutorialUI();updateUI(true);}
  closeReminders();
}
