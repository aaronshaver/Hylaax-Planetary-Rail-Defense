"use strict";

function terrainHash(q,r,salt=0){return hash(q,r,(state.mapSeed+salt)|0);}

function terrainNoise(q,r,scale,salt){
  const x=q/scale,y=r/scale,x0=Math.floor(x),y0=Math.floor(y),tx=x-x0,ty=y-y0;
  const sx=tx*tx*(3-2*tx),sy=ty*ty*(3-2*ty);
  const a=terrainHash(x0,y0,salt),b=terrainHash(x0+1,y0,salt),c=terrainHash(x0,y0+1,salt),d=terrainHash(x0+1,y0+1,salt);
  return lerp(lerp(a,b,sx),lerp(c,d,sx),sy);
}

function insideTerrainPatch(q,r,centerQ,centerR,radius,shapeSeed,salt){
  const x=(q-centerQ)+(r-centerR)/2,y=(r-centerR)*.8660254;
  const angle=shapeSeed*Math.PI,cos=Math.cos(angle),sin=Math.sin(angle),aspect=.68+terrainHash(Math.floor(centerQ),Math.floor(centerR),salt+1)*.64;
  const rotatedX=(x*cos-y*sin)/(radius*aspect),rotatedY=(x*sin+y*cos)/(radius/aspect);
  const edgeWobble=(terrainNoise(q,r,1.55,salt+2)-.5)*.3;
  return Math.hypot(rotatedX,rotatedY)<=1+edgeWobble;
}

function inWaterBlob(q,r){
  const size=13,mq=Math.floor(q/size),mr=Math.floor(r/size);
  for(let dq=-1;dq<=1;dq++)for(let dr=-1;dr<=1;dr++){
    const cellQ=mq+dq,cellR=mr+dr;
    const regionQ=Math.floor(cellQ/4),regionR=Math.floor(cellR/4),regionalFrequency=.27+terrainHash(regionQ,regionR,108)*.14;
    if(terrainHash(cellQ,cellR,101)>regionalFrequency)continue;
    const centerQ=cellQ*size+terrainHash(cellQ,cellR,102)*(size-1);
    const centerR=cellR*size+terrainHash(cellQ,cellR,103)*(size-1);
    const regionalScale=.88+terrainHash(regionQ,regionR,109)*.24;
    const radius=(2.05+Math.pow(terrainHash(cellQ,cellR,104),.82)*3.95)*regionalScale;
    if(insideTerrainPatch(q,r,centerQ,centerR,radius,terrainHash(cellQ,cellR,106),107))return true;
  }
  return false;
}

function inTreeGrove(q,r){
  const size=10,mq=Math.floor(q/size),mr=Math.floor(r/size);
  for(let dq=-1;dq<=1;dq++)for(let dr=-1;dr<=1;dr++){
    const cellQ=mq+dq,cellR=mr+dr;
    const regionQ=Math.floor(cellQ/4),regionR=Math.floor(cellR/4),regionalFrequency=.22+terrainHash(regionQ,regionR,308)*.12;
    if(terrainHash(cellQ,cellR,301)>regionalFrequency)continue;
    const centerQ=cellQ*size+terrainHash(cellQ,cellR,302)*(size-1);
    const centerR=cellR*size+terrainHash(cellQ,cellR,303)*(size-1);
    const regionalScale=.88+terrainHash(regionQ,regionR,309)*.24;
    const radius=(1.7+Math.pow(terrainHash(cellQ,cellR,304),.82)*2.95)*regionalScale;
    if(insideTerrainPatch(q,r,centerQ,centerR,radius,terrainHash(cellQ,cellR,306),307))return true;
  }
  return false;
}

const guaranteedNodes = new Map([
  [key(7, -2), "material"],
  [key(-4, 7), "energy"],
  [key(13, 3), "energy"],
  [key(-12, -4), "material"]
]);
const guaranteedResourceCorridors=new Set();
for(const nodeKey of guaranteedNodes.keys()){
  const target=fromKey(nodeKey);
  for(const position of [{q:0,r:0},...hexLineBetween({q:0,r:0},target),target])guaranteedResourceCorridors.add(key(position.q,position.r));
}
let terrainCacheSeed=null,terrainCache=new Map();

function baseTerrainAt(q,r){
  const d = distanceToStructure({q,r},state.base);
  const corridorA = q >= 0 && q <= 7 && r >= -2 && r <= 0;
  const corridorB = q >= -4 && q <= 0 && r >= 0 && r <= 7;
  if (d < 6 || corridorA || corridorB||guaranteedResourceCorridors.has(key(q,r)))return {type:"ground"};
  if(inWaterBlob(q,r))return {type:"water",variant:1+Math.min(2,Math.floor(terrainHash(q,r,105)*3))};
  if(inTreeGrove(q,r))return {type:"trees",variant:1+Math.min(2,Math.floor(terrainHash(q,r,305)*3))};
  const ridge=terrainNoise(q,r,11,201),ridgeDetail=terrainNoise(q,r,3.4,202);
  return Math.abs(ridge-.5)<.034&&ridgeDetail>.3
    ?{type:"rock",variant:1+Math.min(1,Math.floor(terrainHash(q,r,205)*2))}
    :{type:"ground"};
}

function resourceHasOpenApproach(q,r){
  const origin={q,r},visited=new Set([key(q,r)]),queue=[];
  for(const position of neighbors(q,r)){
    if(baseTerrainAt(position.q,position.r).type!=="ground")continue;
    visited.add(key(position.q,position.r));queue.push(position);
  }
  for(let cursor=0;cursor<queue.length;cursor++){
    const current=queue[cursor];
    if(hexDistance(origin,current)>=4)return true;
    for(const next of neighbors(current.q,current.r)){
      const nextKey=key(next.q,next.r);
      if(visited.has(nextKey)||baseTerrainAt(next.q,next.r).type!=="ground")continue;
      visited.add(nextKey);queue.push(next);
    }
  }
  return false;
}

function terrainAt(q, r) {
  if(terrainCacheSeed!==state.mapSeed){terrainCacheSeed=state.mapSeed;terrainCache=new Map();}
  const terrainKey=key(q,r);
  if(state.clearedResourceNodes?.has(terrainKey))return {type:"ground"};
  const cached=terrainCache.get(terrainKey);if(cached)return cached;
  const guaranteed = guaranteedNodes.get(terrainKey);
  if (guaranteed){const terrain={type:"resource",resource:guaranteed};terrainCache.set(terrainKey,terrain);return terrain;}
  let terrain=baseTerrainAt(q,r);
  const d=distanceToStructure({q,r},state.base),corridorA=q>=0&&q<=7&&r>=-2&&r<=0,corridorB=q>=-4&&q<=0&&r>=0&&r<=7;
  if(terrain.type==="ground"&&d>=6&&!corridorA&&!corridorB&&!guaranteedResourceCorridors.has(terrainKey)&&terrainHash(q,r,17)>.986&&resourceHasOpenApproach(q,r))terrain={type:"resource",resource:terrainHash(q,r,31)>.5?"material":"energy"};
  terrainCache.set(terrainKey,terrain);return terrain;
}
