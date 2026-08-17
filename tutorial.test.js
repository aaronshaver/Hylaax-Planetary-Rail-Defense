"use strict";

const assert = require("node:assert/strict");
const { describe, test, beforeEach } = require("node:test");
const { api, elements, addTestTrain, makeTrack } = require("./harness.js");

beforeEach(() => { api.reset(); });

function installTutorialLoop(){
  const positions=[
    {q:1,r:0},{q:2,r:-1},{q:3,r:-2},{q:4,r:-2},{q:5,r:-2},{q:6,r:-2},
    {q:5,r:-1},{q:4,r:0},{q:3,r:1},{q:2,r:2},{q:1,r:3},{q:0,r:4},{q:-1,r:5},{q:-2,r:6},{q:-3,r:6},
    {q:-2,r:5},{q:-1,r:4},{q:0,r:3},{q:1,r:2},{q:1,r:1}
  ];
  api.state.tracks.clear();
  positions.forEach((position,index)=>{
    const previous=positions[(index+positions.length-1)%positions.length],next=positions[(index+1)%positions.length];
    api.state.tracks.set(api.key(position.q,position.r),makeTrack(position.q,position.r,[api.key(previous.q,previous.r),api.key(next.q,next.r)]));
  });
  return positions;
}

describe("guided tutorial",()=>{
  test("starts paused and displays the numbered first instruction",()=>{
    api.startTutorial();

    assert.equal(api.state.paused,true);
    assert.equal(api.state.tutorial.step,1);
    assert.equal(elements.get("tutorialText").textContent,"Step 1: Click Build Track in the Actions panel");
    assert.equal(elements.get("pauseToggle").disabled,true);
  });

  test("Restart Tutorial creates a fresh initial world at paused Step 1",()=>{
    api.startTutorial();
    const previousState=api.state;
    api.state.tracks.set("9,9",makeTrack(9,9));
    api.state.baseMaterial=12;
    api.state.tutorial.step=8;

    api.restartTutorial();

    assert.notEqual(api.state,previousState);
    assert.equal(api.state.tutorial.step,1);
    assert.equal(api.state.paused,true);
    assert.equal(api.state.tracks.size,1);
    assert.equal(api.state.trains.length,0);
    assert.equal(api.state.baseMaterial,150);
    assert.equal(elements.get("tutorialText").textContent,"Step 1: Click Build Track in the Actions panel");
  });

  test("requires the ordered build, Train, schedule, Mine, and Turret milestones",()=>{
    api.startTutorial();
    api.tutorialEvent("mode",{mode:"track"});
    assert.equal(api.state.tutorial.step,2);
    api.tutorialEvent("track-selected");
    assert.equal(api.state.tutorial.step,3);
    assert.equal(api.tutorialMessage(),"Step 3: Click nearby hex tiles to add one more Track segment.\n\nIf at any point you run out of Construction Material, simply use the Salvage/Clear Object tool to destroy and reclaim some of your constructions and try again with a more efficient layout.");
    api.state.tracks.set("2,0",makeTrack(2,0));
    api.tutorialEvent("track-built");
    assert.equal(api.state.tutorial.step,4);

    const loop=installTutorialLoop();
    const loopTargets=api.tutorialLoopTargets();
    assert.equal(loopTargets.material.resource,"material");
    assert.equal(loopTargets.energy.resource,"energy");
    api.tutorialEvent("track-linked");
    assert.equal(api.state.tutorial.step,5);
    assert.equal(api.state.mode,"select","Step 5 must make the Base selectable");

    api.tutorialEvent("base-selected");
    api.tutorialEvent("builder-fabrication-started");
    const train=addTestTrain();
    api.tutorialEvent("builder-train-deployed",{trainId:train.id,train});
    assert.equal(api.state.tutorial.step,8);
    api.tutorialEvent("schedule-started",{trainId:train.id,train});
    assert.equal(api.state.tutorial.step,9);

    train.schedule=[loop[0],loop[5],loop[14]];
    train.scheduleComplete=true;
    api.tutorialEvent("schedule-completed",{trainId:train.id,train});
    assert.equal(api.state.tutorial.step,10);
    api.tutorialEvent("mode",{mode:"mine"});
    assert.equal(api.state.tutorial.step,11);

    const materialKey=api.state.tutorial.materialNodeKey,energyKey=api.state.tutorial.energyNodeKey;
    const materialPosition=api.fromKey(materialKey),energyPosition=api.fromKey(energyKey);
    api.state.structures.set(materialKey,{id:"tutorial-material-mine",type:"mine",resource:"material",...materialPosition});
    api.tutorialEvent("mine-built");
    assert.equal(api.state.tutorial.step,11);
    api.state.structures.set(energyKey,{id:"tutorial-energy-mine",type:"mine",resource:"energy",...energyPosition});
    api.tutorialEvent("mine-built");
    api.tutorialEvent("mode",{mode:"turret"});
    assert.equal(api.state.tutorial.step,13);

    const turret={id:"tutorial-turret",type:"turret",q:1,r:-1};
    api.state.structures.set(api.key(turret.q,turret.r),turret);
    api.tutorialEvent("turret-built",{turret});
    assert.equal(api.state.tutorial.step,14);
    assert.equal(api.state.paused,true,"the final step must remain paused until Okay is clicked");
    assert.equal(elements.get("pauseToggle").disabled,true);
    assert.equal(elements.get("tutorialOkay").hidden,false);
    assert.equal(elements.get("tutorialText").textContent,"Step 14: That's it!\n\nYou now have a minimal automated train system for gathering Construction Material for new structures, Energy for the Train and Turrets, and a Turret to defend your Base.\n\nRemember that you can click the \"Playing\" button in the upper right to pause the game catch your breath at any time.");

    api.finishTutorial();
    assert.equal(api.state.tutorial,null);
    assert.equal(api.state.paused,false);
    assert.equal(elements.get("pauseToggle").disabled,false);
    assert.equal(elements.get("tutorialPrompt").hidden,true);
  });
});
