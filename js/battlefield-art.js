"use strict";

// Small, deterministic Canvas2D sprites. All texture, facets and soft shadows are
// rasterized once; moving units only submit an image plus their existing labels.
const battlefieldSprites=new Map();
function battlefieldSprite(name,paint,size=72){
  let sprite=battlefieldSprites.get(name);if(sprite)return sprite;
  sprite=document.createElement("canvas");sprite.width=sprite.height=size*3;
  const c=sprite.getContext("2d");c.scale(3,3);c.translate(size/2,size/2);paint(c);
  battlefieldSprites.set(name,sprite);return sprite;
}
function artPolygon(c,points,color){c.fillStyle=color;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();}
function artLine(c,points,color,width=1){c.strokeStyle=color;c.lineWidth=width;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();}
function artDisc(c,x,y,r,color){c.fillStyle=color;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();}
function terrainSprite(type,variant,shade,detail=0){
  return battlefieldSprite(`terrain:${type}:${variant}:${shade}:${detail}`,c=>{
    const palettes={water:["#153844","#102a36"],trees:["#26372b","#1b2b24"],rock:["#333b3c","#252d30"],land:["#2b302b","#222727"],resource:["#2b302b","#222727"]};
    const colors=palettes[type]||palettes.land,g=c.createLinearGradient(-20,-28,20,28);
    g.addColorStop(0,colors[shade?0:1]);g.addColorStop(1,colors[1]);
    artPolygon(c,HEX_CORNERS.map(p=>[p.x*HEX*.975,p.y*HEX*.975]),g);
    c.strokeStyle="rgba(145,164,153,.12)";c.lineWidth=.7;c.stroke();
    // Reproducible flecks and strata keep the map still while zooming.
    for(let i=0;i<19;i++){
      const x=(hash(i,variant+detail*7,shade+71)-.5)*43,y=(hash(variant+detail,i,91)-.5)*42;
      c.fillStyle=type==="water"?"rgba(100,194,192,.08)":i%3?"rgba(153,164,122,.13)":"rgba(8,18,19,.25)";
      c.fillRect(x,y,i%4===0?3:1.2,.8);
    }
    if(type==="water"){
      for(let i=0;i<5;i++){
        const y=-16+i*7+detail*.7,x=-18+(i%2)*5-detail;
        c.beginPath();c.moveTo(x,y);c.bezierCurveTo(x+7,y-3,x+13,y+3,x+24,y);
        c.strokeStyle=i%2?"rgba(82,168,180,.26)":"rgba(117,207,208,.42)";c.lineWidth=i===2?1.4:.8;c.stroke();
      }
      artLine(c,[[-18,17],[-10,18],[-5,17]],"#356774",.7);
    }else if(type==="trees"){
      const layouts={1:[[-8,5,.85],[9,-3,1.1],[13,14,.55]],2:[[-12,6,.8],[5,-5,1.08],[12,13,.7]],3:[[-13,5,.8],[11,9,.9],[0,-6,1.1]]};
      for(const [x,y,s] of layouts[variant]||layouts[3]){
        c.save();c.translate(x+detail-1.5,y);c.scale(s,s);
        artPolygon(c,[[-9,7],[0,15],[15,12],[8,4]],"rgba(5,15,16,.45)");
        c.fillStyle="#665039";c.fillRect(-1.4,1,2.8,12);
        if(detail===2){
          // A second canopy species gives groves soft crowns among the firs.
          for(const [cx,cy,rad] of [[0,-8,10],[-5,-5,6],[5,-7,6],[0,-15,6]]){
            artDisc(c,cx,cy,rad,"#28563f");artDisc(c,cx-1.8,cy-2,rad*.75,"#467950");artDisc(c,cx-2.5,cy-3,rad*.4,"#72925c");
            artLine(c,[[cx-3,cy],[cx,cy-1],[cx+2,cy-4]],"rgba(165,190,124,.35)",.7);
          }
        }else for(let tier=0;tier<3;tier++){
          const top=-22+tier*9,w=7+tier*2.2,bottom=top+17;
          artPolygon(c,[[0,top],[-w,bottom-2],[-w+3,bottom-3],[-w-1,bottom+1],[w,bottom],[w-2,bottom-4]],tier===0?"#427f60":tier===1?"#356d51":"#29563f");
          artPolygon(c,[[0,top],[-w,bottom-2],[-2,bottom-3]],tier===0?"#6ca078":"#4b8961");
          artLine(c,[[-w+3,bottom-3],[-2,bottom-5]],"rgba(163,185,121,.35)",.7);
        }
        c.restore();
      }
      for(const [x,y] of [[-19,17],[18,-13],[6,23]]){artLine(c,[[x-2,y],[x,y-4],[x+1,y],[x+4,y-3]],"#648455",.8);}
    }else if(type==="rock"){
      for(const [x,y,s] of variant===1?[[0,3,1],[-15,13,.42]]:[[-10,6,.8],[10,1,.93],[16,15,.4]]){
        c.save();c.translate(x+(detail-1)*2,y+detail);c.scale(s*(.88+detail*.07),s*(1.05-detail*.06));
        artPolygon(c,[[-19,13],[-5,-20],[4,-24],[20,12],[9,18]],"#293338");
        artPolygon(c,[[-19,13],[-5,-20],[0,-7],[-4,13]],"#71807c");
        artPolygon(c,[[-5,-20],[4,-24],[20,12],[6,7],[0,-7]],"#4b5c60");
        artPolygon(c,[[4,-24],[7,-11],[2,-14],[0,-7],[-5,-20]],"#a2aea2");
        artLine(c,[[0,-7],[3,-2],[-2,6],[0,12]],"#384747",1.3);
        artLine(c,[[7,-10],[10,-2],[8,1],[14,10]],"#627478",.8);
        c.restore();
      }
    }else{
      // Low moss and fine grasses are visually distinct from impassable forest.
      for(let i=0;i<3+variant;i++){
        const x=(hash(i,variant+detail*3,13)-.5)*38,y=(hash(i,shade+detail,49)-.5)*38;
        artLine(c,[[x-2,y+2],[x,y-2],[x+1,y+2],[x+3,y]],shade?"#454f3b":"#374438",.7);
      }
      if(variant===3){artPolygon(c,[[-17,13],[-13,10],[-8,13],[-10,15]],"#505953");artLine(c,[[-16,12],[-13,10],[-9,12]],"#697369",.8);}
    }
  });
}

let terrainAtlas=null;
function terrainAtlasTile(type,variant,shade){
  if(!terrainAtlas){
    const canvas=document.createElement("canvas"),tile=216,types=["land","water","trees","rock","resource"];
    canvas.width=tile*6;canvas.height=tile*types.length;
    const c=canvas.getContext("2d");
    for(let row=0;row<types.length;row++)for(let v=1;v<=3;v++)for(let s=0;s<2;s++){
      const detail=v-1;c.drawImage(terrainSprite(types[row],v,s,detail),((v-1)*2+s)*tile,row*tile);
      // The packed atlas owns the pixels now; do not retain a second copy per tile.
      battlefieldSprites.delete(`terrain:${types[row]}:${v}:${s}:${detail}`);
    }
    terrainAtlas={canvas,rows:Object.fromEntries(types.map((type,row)=>[type,row])),tile};
  }
  return {canvas:terrainAtlas.canvas,x:((variant-1)*2+shade)*216,y:(terrainAtlas.rows[type]||0)*216};
}

function unitSprite(kind,variant=0){
  return battlefieldSprite(`unit:${kind}:${variant}`,c=>{
    const blue=kind==="neutralizer",dark=blue?"#175076":"#641e34",mid=blue?"#258fc9":"#b92838",light=blue?"#8fd9ff":"#f0646e";
    // Baked halo, shared by every unit, including large battles.
    const glow=c.createRadialGradient(0,0,4,0,0,19);glow.addColorStop(0,blue?"rgba(25,136,214,.3)":"rgba(209,29,55,.3)");glow.addColorStop(1,"rgba(0,0,0,0)");artDisc(c,0,0,19,glow);
    for(let i=0;i<6;i++){
      const a=i*Math.PI/3+variant*.17,x=Math.cos(a),y=Math.sin(a);
      artLine(c,[[x*6,y*6],[x*12-y*2,y*12+x*2],[x*15-y*4,y*15+x*4]],dark,2.2);
      artDisc(c,x*11,y*11,1.1,light);
    }
    const points=Array.from({length:9},(_,i)=>{const a=i/9*Math.PI*2,r=9+Math.sin(variant+i*2.1)*2;return [Math.cos(a)*r,Math.sin(a)*r];});
    artPolygon(c,points,dark);c.strokeStyle=mid;c.lineWidth=1.2;c.stroke();
    for(let i=0;i<6;i++){const a=i*Math.PI/3;artPolygon(c,[[0,-1],[Math.cos(a)*8,Math.sin(a)*8],[Math.cos(a+.7)*8,Math.sin(a+.7)*8]],i%2?mid:dark);}
    if(blue)artPolygon(c,[[-2,-6],[3.5,3.5],[-7.5,3.5]],light);
    else{artDisc(c,-2,-2,3,light);artDisc(c,-2.6,-3,1.1,"#ffe0ad");artDisc(c,4,3,1.2,"#f39d72");}
  },44);
}

function trainSprite(family,shade){
  return battlefieldSprite(`train:${family}:${shade}`,c=>{
    const locomotive=family==="builder"||family==="combat",edge=family==="energy"?"#83edf2":family==="material"?"#f2cb69":family==="combat"?"#ffba75":"#ff8790";
    c.fillStyle="rgba(3,10,13,.55)";c.fillRect(-17,-7,37,20);
    for(const x of [-10,8]){c.fillStyle="#0e161b";c.fillRect(x-3,-12,6,24);c.fillStyle="#778184";c.fillRect(x-2,-12,4,2);c.fillRect(x-2,10,4,2);}
    c.fillStyle=trainCarColor(family,shade);c.fillRect(-14,-9,28,18);c.strokeStyle=edge;c.lineWidth=1.3;c.strokeRect(-14,-9,28,18);
    c.fillStyle="rgba(255,241,215,.18)";c.fillRect(-13,-8,26,2);c.fillStyle="rgba(5,12,18,.4)";c.fillRect(-13,6,26,2);
    if(locomotive){
      artPolygon(c,[[14,-7],[22,0],[14,7]],trainCarColor(family,shade));artLine(c,[[14,-7],[22,0],[14,7]],edge,1.2);
      artPolygon(c,[[8,-6],[13,-5],[13,5],[8,6]],"#152c36");artLine(c,[[9,-5],[12,-4],[12,3]],"#93bcc2",.8);
      for(let i=0;i<4;i++){c.fillStyle="#222e33";c.fillRect(-11+i*2,-6,1,12);}
      artDisc(c,17,-4,1.3,"#fff3bd");artDisc(c,17,4,1.3,"#fff3bd");
    }else if(family==="energy"){
      for(const x of [-9,7]){c.fillStyle="#173d47";c.fillRect(x-2,-6,4,12);artLine(c,[[x-1,-5],[x-1,5]],"#a9f1e8",1.2);}
    }else{
      for(const x of [-10,7]){artPolygon(c,[[x-2,-5],[x+2,-6],[x+4,-1],[x+2,5],[x-3,4]],"#b29c68");artLine(c,[[x-2,-5],[x+2,-6],[x+3,-2]],"#e0cc95",.8);}
    }
    // A quiet inset keeps the live L/S marker legible at every orientation.
    c.fillStyle="rgba(12,21,25,.72)";c.fillRect(-5.5,-7,11,14);
    for(const x of [-12,12])for(const y of [-7,7])artDisc(c,x,y,.65,"#e4d1b0");
  },64);
}

function depositSprite(type,exhausted){
  return battlefieldSprite(`deposit:${type}:${exhausted}`,c=>{
    const color=exhausted?"#697276":type==="energy"?"#568f92":"#a28d5e";
    const glow=c.createRadialGradient(0,0,16,0,0,31);glow.addColorStop(0,exhausted?"rgba(0,0,0,0)":type==="energy"?"rgba(72,168,180,.2)":"rgba(189,153,78,.2)");glow.addColorStop(1,"rgba(0,0,0,0)");artDisc(c,0,0,31,glow);
    for(let i=0;i<6;i++){
      const a=i*Math.PI/3,x=Math.cos(a)*17,y=Math.sin(a)*17;
      artPolygon(c,[[x-3,y+3],[x-2,y-4],[x+1,y-6],[x+4,y+1],[x+2,y+4]],exhausted?"#3b4447":type==="energy"?"#337483":"#796545");
      artLine(c,[[x-2,y-4],[x+1,y-6],[x+2,y]],exhausted?"#778180":type==="energy"?"#9bddd3":"#dbc18a",.8);
    }
    artDisc(c,0,0,13,"rgba(18,26,29,.8)");c.strokeStyle=color;c.lineWidth=2;c.beginPath();c.arc(0,0,20,0,Math.PI*2);c.stroke();
  });
}

function hiveSprite(variant){
  return battlefieldSprite(`hive:${variant}`,c=>{
    const glow=c.createRadialGradient(0,0,10,0,0,33);glow.addColorStop(0,"rgba(182,26,59,.38)");glow.addColorStop(1,"rgba(0,0,0,0)");artDisc(c,0,0,33,glow);
    artPolygon(c,HEX_CORNERS.map(p=>[p.x*22.32,p.y*22.32]),"#481522");c.strokeStyle="#d33a51";c.lineWidth=2.2;c.stroke();
    for(let i=0;i<6;i++){
      const a=(i+.5)*Math.PI/3,x=Math.cos(a),y=Math.sin(a);
      artPolygon(c,[[x*11-y*3,y*11+x*3],[x*20-y*4,y*20+x*4],[x*23,y*23],[x*15+y*2,y*15-x*2]],i%2?"#7f293f":"#a34151");
      artLine(c,[[x*13,y*13],[x*19,y*19]],"#de7475",.8);
    }
    artDisc(c,0,-2,12,"#301722");
  });
}

function drawDetailedMapGlyph(label,x,y){
  // Machinery lives around the original, unobstructed icon and footprint.
  ctx.save();ctx.strokeStyle="rgba(189,204,192,.4)";ctx.lineWidth=.8;
  for(const side of [-1,1]){
    const px=x+side*13;ctx.fillStyle="rgba(9,19,23,.45)";ctx.fillRect(px-2,y-9,4,17);
    for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(px-1.5,y-6+i*4);ctx.lineTo(px+1.5,y-6+i*4);ctx.stroke();}
    ctx.fillStyle="#96a49a";ctx.fillRect(px-1,y+11,2,2);
  }
  ctx.strokeStyle="rgba(217,229,211,.25)";ctx.beginPath();ctx.moveTo(x-8,y-15);ctx.lineTo(x+7,y-15);ctx.stroke();ctx.restore();
  drawMapGlyph(label,x,y);
}
