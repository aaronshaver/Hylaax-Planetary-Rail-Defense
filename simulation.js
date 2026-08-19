"use strict";

function burstAt(x,y,color,count) {
  const seedX=Math.round(x),seedY=Math.round(y);
  for(let i=0;i<count;i++) { const a=hash(seedX+i,seedY,count)*Math.PI*2,s=10+hash(seedY-i,seedX,count)*30; state.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.45+hash(i,seedX,seedY)*.35,maxLife:.8,color}); }
}

function burst(q,r,color,count){const p=axialToWorld(q,r);burstAt(p.x,p.y,color,count);}

function update(dt) {
  if(state.gameOver||state.paused||remindersOpen)return;
  state.elapsed+=dt;
  updateResearch(dt);
  state.worldMessages=state.worldMessages.filter(item=>item.until>state.elapsed);
  updateTrains(dt);updateAutomaticLogistics(dt);updateTrainEnergyWarnings();updateTrainSchedules();updateHives(dt);updateEnemies(dt);if(state.gameOver)return;updateCombatTrains(dt);updateStructures(dt);
  state.uiClock-=dt;if(state.uiClock<=0){state.uiClock=.15;updateUI();}
}

function advanceSimulation(seconds){
  if(state.gameOver||state.paused||remindersOpen){simulationAccumulator=0;return 0;}
  simulationAccumulator+=Math.max(0,seconds);
  let ticks=0;
  while(simulationAccumulator+1e-9>=SIMULATION_STEP&&!state.gameOver){update(SIMULATION_STEP);simulationAccumulator-=SIMULATION_STEP;ticks++;}
  if(simulationAccumulator<0)simulationAccumulator=0;
  return ticks;
}

function resetPerformanceMetrics(now=performance.now()){
  performanceWindowStart=now;performanceTicks=0;performanceFrames=0;
}

function recordPerformance(now,ticks,rendered){
  performanceTicks+=ticks;if(rendered)performanceFrames++;
  const elapsed=now-performanceWindowStart;
  if(elapsed<1000)return;
  ui.tpsValue.textContent=Math.round(performanceTicks*1000/elapsed);
  ui.fpsValue.textContent=Math.round(performanceFrames*1000/elapsed);
  resetPerformanceMetrics(now);
}
