"use strict";

const assert = require("node:assert/strict");
const { describe, test, beforeEach } = require("node:test");
const { api } = require("./harness.js");

beforeEach(() => { api.reset(); });

describe("geometry and initial state", () => {
  test("hex conversion and distance are stable", () => {
    assert.equal(api.hexDistance({ q: 0, r: 0 }, { q: 3, r: -2 }), 3);
    for (const hex of [{ q: 0, r: 0 }, { q: 7, r: -4 }, { q: -8, r: 3 }]) {
      const roundTrip = api.worldToAxial(...Object.values(api.axialToWorld(hex.q, hex.r)));
      assert.equal(`${roundTrip.q},${roundTrip.r}`, `${hex.q},${hex.r}`);
    }
  });

  test("a new game has one random adjacent Track and no Train", () => {
    const state = api.state;
    const [track]=state.tracks.values();
    assert.equal(state.tracks.size, 1);
    assert.equal(api.structureFootprint(state.base).length,4);
    assert.equal(api.basePerimeter().length,10);
    for(const cell of api.structureFootprint(state.base))assert.equal(api.structureAt(cell.q,cell.r),state.base);
    assert.equal(api.distanceToStructure(track,state.base),1);
    assert.equal(track.links.size,0);
    assert.equal(state.trains.length,0);
    assert.equal(state.baseMaterial, 200);
    assert.equal(state.baseEnergy,125);
    assert.equal(state.nextTrainIndex,0);
    assert.equal(api.constants.TRACK_HIT_POINTS, 1);
    assert.equal(api.constants.TRAIN_HIT_POINTS, 50);
  });

  test("Train names use the Build/Mine and Turret labels", () => {
    assert.equal(api.trainName(0,"builder"),"Build/mine train A");
    assert.equal(api.trainName(1,"combat"),"Turret train B");
  });

  test("the shared construction sound uses a softened triangle sweep",()=>{
    const calls=[],originalTone=api.sounds.tone;api.sounds.tone=(...args)=>calls.push(args);
    try{api.sounds.place();}finally{api.sounds.tone=originalTone;}
    assert.deepEqual(calls,[[150,.12,"triangle",.018,260]]);
  });

  test("the seven Creep positions are the center and six separated hex-corner positions",()=>{
    const offsets=Array.from({length:api.constants.CREEP_HEX_CAPACITY},(_,slot)=>api.enemySlotOffset(slot));
    assert.deepEqual({...offsets[0]},{x:0,y:0});
    for(const offset of offsets.slice(1))assert.ok(Math.abs(Math.hypot(offset.x,offset.y)-api.constants.CREEP_SLOT_RADIUS)<1e-9);
    const minimumDistance=Math.min(...offsets.flatMap((a,index)=>offsets.slice(index+1).map(b=>Math.hypot(a.x-b.x,a.y-b.y))));
    const maximumRenderedRadius=11.6*api.constants.CREEP_RENDER_SCALE;
    assert.ok(minimumDistance>maximumRenderedRadius*2,"all seven rendered Creeps need visible whitespace between them");
  });
});
