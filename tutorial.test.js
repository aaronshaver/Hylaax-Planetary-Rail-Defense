"use strict";

const assert = require("node:assert/strict");
const { describe, test, beforeEach } = require("node:test");
const { api, elements, document, addTestTrain, makeTrack } = require("./harness.js");

beforeEach(() => { api.reset(); });

function installTutorialLoop(){
  const positions=[
    {q:2,r:0},{q:2,r:-1},{q:3,r:-2},{q:4,r:-2},{q:5,r:-2},{q:6,r:-2},
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
  test("renders large overlay arrows only for the requested tutorial steps",()=>{
    api.startTutorial();
    const overlay=elements.get("tutorialArrows");
    assert.equal(overlay.hidden,false);
    assert.match(overlay.innerHTML,/class="tutorial-arrow"/);
    assert.equal(api.tutorialArrowSpecs().length,1);

    api.state.tutorial.step=3;api.state.trackStart=[...api.state.tracks.values()][0];api.syncTutorialArrows();
    const step3Arrows=api.tutorialArrowSpecs();
    assert.equal(step3Arrows.length,1,"Step 3 points to clear land next to the initial Track");
    assert.equal(api.hexDistance(step3Arrows[0].target,api.state.trackStart),1);
    assert.equal(api.terrainAt(step3Arrows[0].target.q,step3Arrows[0].target.r).type,"land");

    api.state.tutorial.step=4;api.syncTutorialArrows();
    const step4Arrows=api.tutorialArrowSpecs();
    assert.equal(step4Arrows.length,3,"Step 4 points beside the Base and the nearest C and E nodes");
    assert.ok(step4Arrows.every(arrow=>api.terrainAt(arrow.target.q,arrow.target.r).type==="land"));
    assert.equal(api.distanceToStructure(step4Arrows[0].target,api.state.base),1);
    const frozenTargets=step4Arrows.map(arrow=>api.key(arrow.target.q,arrow.target.r)),frozenDirections=step4Arrows.map(arrow=>arrow.vectorName);
    const builtTarget=step4Arrows[0].target;api.state.tracks.set(api.key(builtTarget.q,builtTarget.r),makeTrack(builtTarget.q,builtTarget.r));api.state.trackStart=builtTarget;
    const afterTrack=api.tutorialArrowSpecs();
    assert.deepEqual(afterTrack.map(arrow=>api.key(arrow.target.q,arrow.target.r)),frozenTargets.slice(1),"the completed Step 4 target disappears while the others stay fixed");
    assert.deepEqual(afterTrack.map(arrow=>arrow.vectorName),frozenDirections.slice(1),"remaining Step 4 approach directions stay fixed as Track is added");
    assert.equal(overlay.hidden,false);
  });

  test("Step 4 finishes by pointing back to the open end needed to close the loop",()=>{
    api.startTutorial();
    const positions=[{q:1,r:-2},{q:2,r:-2},{q:2,r:-3}],keys=positions.map(position=>api.key(position.q,position.r));
    api.state.tracks.clear();
    positions.forEach((position,index)=>api.state.tracks.set(keys[index],makeTrack(position.q,position.r,index===0?[keys[1]]:index===1?[keys[0],keys[2]]:[keys[1]])));
    Object.assign(api.state.tutorial,{step:4,step4BaseLandKey:keys[0],step4EnergyLandKey:keys[1],step4MaterialLandKey:keys[2]});
    api.state.trackStart=positions[2];

    const finalArrow=api.tutorialArrowSpecs();
    assert.equal(finalArrow.length,1,"only the final loop-closing arrow remains after all three landmarks are reached");
    assert.equal(api.key(finalArrow[0].target.q,finalArrow[0].target.r),keys[0],"the final arrow points to the opposite open end of the connected Track");

    api.state.tracks.get(keys[0]).links.add(keys[2]);
    api.state.tracks.get(keys[2]).links.add(keys[0]);
    assert.equal(api.tutorialArrowSpecs().length,0,"the final arrow disappears once the Track has no open ends");
  });

  test("Step 9 points to adjacent Track, then Step 14 points to clear land beside each Stop",()=>{
    api.startTutorial();
    const loop=installTutorialLoop();
    const train=addTestTrain(),tutorial=api.state.tutorial;
    tutorial.step=9;tutorial.trainId=train.id;tutorial.loopMaterialNodeKey="7,-2";tutorial.loopEnergyNodeKey="-4,7";
    api.state.scheduleDraft={trainId:train.id,originalSchedule:[]};
    document.querySelector=selector=>selector.includes('finish-schedule')?elements.get("tutorialOkay"):null;
    try{
      train.schedule=[];
      const step9Arrows=api.tutorialArrowSpecs();
      assert.equal(step9Arrows.length,3,"adjacent Track by the Base, C node, and E node appears first");
      assert.ok(step9Arrows.every(arrow=>api.state.tracks.has(api.key(arrow.target.q,arrow.target.r))));
      assert.equal(api.distanceToStructure(step9Arrows[0].target,api.state.base),1);
      assert.equal(api.hexDistance(step9Arrows[1].target,{q:7,r:-2}),1);
      assert.equal(api.hexDistance(step9Arrows[2].target,{q:-4,r:7}),1);
      train.schedule.push(step9Arrows[0].target);
      assert.equal(api.tutorialArrowSpecs().length,2,"the first landmark arrow disappears after its indicated Stop is added");
      train.schedule.push(step9Arrows[1].target);
      assert.equal(api.tutorialArrowSpecs().length,1,"the second landmark arrow also disappears");
      train.schedule.push(step9Arrows[2].target);
      assert.equal(api.tutorialArrowSpecs().length,1,"only Done adding remains after the third indicated Stop");

      tutorial.step=14;tutorial.materialNodeKey="7,-2";tutorial.energyNodeKey="-4,7";
      const step14Arrows=api.tutorialArrowSpecs();
      assert.equal(step14Arrows.length,3,"Step 14 points to clear land beside each Stop");
      assert.ok(step14Arrows.every(arrow=>api.terrainAt(arrow.target.q,arrow.target.r).type==="land"&&!api.state.tracks.has(api.key(arrow.target.q,arrow.target.r))));
      assert.ok(step14Arrows.every((arrow,index)=>api.hexDistance(arrow.target,train.schedule[index])===1),"every suggested Turret hex is exactly one hex from its Train Stop");
      assert.equal(new Set(step14Arrows.map(arrow=>api.key(arrow.target.q,arrow.target.r))).size,3,"the three suggested Turret hexes are distinct");
    }finally{delete document.querySelector;}
  });

  test("starts paused and displays the numbered first instruction",()=>{
    api.startTutorial();

    assert.equal(api.state.paused,true);
    assert.equal(api.state.tutorial.step,1);
    assert.equal(elements.get("tutorialText").textContent,"This is a tower defense game where automating train networks is the key to successful survival.\n\nStep 1: Click 'Build track' in the actions panel");
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
    assert.equal(api.state.baseMaterial,300);
    assert.equal(elements.get("tutorialText").textContent,"This is a tower defense game where automating train networks is the key to successful survival.\n\nStep 1: Click 'Build track' in the actions panel");
  });

  test("only the tutorial's original starting Track is protected from salvage",()=>{
    api.startTutorial();
    const state=api.state,initialKey=state.tutorial.initialTrackKey,initial=state.tracks.get(initialKey),extra={q:4,r:0},extraKey=api.key(extra.q,extra.r);
    state.tracks.set(extraKey,makeTrack(extra.q,extra.r));state.baseMaterial=10;api.setMode("salvage");

    api.handleHexClick(initial);
    assert.equal(state.tracks.has(initialKey),true);assert.equal(state.baseMaterial,10);
    assert.equal(elements.get("toastStack").children.at(-1).textContent,"The tutorial's starting Track cannot be salvaged.");

    api.handleHexClick(extra);
    assert.equal(state.tracks.has(extraKey),false,"other tutorial Track remains salvageable");assert.equal(state.baseMaterial,11);

    api.finishTutorial();api.setMode("salvage");api.handleHexClick(initial);
    assert.equal(state.tracks.has(initialKey),false,"the original Track is salvageable after the tutorial ends");
  });

  test("requires the ordered build, Train, schedule, Mine, and Turret milestones",()=>{
    api.startTutorial();
    api.tutorialEvent("mode",{mode:"track"});
    assert.equal(api.state.tutorial.step,2);
    assert.equal(api.tutorialMessage(),"Step 2: Click the existing track (a light gray circle)");
    api.tutorialEvent("track-selected");
    assert.equal(api.state.tutorial.step,3);
    assert.equal(api.tutorialMessage(),"Step 3: Click nearby hexes to add one more track segment.");
    let addedQ=2;while(api.state.tracks.has(`${addedQ},0`))addedQ++;
    api.state.tracks.set(`${addedQ},0`,makeTrack(addedQ,0));
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
    assert.equal(api.tutorialMessage(),"Step 9: Add three stops, making sure there is a stop by the base building, C resource node, and E resource node. Click 'Done adding' when finished.");
    assert.equal(elements.get("tutorialOkay").hidden,true);

    train.schedule=[loop[0],loop[5],loop[14]];
    train.scheduleComplete=true;
    api.tutorialEvent("schedule-completed",{trainId:train.id,train});
    assert.equal(api.state.tutorial.step,10);
    assert.equal(api.tutorialMessage(),"Step 10: Tips\n\n- Trains will try to refuel another train when passing through if that other train is out of fuel\n- Trains will try to rebuild destroyed track and destroyed buildings");
    assert.equal(elements.get("tutorialOkay").hidden,false);
    api.handleTutorialOkay();assert.equal(api.state.tutorial.step,11);assert.equal(elements.get("tutorialOkay").hidden,true);
    api.tutorialEvent("mode",{mode:"mine"});
    assert.equal(api.state.tutorial.step,12);

    const materialKey=api.state.tutorial.materialNodeKey,energyKey=api.state.tutorial.energyNodeKey;
    const materialPosition=api.fromKey(materialKey),energyPosition=api.fromKey(energyKey);
    api.state.structures.set(materialKey,{id:"tutorial-material-mine",type:"mine",resource:"material",...materialPosition});
    api.tutorialEvent("mine-built");
    assert.equal(api.state.tutorial.step,12);
    api.state.structures.set(energyKey,{id:"tutorial-energy-mine",type:"mine",resource:"energy",...energyPosition});
    api.tutorialEvent("mine-built");
    api.tutorialEvent("mode",{mode:"turret"});
    assert.equal(api.state.tutorial.step,14);
    assert.equal(api.tutorialMessage(),"Step 14: Place a turret one hex away from one of the train stops");

    const turret={id:"tutorial-turret",type:"turret",q:3,r:0};
    api.state.structures.set(api.key(turret.q,turret.r),turret);
    api.tutorialEvent("turret-built",{turret});
    assert.equal(api.state.tutorial.step,15);
    assert.equal(api.state.paused,true,"the final step must remain paused until Okay is clicked");
    assert.equal(elements.get("pauseToggle").disabled,true);
    assert.equal(elements.get("tutorialOkay").hidden,false);
    assert.equal(elements.get("tutorialText").textContent,"Step 15: You now have a basic automated train system for gathering construction material for building new structures, energy for fueling trains and turrets, and a turret to defend part of your base (you'll want to keep building more turrets).\n\nClick the 'Playing' button in the upper right to pause the game if you feel overwhelmed by enemies and need time to build with less pressure.\n\nThere are more tools to help you survive and improve efficiency: they're in the Actions pane on the right.");

    api.finishTutorial();
    assert.equal(api.state.tutorial,null);
    assert.equal(api.state.paused,false);
    assert.equal(elements.get("pauseToggle").disabled,false);
    assert.equal(elements.get("tutorialPrompt").hidden,true);
  });
});
