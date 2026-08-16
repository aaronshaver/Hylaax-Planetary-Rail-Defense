"use strict";

function terrainHash(q,r,salt=0){return hash(q,r,(state.mapSeed+salt)|0);}

function terrainNoise(q,r,scale,salt){
  const x=q/scale,y=r/scale,x0=Math.floor(x),y0=Math.floor(y),tx=x-x0,ty=y-y0;
  const sx=tx*tx*(3-2*tx),sy=ty*ty*(3-2*ty);
  const a=terrainHash(x0,y0,salt),b=terrainHash(x0+1,y0,salt),c=terrainHash(x0,y0+1,salt),d=terrainHash(x0+1,y0+1,salt);
  return lerp(lerp(a,b,sx),lerp(c,d,sx),sy);
}

function inWaterBlob(q,r){
  const size=13,mq=Math.floor(q/size),mr=Math.floor(r/size);
  for(let dq=-1;dq<=1;dq++)for(let dr=-1;dr<=1;dr++){
    const cellQ=mq+dq,cellR=mr+dr;
    if(terrainHash(cellQ,cellR,101)>.34)continue;
    const centerQ=cellQ*size+terrainHash(cellQ,cellR,102)*(size-1);
    const centerR=cellR*size+terrainHash(cellQ,cellR,103)*(size-1);
    const x=(q-centerQ)+(r-centerR)/2,y=(r-centerR)*.8660254;
    const radius=2.4+terrainHash(cellQ,cellR,104)*3.2;
    if(Math.hypot(x,y)<=radius)return true;
  }
  return false;
}

function inTreeGrove(q,r){
  const size=10,mq=Math.floor(q/size),mr=Math.floor(r/size);
  for(let dq=-1;dq<=1;dq++)for(let dr=-1;dr<=1;dr++){
    const cellQ=mq+dq,cellR=mr+dr;
    if(terrainHash(cellQ,cellR,301)>.28)continue;
    const centerQ=cellQ*size+terrainHash(cellQ,cellR,302)*(size-1);
    const centerR=cellR*size+terrainHash(cellQ,cellR,303)*(size-1);
    const x=(q-centerQ)+(r-centerR)/2,y=(r-centerR)*.8660254;
    const radius=2+terrainHash(cellQ,cellR,304)*2.2;
    if(Math.hypot(x,y)<=radius)return true;
  }
  return false;
}

const guaranteedNodes = new Map([
  [key(7, -2), "material"],
  [key(-4, 7), "energy"],
  [key(13, 3), "energy"],
  [key(-12, -4), "material"]
]);
let terrainCacheSeed=null,terrainCache=new Map();

function terrainAt(q, r) {
  if(terrainCacheSeed!==state.mapSeed){terrainCacheSeed=state.mapSeed;terrainCache=new Map();}
  const terrainKey=key(q,r);
  if(state.clearedResourceNodes?.has(terrainKey))return {type:"ground"};
  const cached=terrainCache.get(terrainKey);if(cached)return cached;
  const guaranteed = guaranteedNodes.get(terrainKey);
  if (guaranteed){const terrain={type:"resource",resource:guaranteed};terrainCache.set(terrainKey,terrain);return terrain;}
  const d = hexDistance({ q, r }, { q: 0, r: 0 });
  const corridorA = q >= 0 && q <= 7 && r >= -2 && r <= 0;
  const corridorB = q >= -4 && q <= 0 && r >= 0 && r <= 7;
  let terrain;
  if (d < 6 || corridorA || corridorB)terrain={type:"ground"};
  else if(inWaterBlob(q,r))terrain={type:"water",variant:1+Math.min(2,Math.floor(terrainHash(q,r,105)*3))};
  else if(inTreeGrove(q,r))terrain={type:"trees",variant:1+Math.min(2,Math.floor(terrainHash(q,r,305)*3))};
  else{
  const ridge=terrainNoise(q,r,11,201),ridgeDetail=terrainNoise(q,r,3.4,202);
    if(Math.abs(ridge-.5)<.034&&ridgeDetail>.3)terrain={type:"rock",variant:1+Math.min(1,Math.floor(terrainHash(q,r,205)*2))};
    else {const v=terrainHash(q,r,17);terrain=v>.986?{type:"resource",resource:terrainHash(q,r,31)>.5?"material":"energy"}:{type:"ground"};}
  }
  terrainCache.set(terrainKey,terrain);return terrain;
}
