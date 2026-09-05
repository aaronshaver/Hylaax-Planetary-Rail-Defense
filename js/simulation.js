"use strict";

function burstAt(x,y,color,count,spread=1) {
  const seedX=Math.round(x),seedY=Math.round(y);
  for(let i=0;i<count;i++) { const a=hash(seedX+i,seedY,count)*Math.PI*2,s=(10+hash(seedY-i,seedX,count)*30)*spread; state.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.45+hash(i,seedX,seedY)*.35,maxLife:.8,color}); }
}

function burst(q,r,color,count,spread=1){const p=axialToWorld(q,r);burstAt(p.x,p.y,color,count,spread);}

function update(dt) {
  if(state.gameOver||state.paused||remindersOpen)return;
  state.elapsed+=dt;
  updateResearch(dt);
  state.worldMessages=state.worldMessages.filter(item=>item.until>state.elapsed);
  updateEmergencyTrainRefueling();updateTrains(dt);updateAutomaticLogistics(dt);updateTrainEnergyWarnings();updateTrainSchedules();updateHives(dt);updateNeutralizers(dt);updateEnemies(dt);if(state.gameOver)return;updateCombatTrains(dt);updateStructures(dt);showLowBaseResourceWarning();
  state.uiClock-=dt;if(state.uiClock<=0){state.uiClock=.15;updateUI();}
}

function advanceSimulation(seconds,maxTicks=Infinity){
  if(state.gameOver||state.paused||remindersOpen){simulationAccumulator=0;return 0;}
  simulationAccumulator+=Math.max(0,seconds);
  let ticks=0;
  while(simulationAccumulator+1e-9>=SIMULATION_STEP&&!state.gameOver&&ticks<maxTicks){update(SIMULATION_STEP);simulationAccumulator-=SIMULATION_STEP;ticks++;}
  if(simulationAccumulator<0)simulationAccumulator=0;
  return ticks;
}
