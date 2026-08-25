"use strict";

const assert = require("node:assert/strict");
const { describe, test, beforeEach } = require("node:test");
const { api, elements, addTestTrain, moveTrain, makeTrack } = require("./harness.js");

beforeEach(() => { api.reset(); });

function addResearchBuilding(q=8,r=8){
  const research={id:`research-test-${q},${r}`,type:"research",q,r,footprint:[{q,r},{q:q+1,r},{q,r:r+1}],hp:300,maxHp:300};
  api.state.structures.set(api.key(q,r),research);api.state.researchUnlocked=true;api.state.selected={type:"structure",id:research.id};return research;
}

function findResearchSite(){
  for(let q=-15;q<=15;q++)for(let r=-15;r<=15;r++){const footprint=api.researchPlacementFootprint(q,r);if(footprint)return {q,r,footprint};}
  return null;
}

describe("Research building and upgrades",()=>{
  test("paid Research construction grants 30 points only when it sets a new building-count record",()=>{
    const state=api.state;api.updateResearch(95.75);api.updateUI(true);
    assert.equal(state.researchPoints,0);assert.equal(elements.get("researchPointsHud").textContent,0);

    const site=findResearchSite();assert.ok(site);state.baseMaterial=200;state.baseEnergy=200;
    const research=api.buildResearch(site.q,site.r);
    assert.ok(research);assert.equal(research.hp,300);assert.equal(research.maxHp,300);assert.equal(research.footprint.length,3);
    assert.equal(state.baseMaterial,150);assert.equal(state.baseEnergy,150);assert.equal(state.researchUnlocked,true);
    assert.equal(state.researchPoints,30);assert.equal(elements.get("researchPointsHud").textContent,30);

    api.updateResearch(5);api.updateUI(true);
    assert.equal(state.researchPoints,35);assert.equal(elements.get("researchPointsHud").textContent,35);

    const secondSite=findResearchSite();assert.ok(secondSite);assert.ok(api.buildResearch(secondSite.q,secondSite.r));
    assert.equal(state.researchPoints,65,"the second Research building should grant another 30 points");
    const thirdSite=findResearchSite();assert.ok(thirdSite);assert.ok(api.buildResearch(thirdSite.q,thirdSite.r));
    assert.equal(state.researchPoints,95,"the third Research building should grant another 30 points");
    assert.equal(state.maxResearchBuildings,3);assert.equal(state.baseMaterial,50);assert.equal(state.baseEnergy,50);

    api.salvageStructure(state.structures.get(api.key(thirdSite.q,thirdSite.r)));
    const replacementSite=findResearchSite();assert.ok(replacementSite);assert.ok(api.buildResearch(replacementSite.q,replacementSite.r));
    assert.equal(state.researchPoints,95,"salvaging and replacing a Research building must not grant repeatable bonus points");
    assert.equal(state.maxResearchBuildings,3);assert.equal(state.baseMaterial,50);assert.equal(state.baseEnergy,50);
  });

  test("additional Research buildings do not increase passive Research gain",()=>{
    const state=api.state;state.baseMaterial=500;state.baseEnergy=500;
    const firstSite=findResearchSite();assert.ok(api.buildResearch(firstSite.q,firstSite.r));state.researchPoints=0;api.updateResearch(10);assert.equal(state.researchPoints,10);
    for(let count=0;count<2;count++){const site=findResearchSite();assert.ok(site);assert.ok(api.buildResearch(site.q,site.r));}
    state.researchPoints=0;api.updateResearch(10);assert.equal(state.researchPoints,10);
  });

  test("all three triangular cells render R and select the same 300 HP building",()=>{
    const state=api.state,context=elements.get("gameCanvas").context,research=addResearchBuilding();context.textCalls.length=0;
    api.drawStructures();
    assert.equal(context.textCalls.filter(call=>call.text==="R").length,3);
    for(const cell of research.footprint)assert.equal(api.structureAt(cell.q,cell.r),research);
    state.mode="select";api.handleHexClick(research.footprint[2]);
    assert.deepEqual({...state.selected},{type:"structure",id:research.id});assert.match(api.selectionHtml(),/300 \/ 300/);
  });

  test("repeated upgrades cost 30 points and multiply their current effect",()=>{
    const state=api.state;addResearchBuilding();state.researchPoints=100;
    assert.match(api.selectionHtml(),/\+50% turret damage \(0\)/);
    assert.equal(api.purchaseResearchUpgrade("turretDamage"),true);
    assert.match(api.selectionHtml(),/\+50% turret damage \(1\)/);assert.equal(elements.get("toastStack").children.at(-1).textContent,"+50% turret damage (1) researched.");
    assert.equal(api.purchaseResearchUpgrade("turretDamage"),true);
    assert.equal(state.researchPoints,40);assert.equal(api.researchUpgradeCount("turretDamage"),2);assert.equal(api.turretDamage(),3);
  });

  test("the Research pane exposes grouped upgrade buttons without hover tooltips",()=>{
    const state=api.state;addResearchBuilding();state.researchPoints=29;
    const html=api.selectionHtml();
    assert.match(html,/<h2>Research building<\/h2>/);
    assert.equal((html.match(/data-action="research-/g)||[]).length,21);
    assert.equal((html.match(/disabled aria-disabled="true"/g)||[]).length,21);
    assert.doesNotMatch(html,/data-bs-toggle="tooltip"|title="/);
    for(const heading of ["Turrets (fixed and train)","Artillery","Neutralizers","Trains and mining","Infrastructure","Other"])assert.match(html,new RegExp(heading.replace(/[()]/g,"\\$&")));
    assert.equal((html.match(/\(0\)/g)||[]).length,21,"every unresearched item should display its current level as 0");
    assert.match(html,/\+20% turret range \(0\)/);assert.match(html,/\+20% artillery range \(0\)/);
    assert.match(html,/\+25% turret energy storage \(0\)/);assert.match(html,/\+25% artillery energy storage \(0\)/);
    assert.match(html,/\+20% mining efficiency \(0\)/);
    assert.match(html,/\+25% load\/unload efficiency \(0\)/);
    assert.match(html,/\+50% neutralizer hit points \(0\)/);assert.match(html,/\+20% neutralizer movement speed \(0\)/);assert.match(html,/\+25% neutralizer production speed \(0\)/);
    assert.match(html,/1 research point\(s\) gained for each second of survival/);
    assert.match(html,/All research items cost 30 research points/);
    assert.doesNotMatch(html,/infinite/i);
  });

  test("Research rate uses six upgrades with diminishing bonuses and then becomes maxed",()=>{
    const state=api.state;addResearchBuilding();state.researchPoints=180;
    const bonuses=[25,20,15,10,5,2.5],rates=[1.25,1.5,1.725,1.8975,1.992375,2.042184375];
    for(let level=0;level<bonuses.length;level++){
      assert.match(api.selectionHtml(),new RegExp(`\\+${bonuses[level]}% research rate \\(${level}\\)`));
      assert.equal(api.purchaseResearchUpgrade("researchSpeed"),true);
      assert.ok(Math.abs(api.researchRate()-rates[level])<1e-12);
    }
    assert.match(api.selectionHtml(),/Research rate maxed \(6\)/);
    const pointsBefore=state.researchPoints;assert.equal(Boolean(api.purchaseResearchUpgrade("researchSpeed")),false);assert.equal(state.researchPoints,pointsBefore);assert.equal(api.researchUpgradeCount("researchSpeed"),6);
  });

  test("every research item caps after six purchases",()=>{
    const state=api.state;addResearchBuilding();state.researchPoints=10000;
    for(const upgrade of api.constants.RESEARCH_UPGRADES){
      assert.equal(api.researchUpgradeMaxLevel(upgrade),6,upgrade.key);
      for(let level=0;level<6;level++)assert.equal(api.purchaseResearchUpgrade(upgrade.key),true,`${upgrade.key} level ${level+1}`);
      assert.equal(api.researchUpgradeCount(upgrade.key),6,upgrade.key);
      const points=state.researchPoints;assert.equal(Boolean(api.purchaseResearchUpgrade(upgrade.key)),false,`${upgrade.key} must reject a seventh purchase`);assert.equal(state.researchPoints,points);
    }
    const html=api.selectionHtml();assert.equal((html.match(/maxed \(6\)/gi)||[]).length,api.constants.RESEARCH_UPGRADES.length);assert.equal(api.artilleryRange(),33);
  });

  test("all twenty-one upgrades immediately update existing units and expose upgraded future values",()=>{
    const state=api.state,research=addResearchBuilding();state.researchPoints=1000;
    const train=addTestTrain(),wall={id:"wall-existing",type:"wall",q:6,r:6,hp:80,maxHp:100},track=makeTrack(7,7);
    const turret={id:"turret-existing",type:"turret",q:5,r:5,hp:18,maxHp:18,energy:20,maxEnergy:20,cooldown:1};
    const artillery={id:"artillery-existing",type:"artillery",q:4,r:4,hp:36,maxHp:36,energy:40,maxEnergy:50,cooldown:3};
    const gate={id:"gate-existing",type:"gate",q:3,r:3,hp:100,maxHp:100},neutralizerBuilding={id:"neutralizer-building-existing",type:"neutralizer-building",q:2,r:2,footprint:[{q:2,r:2},{q:2,r:3}],hp:200,maxHp:200,material:20,energy:20,maxMaterial:20,maxEnergy:20,productionClock:.5},point=api.enemyWorldPosition(1,1,0),neutralizer={id:"neutralizer-existing",type:"neutralizer",q:1,r:1,slot:0,x:point.x,y:point.y,fromQ:1,fromR:1,fromSlot:0,toQ:1,toR:1,toSlot:0,progress:1,moveCount:0,speed:api.constants.NEUTRALIZER_SPEED,hp:1,maxHp:1,attackClock:.5,nextPathAt:0,phase:0};
    state.structures.set("6,6",wall);state.structures.set("5,5",turret);state.structures.set("4,4",artillery);state.structures.set("3,3",gate);state.structures.set("2,2",neutralizerBuilding);state.neutralizers.push(neutralizer);state.tracks.set("7,7",track);state.selected={type:"structure",id:research.id};
    for(const upgrade of api.constants.RESEARCH_UPGRADES)assert.equal(api.purchaseResearchUpgrade(upgrade.key),true,upgrade.key);

    assert.ok(Math.abs(api.turretFireInterval()-2/3)<1e-9);assert.ok(Math.abs(api.combatTrainFireInterval()-2/3)<1e-9);assert.equal(api.turretDamage(),2);assert.equal(api.turretRange(),4);assert.equal(api.combatTrainRange(),7);
    assert.equal(api.mineEfficiency(),1.2);assert.equal(train.wagons[0].capacity,45);assert.equal(train.speed,2.8125);
    assert.equal(api.artilleryFireInterval(),2);assert.equal(api.artilleryDamage(true),12);assert.equal(api.artilleryDamage(false),8);assert.equal(api.artilleryDamageAtDistance(2),2);assert.equal(api.artilleryRange(),13);
    assert.equal(api.turretEnergyStorage(),25);assert.equal(turret.maxEnergy,25);assert.equal(turret.energy,20);
    assert.equal(api.artilleryEnergyStorage(),63);assert.equal(artillery.maxEnergy,63);assert.equal(artillery.energy,40);
    assert.equal(wall.maxHp,150);assert.equal(wall.hp,120);assert.equal(track.maxHp,2);assert.equal(track.hp,2);assert.equal(api.researchRate(),1.25);
    assert.ok(Math.abs(turret.cooldown-2/3)<1e-9);assert.equal(artillery.cooldown,2);
    assert.equal(api.wallHitPoints(),150);assert.equal(api.trackHitPoints(),2);assert.equal(api.trainCapacity(),45);assert.equal(api.trainSpeed(),2.8125);assert.equal(api.loadUnloadDuration(),1.5);
    assert.equal(gate.maxHp,150);assert.equal(gate.hp,150);assert.equal(api.neutralizerHitPoints(),2);assert.equal(neutralizer.maxHp,2);assert.equal(neutralizer.hp,2);assert.equal(api.neutralizerDamage(),2);assert.ok(Math.abs(api.neutralizerFireInterval()-2/3)<1e-9);assert.ok(Math.abs(api.neutralizerSpeed()-api.constants.NEUTRALIZER_SPEED*1.2)<1e-12);assert.equal(neutralizer.speed,api.neutralizerSpeed());const futureNeutralizer=api.spawnNeutralizer(neutralizerBuilding);assert.ok(futureNeutralizer);assert.equal(futureNeutralizer.speed,api.neutralizerSpeed());assert.equal(api.neutralizerProductionInterval(),7.2);assert.equal(api.neutralizerStorage(),30);assert.equal(neutralizerBuilding.maxMaterial,30);assert.equal(neutralizerBuilding.maxEnergy,30);assert.equal(neutralizerBuilding.productionClock,.4);
  });

  test("repeated Wall Hit Points research keeps live and future hit points whole",()=>{
    const state=api.state;addResearchBuilding();state.researchPoints=90;
    const wall={id:"wall-rounding",type:"wall",q:6,r:6,hp:100,maxHp:100};state.structures.set("6,6",wall);
    for(let level=0;level<3;level++)assert.equal(api.purchaseResearchUpgrade("wallStrength"),true);
    assert.equal(api.wallHitPoints(),338);assert.equal(wall.maxHp,338);assert.equal(wall.hp,338);
    assert.equal(Number.isInteger(wall.maxHp),true);assert.equal(Number.isInteger(wall.hp),true);
  });

  test("Load/Unload Efficiency shortens Stop holds without shortening activity messages",()=>{
    const state=api.state;addResearchBuilding();state.researchPoints=30;const train=addTestTrain();state.elapsed=10;train.servicingStop=true;train.stopHoldUntil=12;
    assert.equal(api.purchaseResearchUpgrade("loadUnloadEfficiency"),true);
    assert.equal(api.loadUnloadDuration(),1.5);assert.equal(train.stopHoldUntil,11.5,"an active Stop hold should shorten immediately");

    moveTrain(train,api.basePerimeter()[0].q,api.basePerimeter()[0].r);state.tracks.set(api.key(train.q,train.r),makeTrack(train.q,train.r));train.schedule=[{q:train.q,r:train.r}];train.scheduleComplete=true;train.wagons[0].amount=5;state.baseMaterial=0;state.worldMessages=[];
    api.serviceBaseLogistics(train);
    const message=state.worldMessages.find(item=>item.message==="Train A: Unloaded resources to base building");assert.ok(message);assert.equal(message.until-state.elapsed,1.25);
  });

  test("improved Mines transact only whole resource units while consuming fewer Resource Node units",()=>{
    const state=api.state,research=addResearchBuilding();state.researchPoints=60;api.purchaseResearchUpgrade("mineEfficiency");api.purchaseResearchUpgrade("mineEfficiency");
    const train=addTestTrain(),nodePosition=(()=>{for(let q=-15;q<=15;q++)for(let r=-15;r<=15;r++)if(api.terrainAt(q,r).type==="resource"&&api.hexDistance({q,r},state.base)>4)return {q,r};return null;})();
    assert.ok(nodePosition);moveTrain(train,nodePosition.q+1,nodePosition.r);state.tracks.set(api.key(train.q,train.r),makeTrack(train.q,train.r));train.schedule=[{q:train.q,r:train.r}];train.scheduleComplete=true;train.wagons[0].amount=0;train.wagons[0].capacity=30;
    const terrain=api.terrainAt(nodePosition.q,nodePosition.r),node=api.resourceNodeAt(nodePosition.q,nodePosition.r);api.setNodeAmount(node,100);
    state.structures.set(api.key(nodePosition.q,nodePosition.r),{id:"efficient-mine",type:"mine",resource:terrain.resource,q:nodePosition.q,r:nodePosition.r,hp:22,maxHp:22});
    const matching=train.wagons.find(wagon=>wagon.role===terrain.resource);assert.ok(matching);matching.amount=0;
    if(terrain.resource==="energy")train.fuel=train.maxFuel;
    api.updateAutomaticLogistics();
    assert.equal(matching.amount,30);assert.equal(api.resourceNodeAt(nodePosition.q,nodePosition.r).amount,79);
    assert.ok(Number.isInteger(matching.amount));assert.ok(Number.isInteger(api.resourceNodeAt(nodePosition.q,nodePosition.r).amount));
  });

  test("Turret, Turret Train, and Artillery upgrades change live attacks immediately",()=>{
    const state=api.state;addResearchBuilding();state.researchPoints=180;
    for(const keyName of ["turretFireRate","turretDamage","artilleryFireRate","artilleryDamage"])api.purchaseResearchUpgrade(keyName);

    state.hives.clear();const turret={id:"upgraded-turret",type:"turret",q:4,r:4,hp:18,maxHp:18,energy:20,maxEnergy:20,cooldown:0};state.structures.set("4,4",turret);
    const turretTarget=api.createHive(5,4,10);api.updateStructures(0);
    assert.equal(turretTarget.hp,8);assert.ok(Math.abs(turret.cooldown-2/3)<1e-9);

    state.hives.clear();const combat=addTestTrain("combat"),combatTarget=api.createHive(combat.q+1,combat.r,10);api.updateCombatTrains(.5);
    assert.equal(combatTarget.hp,8,"Turret Train damage should share the Turret damage upgrade");assert.ok(Math.abs(combat.combatCooldown-2/3)<1e-9);

    state.hives.clear();const artillery={id:"upgraded-artillery",type:"artillery",q:-4,r:-4,hp:36,maxHp:36,energy:40,maxEnergy:40,cooldown:0};state.structures.set("-4,-4",artillery);
    const artilleryTarget=api.createHive(-3,-4,13);assert.equal(api.fireArtillery(artillery),true);assert.equal(artillery.cooldown,2);
    api.resolveArtilleryImpact(state.projectiles.at(-1));assert.equal(artilleryTarget.hp,1);
  });

  test("destroying Research leaves one selectable three-cell ghost",()=>{
    const state=api.state,research=addResearchBuilding();api.damageTarget(research,300);
    assert.equal(state.structures.size,0);const ghost=state.ghosts.get(api.key(research.q,research.r));assert.equal(ghost.objectType,"research");assert.equal(ghost.footprint.length,3);
    for(const cell of ghost.footprint)assert.equal(api.ghostAt(cell.q,cell.r),ghost);
    state.mode="select";api.handleHexClick(ghost.footprint[1]);assert.deepEqual({...state.selected},{type:"ghost",id:ghost.id});
    state.particles=[];api.clearGhost(ghost);
    assert.equal(state.particles.length,24,"clearing a three-hex research wreckage should burst in all three hexes");
    const expectedOrigins=new Set(research.footprint.map(cell=>{const point=api.axialToWorld(cell.q,cell.r);return `${point.x},${point.y}`;}));
    assert.deepEqual(new Set(state.particles.map(particle=>`${particle.x},${particle.y}`)),expectedOrigins);
  });

  test("salvaging healthy Research refunds its full configured Construction Material and Energy cost",()=>{
    const state=api.state,research=addResearchBuilding(),materialBefore=state.baseMaterial,energyBefore=state.baseEnergy;

    api.salvageStructure(research);

    assert.equal(state.baseMaterial,materialBefore+api.constants.COSTS.research.material);assert.equal(state.baseEnergy,energyBefore+api.constants.COSTS.research.energy);
    assert.equal(elements.get("toastStack").children.at(-1).textContent,"Salvaged 50 construction material and 50 energy.");
    assert.equal(state.particles.length,24,"salvaging a three-hex research building should burst in all three hexes");
    const expectedOrigins=new Set(research.footprint.map(cell=>{const point=api.axialToWorld(cell.q,cell.r);return `${point.x},${point.y}`;}));
    assert.deepEqual(new Set(state.particles.map(particle=>`${particle.x},${particle.y}`)),expectedOrigins);
  });
});
