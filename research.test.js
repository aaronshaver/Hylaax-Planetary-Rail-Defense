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
  test("points accrue from survival immediately but stay hidden until Research is built",()=>{
    const state=api.state;api.updateResearch(95.75);api.updateUI(true);
    assert.equal(state.researchPoints,95.75);assert.equal(elements.get("researchPointsHud").textContent,"-");

    const site=findResearchSite();assert.ok(site);state.baseMaterial=200;state.baseEnergy=200;
    const research=api.buildResearch(site.q,site.r);
    assert.ok(research);assert.equal(research.hp,300);assert.equal(research.maxHp,300);assert.equal(research.footprint.length,3);
    assert.equal(state.baseMaterial,100);assert.equal(state.baseEnergy,100);assert.equal(state.researchUnlocked,true);
    assert.equal(elements.get("researchPointsHud").textContent,95);
  });

  test("all three triangular cells render R and select the same 300 HP building",()=>{
    const state=api.state,context=elements.get("gameCanvas").context,research=addResearchBuilding();context.textCalls.length=0;
    api.drawStructures();
    assert.equal(context.textCalls.filter(call=>call.text==="R").length,3);
    for(const cell of research.footprint)assert.equal(api.structureAt(cell.q,cell.r),research);
    state.mode="select";api.handleHexClick(research.footprint[2]);
    assert.deepEqual({...state.selected},{type:"structure",id:research.id});assert.match(api.selectionHtml(),/300 \/ 300/);
  });

  test("each upgrade costs 30 points and infinitely multiplies its current effect",()=>{
    const state=api.state;addResearchBuilding();state.researchPoints=100;
    assert.equal(api.purchaseResearchUpgrade("turretDamage"),true);
    assert.equal(api.purchaseResearchUpgrade("turretDamage"),true);
    assert.equal(state.researchPoints,40);assert.equal(api.researchUpgradeCount("turretDamage"),2);assert.equal(api.turretDamage(),2.25);
  });

  test("the Research pane exposes all upgrade buttons with the cost as the final tooltip bullet",()=>{
    const state=api.state;addResearchBuilding();state.researchPoints=29;
    const html=api.selectionHtml();
    assert.equal((html.match(/data-action="research-/g)||[]).length,12);
    assert.equal((html.match(/• Costs 30 \(R\)esearch points\./g)||[]).length,12);
    assert.equal((html.match(/disabled aria-disabled="true"/g)||[]).length,12);
    assert.match(html,/Applies to both Fixed Turrets and Turret Trains/);
    assert.match(html,/Mining uses fewer resources, extending the life of the Resource Node under the Mine/);
    assert.match(html,/All Train Supply wagons hold more resources/);
  });

  test("all twelve upgrades immediately update existing units and expose upgraded future values",()=>{
    const state=api.state,research=addResearchBuilding();state.researchPoints=1000;
    const train=addTestTrain(),wall={id:"wall-existing",type:"wall",q:6,r:6,hp:80,maxHp:100},track=makeTrack(7,7);
    const turret={id:"turret-existing",type:"turret",q:5,r:5,hp:18,maxHp:18,energy:20,maxEnergy:20,cooldown:1};
    const artillery={id:"artillery-existing",type:"artillery",q:4,r:4,hp:36,maxHp:36,energy:40,maxEnergy:40,cooldown:3};
    state.structures.set("6,6",wall);state.structures.set("5,5",turret);state.structures.set("4,4",artillery);state.tracks.set("7,7",track);state.selected={type:"structure",id:research.id};
    for(const upgrade of api.constants.RESEARCH_UPGRADES)assert.equal(api.purchaseResearchUpgrade(upgrade.key),true,upgrade.key);

    assert.ok(Math.abs(api.turretFireInterval()-2/3)<1e-9);assert.ok(Math.abs(api.combatTrainFireInterval()-.32)<1e-9);assert.equal(api.turretDamage(),1.5);assert.equal(api.turretRange(),6);assert.equal(api.combatTrainRange(),9);
    assert.equal(api.mineEfficiency(),1.5);assert.equal(train.wagons[0].capacity,45);assert.equal(train.speed,3.375);
    assert.equal(api.artilleryFireInterval(),2);assert.equal(api.artilleryDamage(true),12);assert.equal(api.artilleryDamage(false),7.5);assert.equal(api.artilleryRange(),18);
    assert.equal(wall.maxHp,150);assert.equal(wall.hp,120);assert.equal(track.maxHp,5);assert.equal(track.hp,5);assert.equal(api.researchRate(),1.1);
    assert.ok(Math.abs(turret.cooldown-2/3)<1e-9);assert.equal(artillery.cooldown,2);
    assert.equal(api.wallHitPoints(),150);assert.equal(api.trackHitPoints(),5);assert.equal(api.trainCapacity(),45);assert.equal(api.trainSpeed(),3.375);
  });

  test("improved Mines fill the same capacity while consuming fewer Resource Node units",()=>{
    const state=api.state,research=addResearchBuilding();state.researchPoints=30;api.purchaseResearchUpgrade("mineEfficiency");
    const train=addTestTrain(),nodePosition=(()=>{for(let q=-15;q<=15;q++)for(let r=-15;r<=15;r++)if(api.terrainAt(q,r).type==="resource"&&api.hexDistance({q,r},state.base)>4)return {q,r};return null;})();
    assert.ok(nodePosition);moveTrain(train,nodePosition.q+1,nodePosition.r);train.wagons[0].amount=0;train.wagons[0].capacity=30;
    const terrain=api.terrainAt(nodePosition.q,nodePosition.r),node=api.resourceNodeAt(nodePosition.q,nodePosition.r);api.setNodeAmount(node,100);
    state.structures.set(api.key(nodePosition.q,nodePosition.r),{id:"efficient-mine",type:"mine",resource:terrain.resource,q:nodePosition.q,r:nodePosition.r,hp:22,maxHp:22});
    const matching=train.wagons.find(wagon=>wagon.role===terrain.resource);assert.ok(matching);matching.amount=0;
    if(terrain.resource==="energy")train.fuel=train.maxFuel;
    api.updateAutomaticLogistics();
    assert.equal(matching.amount,30);assert.ok(Math.abs(api.resourceNodeAt(nodePosition.q,nodePosition.r).amount-80)<1e-9);
  });

  test("Turret, Turret Train, and Artillery upgrades change live attacks immediately",()=>{
    const state=api.state;addResearchBuilding();state.researchPoints=180;
    for(const keyName of ["turretFireRate","turretDamage","artilleryFireRate","artilleryDamage"])api.purchaseResearchUpgrade(keyName);

    state.hives.clear();const turret={id:"upgraded-turret",type:"turret",q:4,r:4,hp:18,maxHp:18,energy:20,maxEnergy:20,cooldown:0};state.structures.set("4,4",turret);
    const turretTarget=api.createHive(5,4,10);api.updateStructures(0);
    assert.equal(turretTarget.hp,8.5);assert.ok(Math.abs(turret.cooldown-2/3)<1e-9);

    state.hives.clear();const combat=addTestTrain("combat"),combatTarget=api.createHive(combat.q+1,combat.r,10);api.updateCombatTrains(.5);
    assert.equal(combatTarget.hp,8.5,"Turret Train damage should share the Turret damage upgrade");assert.ok(Math.abs(combat.combatCooldown-.32)<1e-9);

    state.hives.clear();const artillery={id:"upgraded-artillery",type:"artillery",q:-4,r:-4,hp:36,maxHp:36,energy:40,maxEnergy:40,cooldown:0};state.structures.set("-4,-4",artillery);
    const artilleryTarget=api.createHive(-3,-4,20);assert.equal(api.fireArtillery(artillery),true);assert.equal(artillery.cooldown,2);
    api.resolveArtilleryImpact(state.projectiles.at(-1));assert.equal(artilleryTarget.hp,8);
  });

  test("destroying Research leaves one selectable three-cell ghost",()=>{
    const state=api.state,research=addResearchBuilding();api.damageTarget(research,300);
    assert.equal(state.structures.size,0);const ghost=state.ghosts.get(api.key(research.q,research.r));assert.equal(ghost.objectType,"research");assert.equal(ghost.footprint.length,3);
    for(const cell of ghost.footprint)assert.equal(api.ghostAt(cell.q,cell.r),ghost);
    state.mode="select";api.handleHexClick(ghost.footprint[1]);assert.deepEqual({...state.selected},{type:"ghost",id:ghost.id});
  });
});
