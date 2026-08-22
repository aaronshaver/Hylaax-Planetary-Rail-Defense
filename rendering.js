"use strict";

const TREE_LAYOUTS = {
  1: [[0,1,1.05]],
  2: [[-7,7,.85],[6,-4,.96]],
  3: [[-10,7,.78],[8,8,.88],[0,-5,.94]]
};

function hexPathOn(context,q,r,scale=.94){
  const p=axialToWorld(q,r),radius=HEX*scale;context.beginPath();
  HEX_CORNERS.forEach((corner,index)=>{const x=p.x+radius*corner.x,y=p.y+radius*corner.y;if(index===0)context.moveTo(x,y);else context.lineTo(x,y);});context.closePath();
}

function hexPath(q,r,scale=.94){hexPathOn(ctx,q,r,scale);}

function visibleBounds(){
  const z=state.camera.zoom,halfWidth=width/(2*z),halfHeight=height/(2*z),padding=3;
  const corners=[[-halfWidth,-halfHeight],[halfWidth,-halfHeight],[-halfWidth,halfHeight],[halfWidth,halfHeight]].map(([dx,dy])=>{
    const x=state.camera.x+dx,y=state.camera.y+dy;
    return {q:(SQRT3/3*x-y/3)/HEX,r:(2/3*y)/HEX};
  });
  return {q0:Math.floor(Math.min(...corners.map(point=>point.q)))-padding,q1:Math.ceil(Math.max(...corners.map(point=>point.q)))+padding,r0:Math.floor(Math.min(...corners.map(point=>point.r)))-padding,r1:Math.ceil(Math.max(...corners.map(point=>point.r)))+padding};
}

function drawTerrainBase(context){
  const b=visibleBounds();
  const resources=[];let cells=0;
  for(let r=b.r0;r<=b.r1;r++)for(let q=b.q0;q<=b.q1;q++){
    cells++;
    const terrain=terrainAt(q,r), shade=terrainHash(q,r,2);
    hexPathOn(context,q,r,.975);
    if(terrain.type==="water")context.fillStyle=shade>.5?"#102b35":"#0e2630";
    else if(terrain.type==="rock")context.fillStyle=shade>.5?"#252d31":"#20282c";
    else if(terrain.type==="trees")context.fillStyle=shade>.5?"#1d2922":"#19231e";
    else context.fillStyle=shade>.5?"#232527":"#1d1f21";
    context.fill();context.strokeStyle="rgba(132,136,139,.13)";context.lineWidth=.7;context.stroke();
    const p=axialToWorld(q,r);
    if(terrain.type==="water"){
      context.strokeStyle=terrain.variant===2?"rgba(125,215,233,.48)":terrain.variant===3?"rgba(42,112,137,.42)":"rgba(83,174,198,.34)";context.lineWidth=1.2;
      for(const offset of [-6,4]){context.beginPath();context.moveTo(p.x-15,p.y+offset);context.bezierCurveTo(p.x-10,p.y+offset-4,p.x-5,p.y+offset+4,p.x,p.y+offset);context.bezierCurveTo(p.x+5,p.y+offset-4,p.x+10,p.y+offset+4,p.x+15,p.y+offset);context.stroke();}
    }else if(terrain.type==="rock"){
      if(terrain.variant===1){
        context.fillStyle="#41484b";context.beginPath();context.moveTo(p.x-18,p.y+13);context.lineTo(p.x,p.y-18);context.lineTo(p.x+18,p.y+13);context.closePath();context.fill();
        context.fillStyle="#596267";context.beginPath();context.moveTo(p.x,p.y-18);context.lineTo(p.x,p.y+13);context.lineTo(p.x-18,p.y+13);context.closePath();context.fill();
      }else{
        context.fillStyle="#41484b";context.beginPath();context.moveTo(p.x-21,p.y+13);context.lineTo(p.x-10,p.y-13);context.lineTo(p.x-2,p.y-3);context.lineTo(p.x+6,p.y-16);context.lineTo(p.x+21,p.y+13);context.closePath();context.fill();
        context.fillStyle="#596267";context.beginPath();context.moveTo(p.x-10,p.y-13);context.lineTo(p.x-2,p.y-3);context.lineTo(p.x-13,p.y+5);context.closePath();context.fill();context.beginPath();context.moveTo(p.x+6,p.y-16);context.lineTo(p.x+13,p.y+2);context.lineTo(p.x+1,p.y-7);context.closePath();context.fill();
      }
    }else if(terrain.type==="trees"){
      for(const [ox,oy,scale] of TREE_LAYOUTS[terrain.variant]||TREE_LAYOUTS[3]){context.fillStyle="#4b3827";context.fillRect(p.x+ox-1.5*scale,p.y+oy,3*scale,8*scale);context.fillStyle=shade>.5?"#3f8154":"#356f49";context.beginPath();context.moveTo(p.x+ox,p.y+oy-15*scale);context.lineTo(p.x+ox-9*scale,p.y+oy+5*scale);context.lineTo(p.x+ox+9*scale,p.y+oy+5*scale);context.closePath();context.fill();context.fillStyle="#285c3c";context.beginPath();context.moveTo(p.x+ox,p.y+oy-9*scale);context.lineTo(p.x+ox-7*scale,p.y+oy+8*scale);context.lineTo(p.x+ox+7*scale,p.y+oy+8*scale);context.closePath();context.fill();}
    }else if(terrain.type==="resource")resources.push({q,r,p,type:terrain.resource});
  }
  return {resources,cells};
}

function currentTerrainLayerSignature(){return `${state.mapSeed}|${terrainRevision}|${width}|${height}|${dpr}|${state.camera.x}|${state.camera.y}|${state.camera.zoom}`;}

function ensureTerrainLayer(){
  const signature=currentTerrainLayerSignature();if(signature===terrainLayerSignature)return;
  const pixelWidth=Math.max(1,Math.floor(width*dpr)),pixelHeight=Math.max(1,Math.floor(height*dpr));
  if(terrainLayer.width!==pixelWidth)terrainLayer.width=pixelWidth;if(terrainLayer.height!==pixelHeight)terrainLayer.height=pixelHeight;
  terrainCtx.setTransform(dpr,0,0,dpr,0,0);terrainCtx.clearRect(0,0,width,height);terrainCtx.save();terrainCtx.translate(width/2,height/2);terrainCtx.scale(state.camera.zoom,state.camera.zoom);terrainCtx.translate(-state.camera.x,-state.camera.y);
  const result=drawTerrainBase(terrainCtx);terrainCtx.restore();terrainLayerResources=result.resources;terrainLayerCells=result.cells;terrainLayerBuilds++;terrainLayerSignature=signature;
}

function drawResourceNodes(){for(const resource of terrainLayerResources)drawResourceNode(resource.q,resource.r,resource.p,resource.type);}

function terrainLayerStats(){return {builds:terrainLayerBuilds,cells:terrainLayerCells,resources:terrainLayerResources.length};
}

function drawResourceNode(q,r,p,type){
  const node=resourceNodeAt(q,r),exhausted=node.amount<=0,low=!exhausted&&node.amount<=node.maxAmount*.2;
  const color=exhausted?"#697276":type==="energy"?"#60d5db":"#e6b94a";
  ctx.save();
  if(low){const pulse=.5+.5*Math.sin(state.elapsed*5);ctx.shadowBlur=18+pulse*10;ctx.shadowColor="#ff3848";ctx.strokeStyle=`rgba(255,56,72,${.65+pulse*.3})`;ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(p.x,p.y,15+pulse*2,0,Math.PI*2);ctx.stroke();}
  ctx.shadowBlur=exhausted?0:12;ctx.shadowColor=color;ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,11,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle=color;ctx.globalAlpha=exhausted?.12:.18;ctx.fill();ctx.globalAlpha=1;ctx.fillStyle=color;ctx.font="700 15px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(type==="energy"?"E":"C",p.x,p.y+.5);ctx.restore();
  const selected=getSelected();
  const focused=(state.hover?.q===q&&state.hover?.r===r)||(selected?.type==="node"&&selected.q===q&&selected.r===r)||(selected?.type==="mine"&&selected.q===q&&selected.r===r);
  if(focused)drawMiniBar(p.x-17,p.y+29,34,node.amount/node.maxAmount,"#b879ff");
}

function drawTrackConnection(p,np,colors){
  const dx=np.x-p.x,dy=np.y-p.y,length=Math.hypot(dx,dy),nx=-dy/length,ny=dx/length;
  ctx.strokeStyle=colors.bed;ctx.lineWidth=15;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(np.x,np.y);ctx.stroke();
  ctx.strokeStyle=colors.ties;ctx.lineWidth=3;
  for(let t=.12;t<.9;t+=.16){const x=lerp(p.x,np.x,t),y=lerp(p.y,np.y,t);ctx.beginPath();ctx.moveTo(x-nx*7,y-ny*7);ctx.lineTo(x+nx*7,y+ny*7);ctx.stroke();}
  ctx.strokeStyle=colors.rails;ctx.lineWidth=2.6;
  for(const offset of [-4.5,4.5]){ctx.beginPath();ctx.moveTo(p.x+nx*offset,p.y+ny*offset);ctx.lineTo(np.x+nx*offset,np.y+ny*offset);ctx.stroke();}
}

function drawTrackNode(p,colors){
  ctx.fillStyle=colors.bed;ctx.beginPath();ctx.arc(p.x,p.y,7.5,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=colors.hub;ctx.beginPath();ctx.arc(p.x,p.y,3.2,0,Math.PI*2);ctx.fill();
}

function drawTracks(){
  const colors={bed:"#0a0d0f",ties:"#4b5559",rails:"#aeb9bc",hub:"#8f9b9f"};
  ctx.lineCap="round";
  for(const track of state.tracks.values()){
    const p=axialToWorld(track.q,track.r);
    for(const linkedKey of track.links){
      if(key(track.q,track.r)>linkedKey)continue;
      const n=fromKey(linkedKey),np=axialToWorld(n.q,n.r);
      drawTrackConnection(p,np,colors);
    }
  }
  for(const track of state.tracks.values()){
    const p=axialToWorld(track.q,track.r);
    drawTrackNode(p,colors);
    const focused=(state.selected?.type==="track"&&state.selected.id===key(track.q,track.r))||(state.hover?.q===track.q&&state.hover?.r===track.r&&!trainAt(track.q,track.r));
    if(focused)drawMiniBar(p.x-15,p.y-15,30,1,"#70bd77");
  }
}

function trackGlowPhase(now=performance.now()){return .5+.5*Math.sin(now/1000*5.5);}
function trackGlowAnimationActive(){return state.mode==="track";}

function drawBuildTrackGlow(now=performance.now()){
  if(state.mode!=="track")return;
  const pulse=trackGlowPhase(now),color="#b879ff";
  ctx.save();ctx.globalCompositeOperation="screen";ctx.lineCap="round";ctx.strokeStyle=color;ctx.fillStyle=color;ctx.globalAlpha=.22+pulse*.2;ctx.shadowColor=color;ctx.shadowBlur=12+pulse*12;
  for(const track of state.tracks.values()){
    const p=axialToWorld(track.q,track.r);
    for(const linkedKey of track.links){
      if(key(track.q,track.r)>linkedKey)continue;
      const neighbor=fromKey(linkedKey),np=axialToWorld(neighbor.q,neighbor.r);
      ctx.lineWidth=7+pulse*3;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(np.x,np.y);ctx.stroke();
    }
    ctx.beginPath();ctx.arc(p.x,p.y,8+pulse*2,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=.6+pulse*.3;ctx.shadowBlur=0;ctx.lineWidth=1.4;const markerRadius=8;
  for(const track of state.tracks.values()){
    const p=axialToWorld(track.q,track.r);ctx.beginPath();ctx.arc(p.x,p.y,markerRadius,0,Math.PI*2);ctx.stroke();
  }
  ctx.restore();
}

function activeScheduleStops(train){return (train.schedule||[]).map((stop,index)=>({stop,index})).filter(entry=>isScheduleTrackHex(entry.stop.q,entry.stop.r));}

function drawTrainStops(){
  for(const train of state.trains){
    const code=trainScheduleCode(train);
    activeScheduleStops(train).forEach(({stop,index})=>{
      const p=axialToWorld(stop.q,stop.r),label=`${code}${index+1}`;
      ctx.save();ctx.font="900 11px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";const width=Math.max(22,ctx.measureText(label).width+8);
      roundedRectPath(p.x-width/2,p.y+12,width,14,5);ctx.fillStyle="#3d8255";ctx.fill();
      ctx.fillStyle="#fff";ctx.fillText(label,p.x,p.y+19);ctx.restore();
    });
  }
}

function stopSupplyTargets(stop){
  return [state.base,...state.structures.values()].filter(target=>target.hp>0&&(
    (["base","turret","artillery","mine"].includes(target.type)&&(target.type==="base"?distanceToStructure(stop,target):hexDistance(stop,target))===1)||
    (target.type==="wall"&&hexDistance(stop,target)<=3)
  ));
}

function stopSupplyConnections(){
  const connections=[];
  for(const train of state.trains)for(const {stop} of activeScheduleStops(train))for(const target of stopSupplyTargets(stop))connections.push({stop,target});
  return connections;
}

function drawStopSupplyLines(){
  ctx.save();ctx.strokeStyle="rgba(112,189,119,.44)";ctx.lineWidth=2.2;ctx.lineCap="round";
  for(const {stop,target} of stopSupplyConnections()){
    const targetCell=target.type==="base"?nearestStructureCell(stop,target):target,start=axialToWorld(stop.q,stop.r),end=axialToWorld(targetCell.q,targetCell.r);
    ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.lineTo(end.x,end.y);ctx.stroke();
  }
  ctx.restore();
}

function drawGhosts(){
  for(const ghost of state.ghosts.values()){
    const p=axialToWorld(ghost.q,ghost.r),cells=structureFootprint(ghost),focused=(state.selected?.type==="ghost"&&state.selected.id===ghost.id)||cells.some(cell=>state.hover?.q===cell.q&&state.hover?.r===cell.r);
    ctx.save();ctx.globalAlpha=focused?.58:.42;ctx.strokeStyle="#899397";ctx.fillStyle="#343a3c";
    if(ghost.objectType==="track"){
      const colors={bed:"#252a2c",ties:"#697276",rails:"#a3adaf",hub:"#8b9598"};
      ctx.lineCap="round";
      for(const linkedKey of ghost.links||[]){const n=fromKey(linkedKey),np=axialToWorld(n.q,n.r);drawTrackConnection(p,np,colors);}
      drawTrackNode(p,colors);
    }else if(ghost.objectType==="turret"){
      ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,13,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle="#c2cbcd";
      ctx.font="900 10px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("T",p.x,p.y+.5);
    }else if(ghost.objectType==="wall"){
      ctx.lineWidth=2;ctx.strokeRect(p.x-17,p.y-13,34,26);ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(p.x-17,p.y-4);ctx.lineTo(p.x+17,p.y-4);ctx.moveTo(p.x-17,p.y+5);ctx.lineTo(p.x+17,p.y+5);ctx.moveTo(p.x-7,p.y-13);ctx.lineTo(p.x-7,p.y-4);ctx.moveTo(p.x+9,p.y-13);ctx.lineTo(p.x+9,p.y-4);ctx.moveTo(p.x-12,p.y-4);ctx.lineTo(p.x-12,p.y+5);ctx.moveTo(p.x+5,p.y-4);ctx.lineTo(p.x+5,p.y+5);ctx.moveTo(p.x-4,p.y+5);ctx.lineTo(p.x-4,p.y+13);ctx.moveTo(p.x+12,p.y+5);ctx.lineTo(p.x+12,p.y+13);ctx.stroke();
      ctx.fillStyle="#dce6e8";ctx.font="900 13px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("W",p.x,p.y+.5);
    }else if(ghost.objectType==="artillery"){
      hexPath(ghost.q,ghost.r,.58);ctx.lineWidth=2;ctx.stroke();ctx.fillStyle="#dce6e8";ctx.font="900 14px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("A",p.x,p.y+.5);
    }else if(ghost.objectType==="research"){
      for(const cell of cells){const point=axialToWorld(cell.q,cell.r);hexPath(cell.q,cell.r,.72);ctx.lineWidth=2;ctx.fill();ctx.stroke();ctx.fillStyle="#dce6e8";ctx.font="900 15px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("R",point.x,point.y+.5);}
    }else{
      ctx.lineWidth=2;ctx.strokeRect(p.x-15,p.y-15,30,30);ctx.beginPath();ctx.moveTo(p.x-8,p.y-15);ctx.lineTo(p.x,p.y-23);ctx.lineTo(p.x+8,p.y-15);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle="#dce6e8";ctx.font="900 11px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(ghost.resource==="energy"?"M:E":"M:C",p.x,p.y+.5);
    }
    for(const cell of cells){const point=axialToWorld(cell.q,cell.r);ctx.setLineDash([5,4]);ctx.strokeStyle="#899397";hexPath(cell.q,cell.r,.72);ctx.lineWidth=1;ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=focused?.82:.62;ctx.strokeStyle="#d77a7f";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(point.x-3,point.y+18);ctx.lineTo(point.x+3,point.y+24);ctx.moveTo(point.x+3,point.y+18);ctx.lineTo(point.x-3,point.y+24);ctx.stroke();}
    ctx.restore();
  }
}

function drawTurretRange(center,preview=false,range=TURRET_RANGE){
  ctx.save();ctx.fillStyle=preview?"rgba(230,185,74,.06)":"rgba(96,213,219,.055)";ctx.strokeStyle=preview?"rgba(230,185,74,.5)":"rgba(96,213,219,.34)";ctx.lineWidth=1.4;ctx.setLineDash([5,4]);
  for(let dq=-range;dq<=range;dq++){
    const r0=Math.max(-range,-dq-range),r1=Math.min(range,-dq+range);
    for(let dr=r0;dr<=r1;dr++){
      hexPath(center.q+dq,center.r+dr,.91);ctx.fill();
      if(hexDistance(center,{q:center.q+dq,r:center.r+dr})===range)ctx.stroke();
    }
  }
  ctx.setLineDash([]);ctx.restore();
}

function drawTurretRanges(){
  if(state.mode==="turret"&&state.hover)drawTurretRange(state.hover,true,turretRange());
  if(state.mode==="wall"&&state.hover)drawTurretRange(state.hover,true,5);
  if(state.mode==="artillery"&&state.hover)drawTurretRange(state.hover,true,artilleryRange());
  const selectedArtillery=state.mode==="select"&&state.selected?.type==="structure"?[...state.structures.values()].find(structure=>structure.id===state.selected.id&&structure.type==="artillery"):null;
  if(selectedArtillery)drawTurretRange(selectedArtillery,false,artilleryRange());
  const selectedCombat=state.selected?.type==="train"?state.trains.find(train=>train.id===state.selected.id&&train.trainType==="combat"):null;
  if(selectedCombat)drawTurretRange(worldToAxial(selectedCombat.x,selectedCombat.y),false,combatTrainRange());
  for(const turret of state.structures.values()){
    if(turret.type!=="turret")continue;
    const selected=state.mode==="select"&&state.selected?.type==="structure"&&state.selected.id===turret.id;
    if(!selected)continue;
    drawTurretRange(turret,false,turretRange());
  }
}

function drawBase(){
  const cells=structureFootprint(state.base),destroyed=state.gameOver||state.base.hp<=0;ctx.save();
  for(const cell of cells){
    const p=axialToWorld(cell.q,cell.r);
    if(destroyed){
      ctx.globalAlpha=.48;ctx.setLineDash([5,4]);hexPath(cell.q,cell.r,.78);ctx.fillStyle="#232a2d";ctx.fill();ctx.strokeStyle="#9aa6aa";ctx.lineWidth=2.2;ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle="#171c1f";ctx.fillRect(p.x-17,p.y-14,34,28);ctx.strokeStyle="#7e898d";ctx.lineWidth=1.5;ctx.strokeRect(p.x-17,p.y-14,34,28);
      ctx.fillStyle="#aeb8bb";ctx.font="900 22px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("B",p.x,p.y+1);
      ctx.strokeStyle="#c2cacc";ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(p.x-13,p.y-9);ctx.lineTo(p.x-5,p.y-2);ctx.lineTo(p.x-10,p.y+5);ctx.moveTo(p.x+13,p.y-8);ctx.lineTo(p.x+6,p.y-1);ctx.lineTo(p.x+11,p.y+7);ctx.stroke();
    }else{
      ctx.shadowBlur=18;ctx.shadowColor="rgba(230,185,74,.25)";hexPath(cell.q,cell.r,.78);ctx.fillStyle="#303438";ctx.fill();ctx.strokeStyle="#e6b94a";ctx.lineWidth=2.4;ctx.stroke();ctx.shadowBlur=0;
      ctx.fillStyle="#151a1d";ctx.fillRect(p.x-17,p.y-14,34,28);ctx.strokeStyle="#a68a47";ctx.strokeRect(p.x-17,p.y-14,34,28);ctx.fillStyle="#f4cf69";ctx.font="900 22px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("B",p.x,p.y+1);
    }
  }
  ctx.restore();
  const focused=state.selected?.type==="base"||cells.some(cell=>state.hover?.q===cell.q&&state.hover?.r===cell.r);
  if(!destroyed&&focused){const top=cells.map(cell=>axialToWorld(cell.q,cell.r)).sort((a,b)=>a.y-b.y)[0],center=structureWorldCenter(state.base);drawMiniBar(center.x-18,top.y-25,36,state.base.hp/state.base.maxHp,state.base.hp<20?"#e34747":"#70bd77");}
}

function drawHives(){
  for(const hive of state.hives.values()){
    const p=axialToWorld(hive.q,hive.r),pulse=.5+.5*Math.sin(state.elapsed*3+hive.q-hive.r);
    ctx.save();
    if((hive.productionPulseUntil||0)>state.elapsed){const strength=clamp((hive.productionPulseUntil-state.elapsed)/.75,0,1);ctx.globalAlpha=.28+strength*.72;ctx.shadowBlur=24+strength*22;ctx.shadowColor="#ff263d";hexPath(hive.q,hive.r,.7+(1-strength)*.18);ctx.strokeStyle="#ff4054";ctx.lineWidth=2.5+strength*2;ctx.stroke();ctx.globalAlpha=1;ctx.shadowBlur=0;}
    ctx.shadowBlur=14+pulse*7;ctx.shadowColor="#a71932";hexPath(hive.q,hive.r,.62);ctx.fillStyle="#481522";ctx.fill();ctx.strokeStyle="#d33a51";ctx.lineWidth=2.2;ctx.stroke();ctx.shadowBlur=0;
    ctx.fillStyle="#ff8793";ctx.font="900 20px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("H",p.x,p.y-4);
    ctx.fillStyle="#f4a7b0";ctx.font="900 9px ui-monospace, monospace";ctx.fillText(String(hive.level),p.x,p.y+11);ctx.restore();
    const focused=(state.selected?.type==="hive"&&state.selected.id===hive.id)||(state.hover?.q===hive.q&&state.hover?.r===hive.r);
    if(focused)drawMiniBar(p.x-17,p.y-25,34,hive.hp/hive.maxHp,hive.hp<=2?"#e34747":"#70bd77");
  }
}

function drawStructures(){
  for(const s of state.structures.values()){
    const p=axialToWorld(s.q,s.r);ctx.save();
    if(s.type==="turret"){
      if(s.energy<=s.maxEnergy*.2){const pulse=.5+.5*Math.sin(state.elapsed*6);ctx.shadowBlur=20+pulse*12;ctx.shadowColor="#ff3848";ctx.strokeStyle=`rgba(255,56,72,${.65+pulse*.35})`;ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.x,p.y,18+pulse*2,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;}
      ctx.shadowBlur=s.energy>=1?12:0;ctx.shadowColor="#b879ff";ctx.fillStyle="#26353a";ctx.strokeStyle="#b879ff";ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,13,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle="#f3f7f8";ctx.font="900 10px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("T",p.x,p.y+.5);
    }else if(s.type==="artillery"){
      if(s.energy<ARTILLERY_SHOT_ENERGY){const pulse=.5+.5*Math.sin(state.elapsed*6);ctx.shadowBlur=18+pulse*10;ctx.shadowColor="#ff3848";}
      hexPath(s.q,s.r,.58);ctx.fillStyle="#4b3028";ctx.strokeStyle="#ef9b54";ctx.lineWidth=2.3;ctx.fill();ctx.stroke();ctx.shadowBlur=0;
      ctx.fillStyle="#fff4ea";ctx.font="900 15px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("A",p.x,p.y+.5);
    }else if(s.type==="wall"){
      hexPath(s.q,s.r,.9);ctx.fillStyle="#51585a";ctx.strokeStyle="#8b9294";ctx.lineWidth=2;ctx.fill();ctx.stroke();
      ctx.strokeStyle="#373e41";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(p.x-21,p.y-9);ctx.lineTo(p.x+21,p.y-9);ctx.moveTo(p.x-21,p.y+9);ctx.lineTo(p.x+21,p.y+9);ctx.moveTo(p.x-8,p.y-20);ctx.lineTo(p.x-8,p.y-9);ctx.moveTo(p.x+10,p.y-20);ctx.lineTo(p.x+10,p.y-9);ctx.moveTo(p.x-14,p.y-9);ctx.lineTo(p.x-14,p.y+9);ctx.moveTo(p.x+5,p.y-9);ctx.lineTo(p.x+5,p.y+9);ctx.moveTo(p.x-7,p.y+9);ctx.lineTo(p.x-7,p.y+20);ctx.moveTo(p.x+12,p.y+9);ctx.lineTo(p.x+12,p.y+20);ctx.stroke();
      ctx.fillStyle="#f3f7f8";ctx.font="900 14px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("W",p.x,p.y+.5);
    }else if(s.type==="research"){
      for(const cell of structureFootprint(s)){const point=axialToWorld(cell.q,cell.r);ctx.shadowBlur=12;ctx.shadowColor="rgba(184,121,255,.35)";hexPath(cell.q,cell.r,.74);ctx.fillStyle="#29233a";ctx.strokeStyle="#b879ff";ctx.lineWidth=2.3;ctx.fill();ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle="#f5efff";ctx.font="900 16px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("R",point.x,point.y+.5);}
    }else{
      const exhausted=resourceNodeAt(s.q,s.r).amount<=0;
      ctx.fillStyle=exhausted?"#34393c":"#273239";ctx.strokeStyle=exhausted?"#70787c":s.resource==="energy"?"#60d5db":"#e6b94a";ctx.lineWidth=2;ctx.beginPath();ctx.rect(p.x-15,p.y-15,30,30);ctx.fill();ctx.stroke();ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.moveTo(p.x-8,p.y-15);ctx.lineTo(p.x,p.y-23);ctx.lineTo(p.x+8,p.y-15);ctx.closePath();ctx.fill();
      ctx.fillStyle=exhausted?"#a2aaad":"#f3f7f8";ctx.font="900 11px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(s.resource==="energy"?"M:E":"M:C",p.x,p.y+.5);
    }
    const focused=(state.selected?.type==="structure"&&state.selected.id===s.id)||structureFootprint(s).some(cell=>state.hover?.q===cell.q&&state.hover?.r===cell.r);
    if(focused){
      drawMiniBar(p.x-17,p.y-25,34,s.hp/s.maxHp,s.hp<5?"#e34747":"#70bd77");
      if(s.type==="turret"||s.type==="artillery")drawMiniBar(p.x-17,p.y+22,34,s.energy/s.maxEnergy,"#60d5db");
    }
    ctx.restore();
  }
}

function drawMiniBar(x,y,w,ratio,color){ctx.fillStyle="rgba(52,67,73,.9)";ctx.fillRect(x,y,w,3);ctx.fillStyle=color;ctx.fillRect(x,y,w*clamp(ratio,0,1),3);}

function roundedRectPath(x,y,w,h,r){
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
}

function worldMessagePriority(message){
  const activity=activityText(message);
  if(activity.startsWith("Rebuilt "))return 0;
  if(activity.startsWith("Repaired ")||activity.startsWith("Partially Repaired: "))return 1;
  if(activity==="Mined Construction Material")return 2;
  if(activity==="Mined Energy")return 3;
  if(activity.startsWith("Mined "))return 4;
  if(activity.startsWith("Supplied "))return 5;
  if(activity.startsWith("Unloaded "))return 6;
  return 7;
}

function worldMessageLayout(){
  const pending=state.worldMessages.filter(item=>item.until>state.elapsed),clusters=[];
  while(pending.length){
    const cluster=[pending.shift()];
    for(let changed=true;changed;){
      changed=false;
      for(let i=pending.length-1;i>=0;i--)if(cluster.some(item=>hexDistance(item,pending[i])<=5)){
        cluster.push(pending.splice(i,1)[0]);changed=true;
      }
    }
    clusters.push(cluster);
  }
  const layout=[],height=20,gap=4;
  ctx.save();ctx.font="700 11px ui-monospace, monospace";
  for(const cluster of clusters){
    cluster.sort((a,b)=>worldMessagePriority(a.message)-worldMessagePriority(b.message)||a.message.localeCompare(b.message)||a.targetKey.localeCompare(b.targetKey));
    const points=cluster.map(item=>({item,p:axialToWorld(item.q,item.r)}));
    const centerX=points.reduce((sum,entry)=>sum+entry.p.x,0)/points.length;
    const bottom=Math.min(...points.map(entry=>entry.p.y-(entry.item.targetType==="track"?23:35)))-6;
    const top=bottom-(cluster.length*height+(cluster.length-1)*gap);
    cluster.forEach((item,index)=>{
      const width=Math.ceil(ctx.measureText(item.message).width)+18,y=top+index*(height+gap);
      layout.push({item,x:centerX-width/2,y,width,height,textX:centerX,textY:y+height/2+.5});
    });
  }
  ctx.restore();return layout;
}

function drawWorldMessages(){
  for(const entry of worldMessageLayout()){
    const {item,x,y,width,height,textX,textY}=entry;
    ctx.save();ctx.font="700 11px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";
    roundedRectPath(x,y,width,height,10);ctx.fillStyle="rgba(8,13,16,.92)";ctx.fill();ctx.strokeStyle="#70bd77";ctx.lineWidth=1;ctx.stroke();
    ctx.fillStyle="#f3f7f8";ctx.fillText(item.message,textX,textY);ctx.restore();
  }
}

function drawTrains(){
  for(const train of state.trains){
    const segments=trainSegments(train);
    const focused=state.selected?.id===train.id||(state.hover&&segments.some(segment=>segment.q===state.hover.q&&segment.r===state.hover.r));
    train.wagons.forEach(wagon=>{
      ctx.save();ctx.translate(wagon.x,wagon.y);ctx.rotate(wagon.heading||0);
      if(state.selected?.id===train.id)drawTrainSelectionRing();
      ctx.fillStyle=trainCarColor(wagon.type,wagon.colorShade);
      ctx.strokeStyle=wagon.type==="energy"?"#83edf2":"#f2cb69";
      ctx.lineWidth=2;ctx.fillRect(-14,-9,28,18);ctx.strokeRect(-14,-9,28,18);
      ctx.restore();
      ctx.save();ctx.fillStyle="#f3f7f8";ctx.font="800 13px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("S",wagon.x,wagon.y+.5);ctx.restore();
      if(focused)drawMiniBar(wagon.x-14,wagon.y-17,28,wagon.hp/wagon.maxHp,wagon.hp<5?"#e34747":"#70bd77");
    });
    const combatLocomotive=train.trainType==="combat";ctx.save();ctx.translate(train.x,train.y);ctx.rotate(train.heading);if(state.selected?.id===train.id)drawTrainSelectionRing();ctx.shadowBlur=12;ctx.shadowColor=combatLocomotive?"#b879ff":"#e34747";ctx.fillStyle=trainCarColor(combatLocomotive?"combat":"builder",train.colorShade);ctx.strokeStyle=combatLocomotive?"#d6a4ff":"#ff8790";ctx.lineWidth=2;ctx.fillRect(-14,-9,28,18);ctx.strokeRect(-14,-9,28,18);ctx.beginPath();ctx.moveTo(14,-7);ctx.lineTo(22,0);ctx.lineTo(14,7);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
    ctx.save();ctx.fillStyle="#fff4f4";ctx.font="900 13px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("L",train.x,train.y+.5);ctx.restore();
    drawTrainCarBadges(train);
    if(focused){drawMiniBar(train.x-16,train.y-17,32,train.hp/train.maxHp,train.hp<5?"#e34747":"#70bd77");drawMiniBar(train.x-16,train.y+18,32,train.fuel/train.maxFuel,"#60d5db");}
  }
}

function drawTrainCarBadges(train){
  const segments=trainSegments(train),label=trainScheduleCode(train);
  segments.forEach((segment,index)=>{
    const next=segments[index+1],previous=segments[index-1];
    let dx,dy;
    if(next){dx=next.x-segment.x;dy=next.y-segment.y;}
    else if(previous){dx=segment.x-previous.x;dy=segment.y-previous.y;}
    else {dx=-Math.cos(train.heading);dy=-Math.sin(train.heading);}
    const distance=Math.hypot(dx,dy)||1,x=segment.x+dx/distance*24,y=segment.y+dy/distance*24;
    ctx.save();ctx.fillStyle="#3d8255";ctx.strokeStyle="#fff";ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle="#fff";ctx.font="900 10px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(label,x,y+.5);ctx.restore();
  });
}

function drawTrainSelectionRing(){ctx.strokeStyle="#fff1b4";ctx.lineWidth=1.5;ctx.setLineDash([4,3]);ctx.beginPath();ctx.arc(0,0,24,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}

function drawEnemies(){
  for(const e of state.enemies){ctx.save();ctx.translate(e.x,e.y);const pulse=(1+Math.sin(e.phase)*.08)*CREEP_RENDER_SCALE;ctx.scale(pulse,pulse);ctx.shadowBlur=13;ctx.shadowColor="#c51f31";ctx.fillStyle="#b92838";ctx.beginPath();for(let i=0;i<9;i++){const a=i/9*Math.PI*2,rr=9+Math.sin(e.phase+i*2.1)*2.6;const x=Math.cos(a)*rr,y=Math.sin(a)*rr;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();ctx.fill();ctx.shadowBlur=0;ctx.fillStyle="#f0646e";ctx.globalAlpha=.65;ctx.beginPath();ctx.arc(-2,-2,3,0,Math.PI*2);ctx.fill();ctx.restore();}
}

function drawEffects(){
  for(const p of state.projectiles){
    if(p.kind==="artillery-shell"){
      const progress=clamp(1-p.life/p.maxLife,0,1),x=lerp(p.x1,p.x2,progress),groundY=lerp(p.y1,p.y2,progress),y=groundY-Math.sin(progress*Math.PI)*52;
      ctx.save();ctx.globalAlpha=.25+.75*Math.sin(Math.min(1,progress+.15)*Math.PI/2);ctx.shadowBlur=12;ctx.shadowColor="#ff8d3d";ctx.fillStyle="#ffd2a6";ctx.beginPath();ctx.arc(x,y,4.5,0,Math.PI*2);ctx.fill();ctx.restore();
      continue;
    }
    if(p.kind==="artillery-blast"){
      const strength=clamp(p.life/p.maxLife,0,1),center={q:p.q,r:p.r},cells=[];
      for(let q=p.q-2;q<=p.q+2;q++)for(let r=p.r-2;r<=p.r+2;r++){const cell={q,r};if(hexDistance(center,cell)<=2)cells.push(cell);}
      const ringColors=[{fill:"rgba(255,118,48,.18)",stroke:"#ff9d58"},{fill:"rgba(184,79,34,.17)",stroke:"#b84f22"},{fill:"rgba(105,42,25,.16)",stroke:"#692a19"}];
      ctx.save();ctx.globalAlpha=strength;ctx.lineWidth=2.5;
      for(const cell of cells){const colors=ringColors[hexDistance(center,cell)];ctx.fillStyle=colors.fill;ctx.strokeStyle=colors.stroke;hexPath(cell.q,cell.r,.88);ctx.fill();ctx.stroke();}
      ctx.restore();continue;
    }
    ctx.globalAlpha=p.life/p.maxLife;ctx.strokeStyle=p.color||"#bafcff";ctx.lineWidth=p.width||2;ctx.beginPath();ctx.moveTo(p.x1,p.y1);ctx.lineTo(p.x2,p.y2);ctx.stroke();ctx.fillStyle=p.impactColor||"#fff";ctx.beginPath();ctx.arc(p.x2,p.y2,p.impactRadius||3,0,Math.PI*2);ctx.fill();
  }
  for(const p of state.particles){ctx.globalAlpha=clamp(p.life/p.maxLife,0,1);ctx.fillStyle=p.color;ctx.fillRect(p.x-1.5,p.y-1.5,3,3);}ctx.globalAlpha=1;
}

function drawHover(){
  if(state.mode==="deploy"&&state.deploymentHead){
    for(const reservedKey of state.deploymentReserved){const position=fromKey(reservedKey);hexPath(position.q,position.r,.82);ctx.fillStyle="rgba(230,185,74,.11)";ctx.fill();ctx.strokeStyle="rgba(230,185,74,.58)";ctx.lineWidth=1.5;ctx.stroke();}
    hexPath(state.deploymentHead.q,state.deploymentHead.r,.68);ctx.strokeStyle="#fff1b4";ctx.lineWidth=3;ctx.stroke();
    for(const path of state.deploymentPaths){const tail=path[path.length-1];hexPath(tail.q,tail.r,.58);ctx.strokeStyle="#60d5db";ctx.lineWidth=3;ctx.stroke();}
  }
  if(!state.hover)return;const {q,r}=state.hover;
  if(state.mode==="research")for(const cell of researchPreviewFootprint(q,r)){hexPath(cell.q,cell.r,.86);ctx.fillStyle="rgba(184,121,255,.10)";ctx.fill();ctx.strokeStyle="rgba(184,121,255,.72)";ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.stroke();ctx.setLineDash([]);}
  hexPath(q,r,.9);let color="#aebabe";if(state.mode==="track"||state.mode==="turret"||state.mode==="mine"||state.mode==="wall"||state.mode==="artillery"||state.mode==="research"||state.mode==="deploy"||state.mode==="schedule")color="#e6b94a";if(state.mode==="salvage"||state.mode==="debug-destroy")color="#e34747";ctx.strokeStyle=color;ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.stroke();ctx.setLineDash([]);
  if(state.mode==="track"&&state.trackStart){hexPath(state.trackStart.q,state.trackStart.r,.78);ctx.strokeStyle="#fff1b4";ctx.lineWidth=3;ctx.stroke();if(hexDistance(state.trackStart,{q,r})===1){const a=axialToWorld(state.trackStart.q,state.trackStart.r),b=axialToWorld(q,r);ctx.strokeStyle="rgba(230,185,74,.45)";ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}}
}

function drawSelection(){
  const selected=getSelected();if(!selected||selected.wagons)return;ctx.strokeStyle="#fff1b4";ctx.lineWidth=1.6;ctx.setLineDash([5,3]);
  for(const cell of structureFootprint(selected)){const p=axialToWorld(cell.q,cell.r);ctx.beginPath();ctx.arc(p.x,p.y,23,0,Math.PI*2);ctx.stroke();}
  ctx.setLineDash([]);
}

function screenShakeOffset(){
  const remaining=state.screenShakeUntilWallTime?(state.screenShakeUntilWallTime-Date.now())/1000:state.screenShakeUntil-state.elapsed;
  if(remaining<=0)return {x:0,y:0};
  const strength=clamp(remaining/TRAIN_LOSS_SHAKE_SECONDS,0,1);
  const phase=Date.now()/1000;
  return {x:Math.sin(phase*137+1.3)*7*strength,y:Math.cos(phase*163+.4)*5*strength};
}

function screenShakeActive(){return state.screenShakeUntilWallTime?state.screenShakeUntilWallTime>Date.now():state.screenShakeUntil>state.elapsed;}

function render(){
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ensureTerrainLayer();const shake=screenShakeOffset();ctx.save();ctx.translate(shake.x,shake.y);ctx.drawImage(terrainLayer,0,0,terrainLayer.width,terrainLayer.height,0,0,width,height);ctx.save();ctx.translate(width/2,height/2);ctx.scale(state.camera.zoom,state.camera.zoom);ctx.translate(-state.camera.x,-state.camera.y);
  drawStopSupplyLines();drawResourceNodes();drawTurretRanges();drawTracks();drawGhosts();drawTrainStops();drawEffects();drawHives();drawBase();drawStructures();drawSelection();drawTrains();drawBuildTrackGlow();drawEnemies();drawHover();drawWorldMessages();ctx.restore();ctx.restore();
}
