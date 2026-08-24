"use strict";

const assert = require("node:assert/strict");
const { describe, test, beforeEach } = require("node:test");
const { api, elements } = require("./harness.js");

beforeEach(() => { api.reset(); });

describe("terrain generation", () => {
  test("Construction Nodes generate 250–1,500 units while Energy Nodes generate 40% more",()=>{
    assert.equal(api.constants.NODE_MIN_CAPACITY,250);assert.equal(api.constants.NODE_MAX_CAPACITY,1500);
    assert.equal(api.constants.ENERGY_NODE_MIN_CAPACITY,350);assert.equal(api.constants.ENERGY_NODE_MAX_CAPACITY,2100);
    let constructionNodes=0,energyNodes=0;
    for(let q=-40;q<=40;q++)for(let r=-40;r<=40;r++)if(api.terrainAt(q,r).type==="resource"){
      const node=api.resourceNodeAt(q,r);
      if(node.resource==="energy"){energyNodes++;assert.ok(node.amount>=350&&node.amount<=2100);}
      else {constructionNodes++;assert.ok(node.amount>=250&&node.amount<=1500);}
    }
    assert.ok(constructionNodes>0&&energyNodes>0);
  });

  test("tree hexes use stable one-, two-, and three-tree variants", () => {
    const variants = new Set();
    for(let q=-40;q<=40&&variants.size<3;q++)for(let r=-40;r<=40&&variants.size<3;r++){
      const first = api.terrainAt(q,r);
      if(first.type!=="trees")continue;
      assert.equal(api.terrainAt(q,r).variant,first.variant);
      variants.add(first.variant);
    }
    assert.deepEqual([...variants].sort(),[1,2,3]);
  });

  test("mountain hexes use stable single- and multi-peak variants", () => {
    const variants = new Set();
    for(let q=-60;q<=60&&variants.size<2;q++)for(let r=-60;r<=60&&variants.size<2;r++){
      const first = api.terrainAt(q,r);
      if(first.type!=="rock")continue;
      assert.equal(api.terrainAt(q,r).variant,first.variant);
      variants.add(first.variant);
    }
    assert.deepEqual([...variants].sort(),[1,2]);
  });

  test("water hexes use stable normal, light, and dark wave variants", () => {
    const variants = new Set();
    for(let q=-60;q<=60&&variants.size<3;q++)for(let r=-60;r<=60&&variants.size<3;r++){
      const first = api.terrainAt(q,r);
      if(first.type!=="water")continue;
      assert.equal(api.terrainAt(q,r).variant,first.variant);
      variants.add(first.variant);
    }
    assert.deepEqual([...variants].sort(),[1,2,3]);
  });

  test("guaranteed resource nodes remain available and typed", () => {
    assert.deepEqual({ ...api.terrainAt(7, -2) }, { type: "resource", resource: "material" });
    assert.deepEqual({ ...api.terrainAt(-4, 7) }, { type: "resource", resource: "energy" });
  });

  test("Hive blockers cost 14 C and 14 E, cover seven clear land hexes, and permanently reject Hive spawns",()=>{
    const state=api.state;let site=null;
    for(let q=-15;q<=15&&!site;q++)for(let r=-15;r<=15&&!site;r++)if(api.hiveBlockerFootprint(q,r).every(api.hiveBlockerCellClear))site={q,r};
    assert.ok(site);const footprint=api.hiveBlockerFootprint(site.q,site.r);assert.equal(footprint.length,7);assert.equal(new Set(footprint.map(cell=>api.key(cell.q,cell.r))).size,7);
    const materialBefore=state.baseMaterial,energyBefore=state.baseEnergy;assert.equal(api.setMode("hiveBlocker"),true);assert.equal(api.handleHexClick(site),true);
    assert.equal(state.baseMaterial,materialBefore-14);assert.equal(state.baseEnergy,energyBefore-14);assert.equal(state.hiveBlockedLand.size,7);
    for(const cell of footprint){assert.equal(api.terrainAt(cell.q,cell.r).type,"land");assert.equal(state.hiveBlockedLand.has(api.key(cell.q,cell.r)),true);assert.equal(api.hiveHexOpen(cell.q,cell.r),false);}
    const research=api.buildResearch(site.q,site.r);assert.ok(research,"ordinary structures remain buildable over blocked land");assert.ok(research.footprint.every(cell=>state.hiveBlockedLand.has(api.key(cell.q,cell.r))));
    api.salvageStructure(research);assert.equal(state.hiveBlockedLand.size,7,"building and salvaging over a blocker cannot remove it");
  });

  test("Hive blockers reject any seven-hex footprint that is not entirely clear land without charging",()=>{
    const state=api.state,materialBefore=state.baseMaterial,energyBefore=state.baseEnergy;api.setMode("hiveBlocker");
    assert.equal(Boolean(api.handleHexClick({q:7,r:-2})),false);assert.equal(state.hiveBlockedLand.size,0);assert.equal(state.baseMaterial,materialBefore);assert.equal(state.baseEnergy,energyBefore);
    assert.equal(elements.get("toastStack").children.at(-1).textContent,"Hive blockers need seven clear land hexes.");
  });

  test("Hive blockers may overlap existing blocker hexes and discount 2 C and 2 E per overlap",()=>{
    const state=api.state;let site=null;
    for(let q=-15;q<=15&&!site;q++)for(let r=-15;r<=15&&!site;r++)if(api.hiveBlockerFootprint(q,r).every(api.hiveBlockerCellClear))site={q,r};
    assert.ok(site);const footprint=api.hiveBlockerFootprint(site.q,site.r);state.hiveBlockedLand.add(api.key(footprint[0].q,footprint[0].r));state.hiveBlockedLand.add(api.key(footprint[1].q,footprint[1].r));
    assert.deepEqual({...api.hiveBlockerPlacementCost(site.q,site.r)},{material:10,energy:10});
    state.baseMaterial=10;state.baseEnergy=10;assert.equal(api.setMode("hiveBlocker"),true);assert.equal(api.placeHiveBlocker(site.q,site.r),true);
    assert.equal(state.baseMaterial,0);assert.equal(state.baseEnergy,0);assert.equal(state.hiveBlockedLand.size,7);
  });

  test("Terraform land converts blocked terrain and resource nodes to clear land for 5 C and 5 E each",()=>{
    const state=api.state,targets={};
    for(let q=-60;q<=60&&Object.keys(targets).length<3;q++)for(let r=-60;r<=60&&Object.keys(targets).length<3;r++){
      const type=api.terrainAt(q,r).type;if(["water","trees","rock"].includes(type)&&!targets[type])targets[type]={q,r};
    }
    assert.deepEqual(Object.keys(targets).sort(),["rock","trees","water"]);
    state.baseMaterial=30;state.baseEnergy=30;assert.equal(api.setMode("terraform"),true);
    for(const type of ["water","trees","rock"]){
      const target=targets[type],materialBefore=state.baseMaterial,energyBefore=state.baseEnergy;
      assert.equal(api.handleHexClick(target),true);assert.equal(api.terrainAt(target.q,target.r).type,"land");assert.equal(api.isPassable(target.q,target.r),true);
      assert.equal(state.terraformedLand.has(api.key(target.q,target.r)),true);assert.equal(state.baseMaterial,materialBefore-5);assert.equal(state.baseEnergy,energyBefore-5);
    }
    const node=api.resourceNodeAt(7,-2);api.setNodeAmount(node,73);const materialBefore=state.baseMaterial,energyBefore=state.baseEnergy;
    assert.equal(api.handleHexClick({q:7,r:-2}),true);assert.equal(api.terrainAt(7,-2).type,"land");assert.equal(state.nodeResources.has("7,-2"),false);assert.equal(state.baseMaterial,materialBefore-5);assert.equal(state.baseEnergy,energyBefore-5);
    const spentMaterial=state.baseMaterial,spentEnergy=state.baseEnergy;
    assert.equal(Boolean(api.handleHexClick({q:0,r:6})),false,"ordinary land must remain invalid");assert.equal(state.baseMaterial,spentMaterial);assert.equal(state.baseEnergy,spentEnergy);assert.equal(elements.get("toastStack").children.at(-1).textContent,"Cannot terraform this type of object.");
  });

  test("Terraform land does not silently delete a Mine or its resource node",()=>{
    const state=api.state,node=api.resourceNodeAt(7,-2),mine={id:"terraform-mine",type:"mine",resource:node.resource,q:node.q,r:node.r,hp:22,maxHp:22};state.structures.set(node.id,mine);state.baseMaterial=20;state.baseEnergy=20;api.setMode("terraform");
    assert.equal(Boolean(api.handleHexClick({q:node.q,r:node.r})),false);assert.equal(state.structures.get(node.id),mine);assert.equal(api.terrainAt(node.q,node.r).type,"resource");assert.equal(state.baseMaterial,20);assert.equal(state.baseEnergy,20);
  });

  test("every generated resource node has a traversable approach to the larger clear area",()=>{
    let resources=0;
    for(let q=-55;q<=55;q++)for(let r=-55;r<=55;r++){
      if(api.terrainAt(q,r).type!=="resource")continue;
      resources++;
      assert.equal(api.resourceHasOpenApproach(q,r),true,`resource at ${q},${r} is trapped by impassable terrain`);
    }
    assert.ok(resources>4,"the scan should exercise generated nodes as well as guaranteed nodes");
  });

  test("salvaging an exhausted Mine clears its resource node into land", () => {
    const node = api.resourceNodeAt(7, -2);
    assert.ok(node.amount >= api.constants.NODE_MIN_CAPACITY);
    assert.ok(node.amount <= api.constants.NODE_MAX_CAPACITY);

    const mine = { id: "mine-exhausted", type: "mine", resource: node.resource, q: node.q, r: node.r, hp: 22, maxHp: 22 };
    api.state.structures.set(api.key(mine.q, mine.r), mine);
    api.state.tracks.set(api.key(6, -2), { q: 6, r: -2, hp: 1, maxHp: 1, links: new Set() });
    api.setNodeAmount(node, 0);

    api.salvageStructure(mine);

    assert.equal(api.state.structures.has(api.key(mine.q, mine.r)), false);
    assert.equal(api.state.clearedResourceNodes.has(api.key(node.q, node.r)), true);
    assert.equal(api.state.nodeResources.has(api.key(node.q, node.r)), false);
    assert.equal(api.terrainAt(7, -2).type, "land");
    assert.deepEqual({ ...api.state.selected }, { type: "base", id: "base" });
  });

  test("clearing a destroyed Mine returns nothing and preserves a Resource Node that still has resources",()=>{
    const state=api.state,node=api.resourceNodeAt(7,-2);api.setNodeAmount(node,73);
    const mine={id:"mine-destroyed",type:"mine",resource:node.resource,q:node.q,r:node.r,hp:1,maxHp:22};state.structures.set(node.id,mine);
    api.damageTarget(mine,1);const materialBefore=state.baseMaterial,energyBefore=state.baseEnergy;
    api.setMode("salvage");api.handleHexClick({q:node.q,r:node.r});
    assert.equal(state.ghosts.has(node.id),false);assert.equal(api.terrainAt(node.q,node.r).type,"resource");assert.equal(api.resourceNodeAt(node.q,node.r).amount,73);
    assert.equal(state.baseMaterial,materialBefore);assert.equal(state.baseEnergy,energyBefore);
  });

  test("clearing a destroyed Mine on an exhausted node clears the land",()=>{
    const state=api.state,node=api.resourceNodeAt(7,-2);api.setNodeAmount(node,0);
    const mine={id:"mine-destroyed-empty",type:"mine",resource:node.resource,q:node.q,r:node.r,hp:1,maxHp:22};state.structures.set(node.id,mine);
    api.damageTarget(mine,1);api.setMode("salvage");api.handleHexClick({q:node.q,r:node.r});
    assert.equal(state.ghosts.has(node.id),false);assert.equal(api.terrainAt(node.q,node.r).type,"land");
  });

  test("salvaging a healthy Mine leaves a Resource Node that still has resources",()=>{
    const state=api.state,node=api.resourceNodeAt(7,-2);api.setNodeAmount(node,51);
    const mine={id:"mine-healthy",type:"mine",resource:node.resource,q:node.q,r:node.r,hp:22,maxHp:22};state.structures.set(node.id,mine);state.tracks.set("6,-2",{q:6,r:-2,hp:1,maxHp:1,links:new Set()});
    const materialBefore=state.baseMaterial;api.salvageStructure(mine);
    assert.equal(state.structures.has(node.id),false);assert.equal(api.terrainAt(node.q,node.r).type,"resource");assert.equal(api.resourceNodeAt(node.q,node.r).amount,51);assert.equal(state.baseMaterial,materialBefore+10);
  });
});
