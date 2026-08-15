(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const worldWrap = document.getElementById("worldWrap");
  const selectionContent = document.getElementById("selectionContent");
  const HEX = 31;
  const SQRT3 = Math.sqrt(3);
  const NODE_CAPACITY = 1000;
  const DIRECTIONS = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
  const COSTS = {
    trackPack: { material: 10, energy: 4 },
    train: { material: 40, energy: 20 },
    turret: { material: 6, energy: 6 },
    mine: { material: 8, energy: 4 }
  };

  const ui = Object.fromEntries([
    "sectorLabel", "waveNumber", "waveTimer", "threatFill",
    "waveToggle", "soundToggle",
    "hoverStatus", "hoverTitle", "hoverDetail", "gameOver", "survivalTime", "restartButton", "toastStack"
  ].map(id => [id, document.getElementById(id)]));

  const key = (q, r) => `${q},${r}`;
  const fromKey = value => { const [q,r]=value.split(",").map(Number); return {q,r}; };
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const hexDistance = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
  const neighbors = (q, r) => DIRECTIONS.map(([dq, dr]) => ({ q: q + dq, r: r + dr }));

  function trainName(index) {
    let value=index,label="";
    do { label=String.fromCharCode(65+(value%26))+label; value=Math.floor(value/26)-1; } while(value>=0);
    return `Train ${label}`;
  }

  function axialToWorld(q, r) {
    return { x: HEX * SQRT3 * (q + r / 2), y: HEX * 1.5 * r };
  }

  function worldToAxial(x, y) {
    const q = (SQRT3 / 3 * x - y / 3) / HEX;
    const r = (2 / 3 * y) / HEX;
    return cubeRound(q, r);
  }

  function cubeRound(q, r) {
    let x = q, z = r, y = -x - z;
    let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy > dz) ry = -rx - rz;
    else rz = -rx - ry;
    return { q: rx, r: rz };
  }

  function hash(q, r, salt = 0) {
    let n = Math.imul(q, 374761393) + Math.imul(r, 668265263) + Math.imul(salt, 1442695041);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }

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

  const guaranteedNodes = new Map([
    [key(7, -2), "material"],
    [key(-4, 7), "energy"],
    [key(13, 3), "energy"],
    [key(-12, -4), "material"]
  ]);

  function terrainAt(q, r) {
    const guaranteed = guaranteedNodes.get(key(q, r));
    if (guaranteed) return { type: "resource", resource: guaranteed };
    const d = hexDistance({ q, r }, { q: 0, r: 0 });
    const corridorA = q >= 0 && q <= 7 && r >= -2 && r <= 0;
    const corridorB = q >= -4 && q <= 0 && r >= 0 && r <= 7;
    if (d < 6 || corridorA || corridorB) return { type: "ground" };
    if(inWaterBlob(q,r))return {type:"water"};
    const ridge=terrainNoise(q,r,11,201),ridgeDetail=terrainNoise(q,r,3.4,202);
    if(Math.abs(ridge-.5)<.034&&ridgeDetail>.3)return {type:"rock"};
    const v=terrainHash(q,r,17);
    if (v > 0.986) return { type: "resource", resource: terrainHash(q, r, 31) > .5 ? "material" : "energy" };
    return { type: "ground" };
  }

  function makeInitialState() {
    const tracks = new Map();
    [[1,0],[2,0],[3,0],[4,0],[5,0],[6,0]].forEach(([q,r]) => tracks.set(key(q,r), { q, r, hp: 10, maxHp: 10, links: new Set() }));
    for(let q=1;q<6;q++){
      tracks.get(key(q,0)).links.add(key(q+1,0));
      tracks.get(key(q+1,0)).links.add(key(q,0));
    }
    const base = { id: "base", type: "base", q: 0, r: 0, hp: 100, maxHp: 100 };
    const p = axialToWorld(3, 0);
    const wm = axialToWorld(2, 0);
    const we = axialToWorld(1, 0);
    return {
      mode: "select",
      mapSeed: Date.now(),
      gameOver: false,
      elapsed: 0,
      wave: 0,
      waveClock: 24,
      wavesPaused: true,
      uiClock: 0,
      tracks,
      base,
      structures: new Map(),
      nodeResources: new Map(),
      worldMessages: [],
      trains: [{
        id: "train-1", name: "Train A", q: 3, r: 0, x: p.x, y: p.y,
        route: [], progress: 0, speed: 2.25, stepFrom: null, stepTo: null,
        forwardDirection: { q: 1, r: 0 },
        fuel: 20, maxFuel: 20, hp: 28, maxHp: 28, status: "Idle",
        wagons: [
          { id: "wagon-1", kind: "wagon", q: 2, r: 0, x: wm.x, y: wm.y, heading: 0, role: "material", type: "material", amount: 30, capacity: 30, hp: 18, maxHp: 18 },
          { id: "wagon-2", kind: "wagon", q: 1, r: 0, x: we.x, y: we.y, heading: 0, role: "energy", type: "energy", amount: 30, capacity: 30, hp: 18, maxHp: 18 }
        ],
        heading: 0, wheelClock: 0, wasNearBase: false
      }],
      enemies: [],
      projectiles: [],
      particles: [],
      baseMaterial: 70,
      baseEnergy: 48,
      trackInventory: 20,
      trainInventory: 0,
      selected: { type: "base", id: "base" },
      trackStart: null,
      deploymentHead: null,
      deploymentPaths: [],
      deploymentReserved: new Set(),
      hover: null,
      nextId: 3,
      nextTrainIndex: 1,
      camera: { x: 75, y: 45, zoom: 1 },
      pointer: { down: false, moved: false, x: 0, y: 0, startX: 0, startY: 0, camX: 0, camY: 0 },
      sound: true
    };
  }

  let state = makeInitialState();
  let width = 1, height = 1, dpr = 1;
  let lastTime = performance.now();
  let selectionCache = "";

  class SoundBank {
    constructor() { this.audio = null; this.enabled = true; this.lastShot = 0; this.lastHit = 0; }
    init() {
      if (!this.enabled) return;
      if (!this.audio) this.audio = new (window.AudioContext || window.webkitAudioContext)();
      if (this.audio.state === "suspended") this.audio.resume();
    }
    tone(freq, duration, type = "sine", gain = .035, endFreq = null) {
      if (!this.enabled) return;
      this.init();
      const t = this.audio.currentTime;
      const osc = this.audio.createOscillator();
      const amp = this.audio.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
      amp.gain.setValueAtTime(.0001, t);
      amp.gain.exponentialRampToValueAtTime(gain, t + .012);
      amp.gain.exponentialRampToValueAtTime(.0001, t + duration);
      osc.connect(amp).connect(this.audio.destination);
      osc.start(t); osc.stop(t + duration + .02);
    }
    place() { this.tone(150, .12, "square", .025, 260); }
    remove() { this.tone(170, .16, "sawtooth", .022, 65); }
    dispatch() { this.tone(190, .38, "triangle", .038, 380); setTimeout(() => this.tone(250, .28, "triangle", .025, 470), 90); }
    shot() { const now = performance.now(); if (now - this.lastShot > 65) { this.lastShot = now; this.tone(460, .055, "square", .018, 170); } }
    hit() { const now = performance.now(); if (now - this.lastHit > 500) { this.lastHit = now; this.tone(75, .12, "sawtooth", .018, 48); } }
    error() { this.tone(105, .18, "square", .022, 72); }
    wave() { this.tone(95, .5, "sawtooth", .026, 165); }
  }
  const sounds = new SoundBank();

  function toast(message, kind = "") {
    const item = document.createElement("div");
    item.className = `game-toast ${kind}`;
    item.textContent = message;
    ui.toastStack.appendChild(item);
    setTimeout(() => item.remove(), 2600);
  }

  function resize() {
    const rect = worldWrap.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  function screenToHex(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left, sy = clientY - rect.top;
    const wx = (sx - width / 2) / state.camera.zoom + state.camera.x;
    const wy = (sy - height / 2) / state.camera.zoom + state.camera.y;
    return worldToAxial(wx, wy);
  }

  function isPassable(q, r) {
    const terrain = terrainAt(q, r);
    return terrain.type !== "water" && terrain.type !== "rock";
  }

  function structureAt(q, r) {
    if (state.base.q === q && state.base.r === r) return state.base;
    return state.structures.get(key(q, r)) || null;
  }

  function resourceNodeAt(q,r) {
    const terrain=terrainAt(q,r);
    if(terrain.type!=="resource")return null;
    const nodeKey=key(q,r);
    return {id:nodeKey,type:"node",resource:terrain.resource,q,r,amount:state.nodeResources.get(nodeKey)??NODE_CAPACITY,maxAmount:NODE_CAPACITY};
  }

  function setNodeAmount(node,amount) {
    const remaining=clamp(amount,0,node.maxAmount);
    state.nodeResources.set(key(node.q,node.r),remaining);
    node.amount=remaining;
  }

  function trainAt(q, r) {
    return state.trains.find(train => trainSegments(train).some(segment => segment.q === q && segment.r === r)) || null;
  }

  function trainClaimsHex(q,r){
    return state.trains.some(train=>trainSegments(train).some(segment=>segment.q===q&&segment.r===r)||(train.stepTo||[]).some(position=>position.q===q&&position.r===r));
  }

  function trainSegments(train) {
    return [train, ...train.wagons];
  }

  function trainSegmentAt(q, r) {
    for (const train of state.trains) {
      const segments = trainSegments(train);
      const index = segments.findIndex(segment => segment.q === q && segment.r === r);
      if (index >= 0) return { train, segment: segments[index], index };
    }
    return null;
  }

  function distanceToTrain(train, target) {
    return Math.min(...trainSegments(train).map(segment => hexDistance(segment, target)));
  }

  function getSelected() {
    if (!state.selected) return null;
    if (state.selected.type === "base") return state.base;
    if (state.selected.type === "train") return state.trains.find(t => t.id === state.selected.id) || null;
    if (state.selected.type === "structure") return [...state.structures.values()].find(s => s.id === state.selected.id) || null;
    if (state.selected.type === "track") return state.tracks.get(state.selected.id) || null;
    if (state.selected.type === "node") { const position=fromKey(state.selected.id); return resourceNodeAt(position.q,position.r); }
    return null;
  }

  function clearDeploymentReservation(){
    state.deploymentHead=null;state.deploymentPaths=[];state.deploymentReserved.clear();
  }

  function setMode(mode) {
    if (mode !== "track" || state.mode !== "track") state.trackStart = null;
    if(mode!=="deploy"||state.mode==="deploy")clearDeploymentReservation();
    state.mode = mode;
    document.querySelectorAll("[data-mode]").forEach(button => button.classList.toggle("active", button.dataset.mode === mode));
    canvas.style.cursor = mode === "select" ? "default" : "crosshair";
    updateUI(true);
  }

  function select(type, id) {
    state.selected = { type, id };
    updateUI(true);
  }

  function isRailHex(q, r) {
    return state.tracks.has(key(q, r));
  }

  function connectedTrackNeighbors(q, r) {
    const track = state.tracks.get(key(q,r));
    return track ? [...track.links].map(fromKey) : [];
  }

  function tracksAreLinked(a, b) {
    return state.tracks.get(key(a.q,a.r))?.links.has(key(b.q,b.r)) || false;
  }

  function linkTracks(a, b) {
    state.tracks.get(key(a.q,a.r)).links.add(key(b.q,b.r));
    state.tracks.get(key(b.q,b.r)).links.add(key(a.q,a.r));
  }

  function deleteTrack(q, r) {
    const k=key(q,r),track=state.tracks.get(k);
    if(!track)return;
    for(const linkedKey of track.links)state.tracks.get(linkedKey)?.links.delete(k);
    state.tracks.delete(k);
    if(state.trackStart?.q===q&&state.trackStart?.r===r)state.trackStart=null;
  }

  function curveIsExtreme(start, end) {
    return connectedTrackNeighbors(start.q,start.r).some(neighbor=>tracksAreLinked(neighbor,end));
  }

  function trackWithinRange(target, range = 3) {
    return [...state.tracks.values()].some(track=>hexDistance(track,target)<=range);
  }

  function requireNearbyTrack(target, action) {
    if(trackWithinRange(target,3))return true;
    fail(`${capitalize(action)} must be within three hexes of track.`);
    return false;
  }

  function layTrack(q, r) {
    const destination={q,r},destinationKey=key(q,r);
    if(!state.trackStart){
      if(state.trackInventory<1)return fail("No Track in Base inventory. Fabricate a Track Pack at the Base.");
      if(!state.tracks.has(destinationKey))return fail("Select an existing track hex first.");
      state.trackStart=destination;toast("Track Start Selected. Click adjacent hexes to keep building.","info");updateUI(true);return;
    }
    const start=state.trackStart;
    const isNew=!state.tracks.has(destinationKey);
    if(!isNew&&hexDistance(start,destination)!==1){
      state.trackStart=destination;
      toast("New Track Start Selected. Click an adjacent hex to keep building.","info");
      updateUI(true);
      return;
    }
    if(hexDistance(start,destination)!==1)return fail("Choose an adjacent hex, or click a non-adjacent existing Track to choose a new start.");
    if(tracksAreLinked(start,destination)){
      state.trackStart=destination;
      toast("Track Start Moved Along The Existing Route.","info");
      updateUI(true);
      return;
    }
    if(isNew){
      if(!isPassable(q,r)||terrainAt(q,r).type==="resource")return fail("Track needs clear ground.");
      if(structureAt(q,r)||trainAt(q,r))return fail("That hex is occupied.");
      if(state.trackInventory<1)return fail("No Track in Base inventory. Fabricate a Track Pack at the Base.");
    }
    if(curveIsExtreme(start,destination))return fail("Train curves cannot be that extreme");
    if(isNew){state.trackInventory--;state.tracks.set(destinationKey,{q,r,hp:10,maxHp:10,links:new Set()});}
    linkTracks(start,destination);
    state.trackStart=destination;
    sounds.place();
    burst(q, r, "#d9bd78", 5);
    if(isNew&&state.trackInventory<=0){toast("Base Inventory Has No Track Remaining.","info");setMode("select");return;}
    updateUI(true);
  }

  function removeTrack(q, r) {
    const k = key(q, r);
    if (!state.tracks.has(k)) return;
    if (trainAt(q, r)) return fail("Move the train before removing this track.");
    deleteTrack(q,r);
    state.trackInventory++;
    if (state.selected?.type === "track" && state.selected.id === k) state.selected = null;
    sounds.remove();
    updateUI(true);
  }

  function fail(message) { sounds.error(); toast(message, "danger"); }

  function totalCargo(train, type) {
    return train.wagons.filter(w => w.type === type).reduce((sum, w) => sum + w.amount, 0);
  }

  function cargoSpace(train, type) {
    return train.wagons.filter(w => (w.role || w.type) === type).reduce((sum, w) => sum + w.capacity - w.amount, 0);
  }

  function removeCargo(train, type, amount) {
    let remaining = amount;
    for (const wagon of train.wagons.filter(w => w.type === type)) {
      const used = Math.min(wagon.amount, remaining);
      wagon.amount -= used; remaining -= used;
      if (wagon.amount <= .0001) { wagon.amount = 0; wagon.type = wagon.role || type; }
      if (remaining <= .0001) break;
    }
    return amount - remaining;
  }

  function addCargo(train, type, amount) {
    let remaining = amount;
    const compatible = train.wagons.filter(w => (w.role || w.type) === type);
    for (const wagon of compatible) {
      wagon.type = wagon.role || type;
      const added = Math.min(wagon.capacity - wagon.amount, remaining);
      wagon.amount += added; remaining -= added;
      if (remaining <= .0001) break;
    }
    return amount - remaining;
  }

  function buildTurret(q, r) {
    if(!requireNearbyTrack({q,r},"building a turret"))return;
    if (!isPassable(q, r) || terrainAt(q, r).type === "resource" || structureAt(q, r) || state.tracks.has(key(q,r))) return fail("Turrets need clear ground away from track.");
    if(!payBase(COSTS.turret))return;
    const turret = { id: `turret-${state.nextId++}`, type: "turret", q, r, hp: 18, maxHp: 18, energy: 20, maxEnergy: 20, cooldown: 0, showRangeUntil: state.elapsed + 3.5 };
    state.structures.set(key(q,r), turret);
    sounds.place(); burst(q, r, "#65dbe0", 10); select("structure", turret.id);
    toast("Turret Online.", "info");
  }

  function buildMine(q, r) {
    const terrain = terrainAt(q, r);
    if(!requireNearbyTrack({q,r},"building a mine"))return;
    if (terrain.type !== "resource") return fail("Mines must be placed on a resource node.");
    if (structureAt(q, r) || state.tracks.has(key(q,r))) return fail("That resource node is occupied.");
    if(!payBase(COSTS.mine))return;
    const mine = { id: `mine-${state.nextId++}`, type: "mine", resource: terrain.resource, q, r, hp: 22, maxHp: 22 };
    state.structures.set(key(q,r), mine);
    sounds.place(); burst(q, r, terrain.resource === "energy" ? "#60d5db" : "#e6b94a", 10); select("structure", mine.id);
    toast(`${capitalize(terrain.resource)} mine established.`, "info");
  }

  function salvageStructure(structure) {
    if(!requireNearbyTrack(structure,`salvaging the ${structure.type}`))return;
    const mat = structure.type === "turret" ? 4 : 6;
    const energy = structure.type==="turret"?Math.floor(structure.energy):0;
    state.baseMaterial+=mat;state.baseEnergy+=energy;
    state.structures.delete(key(structure.q, structure.r));
    state.selected = { type: "base", id: "base" };
    sounds.remove(); burst(structure.q, structure.r, "#9ba9ad", 8); updateUI(true);
    toast(structure.type==="turret"?`Salvaged ${mat} Material and ${energy} Energy.`:`Salvaged ${mat} Material.`);
  }

  function deploymentPathsFrom(head){
    const paths=[];
    for(const middle of connectedTrackNeighbors(head.q,head.r))for(const tail of connectedTrackNeighbors(middle.q,middle.r)){
      if(tail.q===head.q&&tail.r===head.r)continue;
      const path=[head,middle,tail];
      if(path.some(position=>trainClaimsHex(position.q,position.r)||structureAt(position.q,position.r)))continue;
      paths.push(path);
    }
    return paths;
  }

  function deployTrain(q,r){
    if(state.trainInventory<1)return fail("No complete Train Set is available in Base inventory.");
    if(!state.deploymentHead){
      if(!isRailHex(q,r))return fail("Select an empty Track hex for the Train Head.");
      if(trainClaimsHex(q,r))return fail("That Track is occupied or already being entered.");
      const head={q,r},paths=deploymentPathsFrom(head);
      if(!paths.length)return fail("Deployment needs three connected, unoccupied Track hexes.");
      state.deploymentHead=head;state.deploymentPaths=paths;
      state.deploymentReserved=new Set(paths.flat().map(position=>key(position.q,position.r)));
      toast("Train Head Selected. Click a highlighted Tail point two Track hexes away.","info");updateUI(true);return;
    }
    const path=state.deploymentPaths.find(candidate=>candidate[2].q===q&&candidate[2].r===r);
    if(!path)return fail("Click a highlighted Tail point exactly two connected Track hexes from the Head.");
    if(path.some(position=>trainClaimsHex(position.q,position.r)))return fail("Those deployment Track hexes are no longer clear.");
    const [head,middle,tail]=path,hp=axialToWorld(head.q,head.r),mp=axialToWorld(middle.q,middle.r),tp=axialToWorld(tail.q,tail.r);
    const heading=Math.atan2(hp.y-mp.y,hp.x-mp.x),trainIndex=state.nextTrainIndex++;
    const train={id:`train-${state.nextId++}`,name:trainName(trainIndex),q:head.q,r:head.r,x:hp.x,y:hp.y,route:[],progress:0,speed:2.25,stepFrom:null,stepTo:null,forwardDirection:{q:head.q-middle.q,r:head.r-middle.r},fuel:10,maxFuel:20,hp:28,maxHp:28,status:"Idle",wagons:[
      {id:`wagon-${state.nextId++}`,kind:"wagon",q:middle.q,r:middle.r,x:mp.x,y:mp.y,heading,role:"material",type:"material",amount:0,capacity:30,hp:18,maxHp:18},
      {id:`wagon-${state.nextId++}`,kind:"wagon",q:tail.q,r:tail.r,x:tp.x,y:tp.y,heading,role:"energy",type:"energy",amount:0,capacity:30,hp:18,maxHp:18}
    ],heading,wheelClock:0,wasNearBase:false};
    state.trains.push(train);state.trainInventory--;clearDeploymentReservation();sounds.place();select("train",train.id);setMode("select");toast(`${train.name} Deployed.`,"info");
  }

  function findPath(start, goal) {
    if (!isRailHex(goal.q,goal.r)) return null;
    const initialDirection = start.wagons?.length
      ? { q:start.q-start.wagons[0].q, r:start.r-start.wagons[0].r }
      : start.forwardDirection;
    const nodes = [{ q:start.q, r:start.r, parent:-1, dq:initialDirection?.q ?? null, dr:initialDirection?.r ?? null }];
    const queue = [0];
    const visited = new Set([`${start.q},${start.r}|${initialDirection?.q ?? "x"},${initialDirection?.r ?? "x"}`]);
    let cursor = 0, goalIndex = -1;
    while (cursor < queue.length && nodes.length < 3500) {
      const nodeIndex = queue[cursor++], current = nodes[nodeIndex];
      if (current.q === goal.q && current.r === goal.r) { goalIndex = nodeIndex; break; }
      for (const next of connectedTrackNeighbors(current.q,current.r)) {
        const dq=next.q-current.q, dr=next.r-current.r;
        if (current.dq !== null && dq === -current.dq && dr === -current.dr) continue;
        const visitKey=`${next.q},${next.r}|${dq},${dr}`;
        if (visited.has(visitKey)) continue;
        visited.add(visitKey);
        nodes.push({ q:next.q, r:next.r, parent:nodeIndex, dq, dr });
        queue.push(nodes.length-1);
      }
    }
    if (goalIndex < 0) return null;
    const path=[];
    for (let index=goalIndex; nodes[index].parent>=0; index=nodes[index].parent) path.push({q:nodes[index].q,r:nodes[index].r});
    return path.reverse();
  }

  function dispatchTrain(train, q, r) {
    if (train.route.length || train.stepFrom) return fail("Train is already moving.");
    const occupant = trainAt(q,r);
    if (occupant && occupant.id !== train.id) return fail("Another train occupies that destination.");
    const path = findPath(train, {q,r});
    if (!path?.length) return fail("No forward route reaches that destination. Build a track loop to turn the train around.");
    if(locoNearBase(train)){refuelAtBase(train);fillBaseCargo(train);}
    if (train.fuel <= .2 && totalCargo(train,"energy") < 1) return fail("Train is out of Energy.");
    train.route = path; train.progress = 0; train.stepFrom = null; train.stepTo = null; train.status = "En route";
    sounds.dispatch(); updateUI(true);
  }

  function handleHexClick(hex) {
    if (state.gameOver) return;
    const { q, r } = hex;
    const structure = structureAt(q,r);
    const train = trainAt(q,r);
    if (state.mode === "track") return layTrack(q,r);
    if (train) { select("train", train.id); setMode("select"); return; }
    if (state.mode === "turret") return buildTurret(q,r);
    if (state.mode === "mine") return buildMine(q,r);
    if (state.mode === "deploy") return deployTrain(q,r);
    if (state.mode === "salvage") {
      if (state.tracks.has(key(q,r))) return removeTrack(q,r);
      if (structure && structure.type !== "base") return salvageStructure(structure);
      return fail("There is no track, turret, or mine to salvage here.");
    }
    const selected = getSelected();
    if (selected?.wagons && isRailHex(q,r)) return dispatchTrain(selected,q,r);
    if (structure) return select(structure.type === "base" ? "base" : "structure", structure.id);
    if (state.tracks.has(key(q,r))) return select("track", key(q,r));
    if (terrainAt(q,r).type==="resource") return select("node",key(q,r));
    state.selected = null; updateUI(true);
  }

  function payBase(cost) {
    if (state.baseMaterial < cost.material || state.baseEnergy < cost.energy) { fail(`Base needs ${cost.material} Material and ${cost.energy} Energy.`); return false; }
    state.baseMaterial -= cost.material; state.baseEnergy -= cost.energy; return true;
  }

  function trainStopped(train) { return !train.route.length && !train.stepFrom; }
  function locoNearBase(train) { return trainStopped(train) && hexDistance(train,state.base)<=1; }

  function fillWagonFromBase(train,wagon) {
    const type=wagon.role||wagon.type;
    if(!type)return 0;
    const available=type==="material"?state.baseMaterial:state.baseEnergy;
    const moved=Math.min(wagon.capacity-wagon.amount,available);
    if(moved<=0)return 0;
    wagon.type=type;wagon.amount+=moved;
    if(type==="material")state.baseMaterial-=moved;else state.baseEnergy-=moved;
    return moved;
  }

  function fillBaseCargo(train) {
    let moved=0;
    for(const wagon of train.wagons)moved+=fillWagonFromBase(train,wagon);
    return moved;
  }

  function refuelAtBase(train) {
    const moved=Math.min(train.maxFuel-train.fuel,state.baseEnergy);
    if(moved>0){train.fuel+=moved;state.baseEnergy-=moved;}
    return moved;
  }

  function serviceBaseArrival(train) {
    const emptyOnArrival=new Set(train.wagons.filter(w=>w.amount<=.0001).map(w=>w.id));
    const material=removeCargo(train,"material",totalCargo(train,"material"));
    const energy=removeCargo(train,"energy",totalCargo(train,"energy"));
    state.baseMaterial+=material;state.baseEnergy+=energy;
    if(material+energy>0)showWorldActivity(state.base,"Unloading...",1.25,"#bafcff");
    refuelAtBase(train);
    for(const wagon of train.wagons.filter(w=>emptyOnArrival.has(w.id)))fillWagonFromBase(train,wagon);
  }

  function nearestTrain(structure, range = 3) {
    return state.trains.filter(t => !t.route.length && !t.stepFrom && distanceToTrain(t,structure) <= range).sort((a,b) => distanceToTrain(a,structure)-distanceToTrain(b,structure))[0] || null;
  }

  function nearestStoppedLoco(target, range = 1) {
    return state.trains.filter(train=>trainStopped(train)&&hexDistance(train,target)<=range).sort((a,b)=>hexDistance(a,target)-hexDistance(b,target))[0]||null;
  }

  function showWorldActivity(target,message,duration=1.1,color="#bafcff") {
    state.worldMessages=state.worldMessages.filter(item=>item.until>state.elapsed);
    const targetKey=`${target.q},${target.r}`;
    const existing=state.worldMessages.find(item=>item.targetKey===targetKey&&item.message===message);
    if(existing){existing.until=Math.max(existing.until,state.elapsed+duration);existing.color=color;}
    else state.worldMessages.push({targetKey,q:target.q,r:target.r,targetType:target.type,message,color,until:state.elapsed+duration});
  }

  function repairLabel(target) {
    if(target.type==="base")return "Base";
    if(target.type==="turret")return "Turret";
    if(target.type==="mine")return `${capitalize(target.resource)} Mine`;
    return "Track";
  }

  function updateAutomaticRepair(train) {
    if(!trainStopped(train)||totalCargo(train,"material")<=0)return;
    const targets=[state.base,...state.structures.values(),...state.tracks.values()]
      .filter(target=>target.hp<target.maxHp&&hexDistance(train,target)<=1)
      .sort((a,b)=>hexDistance(train,a)-hexDistance(train,b)||(a.hp/a.maxHp)-(b.hp/b.maxHp));
    for(const target of targets){
      const repaired=Math.min(target.maxHp-target.hp,totalCargo(train,"material"));
      if(repaired<=0)break;
      removeCargo(train,"material",repaired);target.hp+=repaired;
      showWorldActivity(target,`Repairing ${repairLabel(target)}...`,1.25,"#fff1b4");
    }
  }

  function updateAutomaticLogistics() {
    for(const train of state.trains){
      const nearBase=locoNearBase(train);
      updateAutomaticRepair(train);
      if(nearBase&&!train.wasNearBase)serviceBaseArrival(train);
      train.wasNearBase=nearBase;
    }
    for(const structure of state.structures.values()){
      const train=structure.type==="mine"?nearestStoppedLoco(structure,1):nearestTrain(structure,1);
      if(!train)continue;
      if(structure.type==="turret"){
        const energyRoom=Math.max(0,structure.maxEnergy-structure.energy);
        const moved=removeCargo(train,"energy",Math.min(energyRoom,totalCargo(train,"energy")));
        structure.energy+=moved;
        if(moved>0)showWorldActivity(structure,"Loading Turret with Energy...");
      }
      if(structure.type==="mine"){
        const node=resourceNodeAt(structure.q,structure.r);
        const extractable=Math.floor(Math.min(cargoSpace(train,structure.resource),node?.amount||0));
        const moved=addCargo(train,structure.resource,extractable);
        if(moved>0){
          setNodeAmount(node,node.amount-moved);
          showWorldActivity(structure,`Mining ${capitalize(structure.resource)}, Loading Wagon...`,1.25,"#d5a3ff");
        }
      }
    }
  }

  function handleAction(action, element) {
    element?.blur();
    if (action === "make-track" && payBase(COSTS.trackPack)) { state.trackInventory += 10; sounds.place(); toast("Fabricated 10 Track sections."); }
    if (action === "make-train" && payBase(COSTS.train)) { state.trainInventory++; sounds.place(); toast("Complete Train Set Added to Inventory."); }
    if (action === "deploy-train") { if (state.trainInventory < 1) fail("No complete Train Set is available in Base inventory."); else setMode("deploy"); }
    updateUI(true);
  }

  function updateTrains(dt) {
    for (const train of state.trains) {
      if (!train.route.length) continue;
      if (!train.stepFrom && train.fuel <= .15) {
        const pulled = removeCargo(train,"energy",1);
        if (pulled > 0) train.fuel += pulled;
        else { train.route = []; train.stepFrom = null; train.stepTo = null; train.status = "Stuck — no Energy"; fail(`${train.name} is out of Energy.`); continue; }
      }
      if (!train.stepFrom && !prepareTrainStep(train)) continue;
      train.progress += dt * train.speed;
      const t = Math.min(1,train.progress);
      const segments = trainSegments(train);
      segments.forEach((segment,index) => {
        const from = axialToWorld(train.stepFrom[index].q,train.stepFrom[index].r);
        const to = axialToWorld(train.stepTo[index].q,train.stepTo[index].r);
        segment.x = lerp(from.x,to.x,t); segment.y = lerp(from.y,to.y,t);
        segment.heading = Math.atan2(to.y-from.y,to.x-from.x);
      });
      train.wheelClock += dt;
      if (train.progress >= 1) {
        train.forwardDirection = { q:train.stepTo[0].q-train.stepFrom[0].q, r:train.stepTo[0].r-train.stepFrom[0].r };
        segments.forEach((segment,index) => {
          segment.q = train.stepTo[index].q; segment.r = train.stepTo[index].r;
          const p = axialToWorld(segment.q,segment.r); segment.x = p.x; segment.y = p.y;
        });
        train.route.shift(); train.progress = 0; train.fuel = Math.max(0,train.fuel - .18);
        train.stepFrom = null; train.stepTo = null;
        if (!train.route.length) { train.status = "Arrived"; toast(`${train.name} reached its destination.`, "info"); }
      }
    }
  }

  function prepareTrainStep(train) {
    const segments = trainSegments(train);
    const from = segments.map(segment => ({ q:segment.q, r:segment.r }));
    const nextHead = train.route[0];
    const direction = { q:nextHead.q-train.q, r:nextHead.r-train.r };
    const forward = train.wagons.length
      ? { q:train.q-train.wagons[0].q, r:train.r-train.wagons[0].r }
      : train.forwardDirection;
    if (forward && direction.q === -forward.q && direction.r === -forward.r) {
      train.route=[]; train.status="Stuck — no reverse travel";
      fail(`${train.name} cannot reverse. Build a track loop to turn around.`); return false;
    }
    const to = [nextHead, ...from.slice(0,-1)];
    if(to.some(position=>state.deploymentReserved.has(key(position.q,position.r)))){
      train.status="Waiting — Track Reserved For Deployment";
      return false;
    }
    if (new Set(to.map(position=>key(position.q,position.r))).size !== to.length) {
      train.route=[]; train.status="Stuck — train blocks itself";
      fail(`${train.name} cannot enter a hex occupied by its own wagons.`); return false;
    }
    for (const position of to) {
      if (!isRailHex(position.q,position.r)) {
        train.route=[]; train.status="Stuck — train is too long";
        fail(`${train.name} cannot move that way: every wagon needs track.`); return false;
      }
      const occupant = trainAt(position.q,position.r);
      if (occupant && occupant.id !== train.id) {
        train.route=[]; train.status="Stuck — track occupied";
        fail(`${train.name} is blocked by another train.`); return false;
      }
    }
    train.stepFrom=from; train.stepTo=to; train.progress=0;
    train.status="En route";
    return true;
  }

  function spawnWave() {
    state.wave++;
    const count = 3 + state.wave * 2;
    const radius = 14 + Math.min(10,state.wave * .6);
    for (let i=0;i<count;i++) {
      let angle = (i/count) * Math.PI*2 + hash(state.wave,i,9)*.7;
      let q = Math.round(Math.cos(angle)*radius), r = Math.round(Math.sin(angle)*radius);
      for (let tries=0;tries<8 && !isPassable(q,r);tries++) { q += DIRECTIONS[tries%6][0]; r += DIRECTIONS[tries%6][1]; }
      const p = axialToWorld(q,r);
      state.enemies.push({ id:`enemy-${state.nextId++}`, q,r,x:p.x,y:p.y,fromQ:q,fromR:r,toQ:q,toR:r,progress:1,speed:.38+Math.min(.28,state.wave*.014),attackClock:0,phase:hash(q,r,i)*Math.PI*2 });
    }
    state.waveClock = Math.max(18,29-state.wave*.3);
    sounds.wave(); toast(`Wave ${state.wave}: ${count} biomass contacts.`, "danger");
  }

  function targetCandidates(enemy) {
    const list = [state.base, ...state.structures.values(), ...state.trains];
    let nearestTrack = null, nearestDistance = Infinity;
    for (const track of state.tracks.values()) {
      const d = hexDistance(enemy,track);
      if (d < nearestDistance) { nearestDistance = d; nearestTrack = track; }
    }
    if (nearestTrack) list.push(nearestTrack);
    return list.filter(Boolean);
  }

  function enemyTarget(enemy) {
    return targetCandidates(enemy).sort((a,b) => distanceToTarget(enemy,a)-distanceToTarget(enemy,b))[0] || state.base;
  }

  function distanceToTarget(enemy,target) {
    return target.wagons ? distanceToTrain(target,enemy) : hexDistance(enemy,target);
  }

  function targetHexFor(enemy,target) {
    if (!target.wagons) return target;
    return trainSegments(target).slice().sort((a,b)=>hexDistance(enemy,a)-hexDistance(enemy,b))[0];
  }

  function damageTarget(target, amount) {
    target.hp -= amount;
    sounds.hit();
    if (target.hp > 0) return;
    if(target.kind==="wagon"){
      const train=state.trains.find(candidate=>candidate.wagons.includes(target));
      if(train){
        const index=train.wagons.indexOf(target),lost=train.wagons.length-index;
        train.wagons.splice(index);
        toast(`${train.name} lost ${lost} ${lost===1?"Wagon":"Wagons"}.`,"danger");
      }
      burst(target.q,target.r,"#d94a4a",12);updateUI(true);return;
    }
    if (target.type === "base") {
      target.hp = 0; state.gameOver = true; ui.survivalTime.textContent = formatTime(state.elapsed); ui.gameOver.classList.remove("d-none");
      return;
    }
    if (target.wagons) {
      state.trains = state.trains.filter(t => t.id !== target.id);
      if (state.selected?.id === target.id) state.selected = null;
      toast(`${target.name} was consumed.`, "danger");
    } else if (target.type === "turret" || target.type === "mine") {
      state.structures.delete(key(target.q,target.r));
      if (state.selected?.id === target.id) state.selected = null;
      toast(`${capitalize(target.type)} destroyed.`, "danger");
    } else {
      deleteTrack(target.q,target.r);
      if (state.selected?.type === "track" && state.selected.id === key(target.q,target.r)) state.selected = null;
    }
    burst(target.q,target.r,"#d94a4a",12); updateUI(true);
  }

  function updateEnemies(dt) {
    for (const enemy of state.enemies) {
      enemy.phase += dt*2.2;
      const target = enemyTarget(enemy);
      const targetHex = targetHexFor(enemy,target);
      if (enemy.progress >= 1 && hexDistance(enemy,targetHex) === 0) {
        enemy.attackClock += dt;
        damageTarget(target.wagons?targetHex:target,dt*2.1);
        continue;
      }
      if (enemy.progress >= 1) {
        const options = neighbors(enemy.q,enemy.r).filter(n => isPassable(n.q,n.r));
        options.sort((a,b) => {
          const da = hexDistance(a,targetHex) + hash(a.q,a.r,enemy.id.length)*.16;
          const db = hexDistance(b,targetHex) + hash(b.q,b.r,enemy.id.length)*.16;
          return da-db;
        });
        const next = options[0];
        if (next) {
          enemy.fromQ=enemy.q; enemy.fromR=enemy.r; enemy.toQ=next.q; enemy.toR=next.r; enemy.progress=0;
        }
      }
      if (enemy.progress < 1) {
        enemy.progress = Math.min(1,enemy.progress + dt*enemy.speed);
        const a=axialToWorld(enemy.fromQ,enemy.fromR), b=axialToWorld(enemy.toQ,enemy.toR);
        const eased=enemy.progress*enemy.progress*(3-2*enemy.progress);
        enemy.x=lerp(a.x,b.x,eased); enemy.y=lerp(a.y,b.y,eased);
        if (enemy.progress>=1) { enemy.q=enemy.toQ; enemy.r=enemy.toR; }
      }
    }
  }

  function updateStructures(dt) {
    for (const structure of state.structures.values()) {
      if (structure.type === "turret") {
        structure.cooldown -= dt;
        if (structure.energy >= 1 && structure.cooldown <= 0) {
          const targets = state.enemies.filter(e => hexDistance(structure,worldToAxial(e.x,e.y)) <= 4).sort((a,b)=>hexDistance(structure,a)-hexDistance(structure,b));
          if (targets.length) {
            const enemy=targets[0], from=axialToWorld(structure.q,structure.r);
            state.projectiles.push({x1:from.x,y1:from.y,x2:enemy.x,y2:enemy.y,life:.12,maxLife:.12});
            structure.energy--; structure.cooldown=.48;
            state.enemies=state.enemies.filter(e=>e.id!==enemy.id);
            burst(enemy.q,enemy.r,"#e35050",7); sounds.shot();
          }
        }
      }
    }
    state.projectiles.forEach(p=>p.life-=dt);
    state.projectiles=state.projectiles.filter(p=>p.life>0);
    state.particles.forEach(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.95;p.vy*=.95;});
    state.particles=state.particles.filter(p=>p.life>0);
  }

  function burst(q,r,color,count) {
    const p=axialToWorld(q,r);
    for(let i=0;i<count;i++) { const a=hash(q+i,r,count)*Math.PI*2,s=10+hash(r-i,q,count)*30; state.particles.push({x:p.x,y:p.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.45+hash(i,q,r)*.35,maxLife:.8,color}); }
  }

  function update(dt) {
    if(state.gameOver)return;
    state.elapsed+=dt;
    state.worldMessages=state.worldMessages.filter(item=>item.until>state.elapsed);
    if(!state.wavesPaused){state.waveClock-=dt;if(state.waveClock<=0)spawnWave();}
    updateTrains(dt); updateAutomaticLogistics(dt); updateEnemies(dt); updateStructures(dt);
    state.uiClock-=dt;if(state.uiClock<=0){state.uiClock=.15;updateUI();}
  }

  function hexPath(q,r,scale=.94){
    const p=axialToWorld(q,r);ctx.beginPath();
    for(let i=0;i<6;i++){const a=(Math.PI/180)*(60*i-30);const x=p.x+HEX*scale*Math.cos(a),y=p.y+HEX*scale*Math.sin(a);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();
  }

  function visibleBounds(){const z=state.camera.zoom;const spanQ=Math.ceil(width/(HEX*SQRT3*z))+7,spanR=Math.ceil(height/(HEX*1.5*z))+7;const c=worldToAxial(state.camera.x,state.camera.y);return{q0:c.q-spanQ,q1:c.q+spanQ,r0:c.r-spanR,r1:c.r+spanR};}

  function drawTerrain(){
    const b=visibleBounds();
    for(let r=b.r0;r<=b.r1;r++)for(let q=b.q0;q<=b.q1;q++){
      const terrain=terrainAt(q,r), shade=terrainHash(q,r,2);
      hexPath(q,r,.975);
      if(terrain.type==="water")ctx.fillStyle=shade>.5?"#102b35":"#0e2630";
      else if(terrain.type==="rock")ctx.fillStyle=shade>.5?"#252d31":"#20282c";
      else ctx.fillStyle=shade>.5?"#151f23":"#131c20";
      ctx.fill();ctx.strokeStyle="rgba(91,112,119,.13)";ctx.lineWidth=.7;ctx.stroke();
      const p=axialToWorld(q,r);
      if(terrain.type==="water"){
        ctx.strokeStyle="rgba(79,157,177,.22)";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(p.x-12,p.y-4);ctx.lineTo(p.x+10,p.y-4);ctx.moveTo(p.x-6,p.y+5);ctx.lineTo(p.x+14,p.y+5);ctx.stroke();
      }else if(terrain.type==="rock"){
        ctx.fillStyle="#3c474c";ctx.beginPath();ctx.moveTo(p.x-14,p.y+11);ctx.lineTo(p.x-3,p.y-15);ctx.lineTo(p.x+6,p.y+4);ctx.lineTo(p.x+14,p.y+12);ctx.closePath();ctx.fill();
        ctx.fillStyle="#526066";ctx.beginPath();ctx.moveTo(p.x-3,p.y-15);ctx.lineTo(p.x+6,p.y+4);ctx.lineTo(p.x-7,p.y+5);ctx.closePath();ctx.fill();
      }else if(terrain.type==="resource")drawResourceNode(q,r,p,terrain.resource);
    }
  }

  function drawResourceNode(q,r,p,type){
    const node=resourceNodeAt(q,r),low=node.amount<=node.maxAmount*.2;
    const color=type==="energy"?"#60d5db":"#e6b94a";
    ctx.save();
    if(low){const pulse=.5+.5*Math.sin(state.elapsed*5);ctx.shadowBlur=18+pulse*10;ctx.shadowColor="#ff3848";ctx.strokeStyle=`rgba(255,56,72,${.65+pulse*.3})`;ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(p.x,p.y,15+pulse*2,0,Math.PI*2);ctx.stroke();}
    ctx.shadowBlur=12;ctx.shadowColor=color;ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,11,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle=color;ctx.globalAlpha=.18;ctx.fill();ctx.globalAlpha=1;ctx.fillStyle=color;ctx.font="700 15px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(type==="energy"?"E":"M",p.x,p.y+.5);ctx.restore();
    const selected=getSelected();
    const focused=(state.hover?.q===q&&state.hover?.r===r)||(selected?.type==="node"&&selected.q===q&&selected.r===r)||(selected?.type==="mine"&&selected.q===q&&selected.r===r);
    if(focused)drawMiniBar(p.x-17,p.y+29,34,node.amount/node.maxAmount,"#b879ff");
  }

  function drawTracks(){
    ctx.lineCap="round";
    for(const track of state.tracks.values()){
      const p=axialToWorld(track.q,track.r);
      for(const linkedKey of track.links){
        if(key(track.q,track.r)>linkedKey)continue;
        const n=fromKey(linkedKey);
        const np=axialToWorld(n.q,n.r);
        const dx=np.x-p.x,dy=np.y-p.y,length=Math.hypot(dx,dy),nx=-dy/length,ny=dx/length;
        ctx.strokeStyle="#0a0d0f";ctx.lineWidth=15;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(np.x,np.y);ctx.stroke();
        ctx.strokeStyle=track.hp<4?"#743b40":"#4b5559";ctx.lineWidth=3;
        for(let t=.12;t<.9;t+=.16){const x=lerp(p.x,np.x,t),y=lerp(p.y,np.y,t);ctx.beginPath();ctx.moveTo(x-nx*7,y-ny*7);ctx.lineTo(x+nx*7,y+ny*7);ctx.stroke();}
        ctx.strokeStyle=track.hp<4?"#a84c52":"#aeb9bc";ctx.lineWidth=2.6;
        for(const offset of [-4.5,4.5]){ctx.beginPath();ctx.moveTo(p.x+nx*offset,p.y+ny*offset);ctx.lineTo(np.x+nx*offset,np.y+ny*offset);ctx.stroke();}
      }
      ctx.fillStyle="#0a0d0f";ctx.beginPath();ctx.arc(p.x,p.y,7.5,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=track.hp<4?"#a84c52":"#8f9b9f";ctx.beginPath();ctx.arc(p.x,p.y,3.2,0,Math.PI*2);ctx.fill();
      const focused=(state.selected?.type==="track"&&state.selected.id===key(track.q,track.r))||(state.hover?.q===track.q&&state.hover?.r===track.r&&!trainAt(track.q,track.r));
      if(focused)drawMiniBar(p.x-15,p.y-15,30,track.hp/track.maxHp,track.hp<4?"#e34747":"#70bd77");
    }
  }

  function drawTurretRange(center,preview=false){
    ctx.save();ctx.fillStyle=preview?"rgba(230,185,74,.06)":"rgba(96,213,219,.055)";ctx.strokeStyle=preview?"rgba(230,185,74,.5)":"rgba(96,213,219,.34)";ctx.lineWidth=1.4;ctx.setLineDash([5,4]);
    for(let dq=-4;dq<=4;dq++){
      const r0=Math.max(-4,-dq-4),r1=Math.min(4,-dq+4);
      for(let dr=r0;dr<=r1;dr++){
        hexPath(center.q+dq,center.r+dr,.91);ctx.fill();
        if(hexDistance(center,{q:center.q+dq,r:center.r+dr})===4)ctx.stroke();
      }
    }
    ctx.setLineDash([]);ctx.restore();
  }

  function drawTurretRanges(){
    if(state.mode==="turret"&&state.hover)drawTurretRange(state.hover,true);
    for(const turret of state.structures.values()){
      if(turret.type!=="turret")continue;
      const selected=state.selected?.type==="structure"&&state.selected.id===turret.id;
      if(!selected&&state.elapsed>=(turret.showRangeUntil||0))continue;
      drawTurretRange(turret);
    }
  }

  function drawBase(){
    const p=axialToWorld(0,0);ctx.save();ctx.shadowBlur=18;ctx.shadowColor="rgba(230,185,74,.25)";hexPath(0,0,.78);ctx.fillStyle="#303438";ctx.fill();ctx.strokeStyle="#e6b94a";ctx.lineWidth=2.4;ctx.stroke();ctx.shadowBlur=0;
    ctx.fillStyle="#151a1d";ctx.fillRect(p.x-17,p.y-13,34,27);ctx.strokeStyle="#a68a47";ctx.strokeRect(p.x-17,p.y-13,34,27);ctx.fillStyle="#e6b94a";ctx.fillRect(p.x-10,p.y-5,5,11);ctx.fillRect(p.x+5,p.y-5,5,11);ctx.fillStyle="#0e1214";ctx.fillRect(p.x-3,p.y+3,6,11);ctx.restore();
    if((state.selected?.type==="base")||(state.hover?.q===0&&state.hover?.r===0))drawMiniBar(p.x-18,p.y-25,36,state.base.hp/state.base.maxHp,state.base.hp<20?"#e34747":"#70bd77");
  }

  function drawStructures(){
    for(const s of state.structures.values()){
      const p=axialToWorld(s.q,s.r);ctx.save();
      if(s.type==="turret"){
        if(s.energy<=s.maxEnergy*.2){const pulse=.5+.5*Math.sin(state.elapsed*6);ctx.shadowBlur=20+pulse*12;ctx.shadowColor="#ff3848";ctx.strokeStyle=`rgba(255,56,72,${.65+pulse*.35})`;ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.x,p.y,18+pulse*2,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;}
        ctx.shadowBlur=s.energy>=1?12:0;ctx.shadowColor="#60d5db";ctx.fillStyle="#26353a";ctx.strokeStyle=s.energy>=1?"#60d5db":"#59676c";ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,13,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.shadowBlur=0;ctx.strokeStyle="#b7c6c9";ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+17,p.y-8);ctx.stroke();ctx.fillStyle="#0d1215";ctx.beginPath();ctx.arc(p.x,p.y,5,0,Math.PI*2);ctx.fill();
      }else{
        ctx.fillStyle="#273239";ctx.strokeStyle=s.resource==="energy"?"#60d5db":"#e6b94a";ctx.lineWidth=2;ctx.beginPath();ctx.rect(p.x-15,p.y-15,30,30);ctx.fill();ctx.stroke();ctx.fillStyle=ctx.strokeStyle;ctx.fillRect(p.x-4,p.y-20,8,13);ctx.fillStyle="#101619";ctx.beginPath();ctx.arc(p.x,p.y,8,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#89989d";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(p.x-7,p.y);ctx.lineTo(p.x+7,p.y);ctx.moveTo(p.x,p.y-7);ctx.lineTo(p.x,p.y+7);ctx.stroke();
      }
      const focused=(state.selected?.type==="structure"&&state.selected.id===s.id)||(state.hover?.q===s.q&&state.hover?.r===s.r);
      if(focused){
        drawMiniBar(p.x-17,p.y-25,34,s.hp/s.maxHp,s.hp<5?"#e34747":"#70bd77");
        if(s.type==="turret")drawMiniBar(p.x-17,p.y+22,34,s.energy/s.maxEnergy,"#60d5db");
      }
      ctx.restore();
    }
  }

  function drawMiniBar(x,y,w,ratio,color){ctx.fillStyle="rgba(52,67,73,.9)";ctx.fillRect(x,y,w,3);ctx.fillStyle=color;ctx.fillRect(x,y,w*clamp(ratio,0,1),3);}

  function roundedRectPath(x,y,w,h,r){
    ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
  }

  function drawWorldMessages(){
    const offsets=new Map();
    for(const item of state.worldMessages){
      if(item.until<=state.elapsed)continue;
      const index=offsets.get(item.targetKey)||0;offsets.set(item.targetKey,index+1);
      const p=axialToWorld(item.q,item.r),clearance=item.targetType==="track"?23:35;
      ctx.save();ctx.font="700 11px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";
      const width=Math.ceil(ctx.measureText(item.message).width)+18,height=20,bottom=p.y-clearance-index*23,x=p.x-width/2,y=bottom-height;
      roundedRectPath(x,y,width,height,10);ctx.fillStyle="rgba(8,13,16,.92)";ctx.fill();ctx.strokeStyle=item.color;ctx.lineWidth=1;ctx.stroke();
      ctx.fillStyle=item.color;ctx.fillText(item.message,p.x,y+height/2+.5);ctx.restore();
    }
  }

  function drawTrains(){
    for(const train of state.trains){
      const segments=trainSegments(train);
      const focused=state.selected?.id===train.id||(state.hover&&segments.some(segment=>segment.q===state.hover.q&&segment.r===state.hover.r));
      ctx.strokeStyle="#79502f";ctx.lineWidth=2;
      for(let i=0;i<segments.length-1;i++){
        const a=segments[i],b=segments[i+1],dx=b.x-a.x,dy=b.y-a.y,distance=Math.hypot(dx,dy)||1,ux=dx/distance,uy=dy/distance;
        ctx.beginPath();ctx.moveTo(a.x+ux*14,a.y+uy*14);ctx.lineTo(b.x-ux*14,b.y-uy*14);ctx.stroke();
      }
      train.wagons.forEach(wagon=>{
        ctx.save();ctx.translate(wagon.x,wagon.y);ctx.rotate(wagon.heading||0);
        if(state.selected?.id===train.id)drawTrainSelectionRing();
        ctx.fillStyle=wagon.type==="energy"?"#347f87":"#8c7337";
        ctx.strokeStyle=wagon.type==="energy"?"#83edf2":"#f2cb69";
        ctx.lineWidth=2;ctx.fillRect(-14,-9,28,18);ctx.strokeRect(-14,-9,28,18);
        ctx.restore();
        ctx.save();ctx.fillStyle="#f3f7f8";ctx.font="800 13px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("W",wagon.x,wagon.y+.5);ctx.restore();
        if(focused)drawMiniBar(wagon.x-14,wagon.y-17,28,wagon.hp/wagon.maxHp,wagon.hp<5?"#e34747":"#70bd77");
      });
      ctx.save();ctx.translate(train.x,train.y);ctx.rotate(train.heading);if(state.selected?.id===train.id)drawTrainSelectionRing();ctx.shadowBlur=12;ctx.shadowColor="#e34747";ctx.fillStyle="#a9343e";ctx.strokeStyle="#ff8790";ctx.lineWidth=2;ctx.fillRect(-14,-9,28,18);ctx.strokeRect(-14,-9,28,18);ctx.beginPath();ctx.moveTo(14,-7);ctx.lineTo(22,0);ctx.lineTo(14,7);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
      ctx.save();ctx.fillStyle="#fff4f4";ctx.font="900 13px ui-monospace, monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("L",train.x,train.y+.5);ctx.restore();
      if(focused){drawMiniBar(train.x-16,train.y-17,32,train.hp/train.maxHp,train.hp<5?"#e34747":"#70bd77");drawMiniBar(train.x-16,train.y+18,32,train.fuel/train.maxFuel,"#60d5db");}
    }
  }

  function drawTrainSelectionRing(){ctx.strokeStyle="#fff1b4";ctx.lineWidth=1.5;ctx.setLineDash([4,3]);ctx.beginPath();ctx.arc(0,0,24,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}

  function drawEnemies(){
    for(const e of state.enemies){ctx.save();ctx.translate(e.x,e.y);const pulse=1+Math.sin(e.phase)*.08;ctx.scale(pulse,pulse);ctx.shadowBlur=13;ctx.shadowColor="#c51f31";ctx.fillStyle="#b92838";ctx.beginPath();for(let i=0;i<9;i++){const a=i/9*Math.PI*2,rr=9+Math.sin(e.phase+i*2.1)*2.6;const x=Math.cos(a)*rr,y=Math.sin(a)*rr;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();ctx.fill();ctx.shadowBlur=0;ctx.fillStyle="#f0646e";ctx.globalAlpha=.65;ctx.beginPath();ctx.arc(-2,-2,3,0,Math.PI*2);ctx.fill();ctx.restore();}
  }

  function drawEffects(){
    for(const p of state.projectiles){ctx.globalAlpha=p.life/p.maxLife;ctx.strokeStyle="#bafcff";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(p.x1,p.y1);ctx.lineTo(p.x2,p.y2);ctx.stroke();ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(p.x2,p.y2,3,0,Math.PI*2);ctx.fill();}
    for(const p of state.particles){ctx.globalAlpha=clamp(p.life/p.maxLife,0,1);ctx.fillStyle=p.color;ctx.fillRect(p.x-1.5,p.y-1.5,3,3);}ctx.globalAlpha=1;
  }

  function drawHover(){
    if(state.mode==="deploy"&&state.deploymentHead){
      for(const reservedKey of state.deploymentReserved){const position=fromKey(reservedKey);hexPath(position.q,position.r,.82);ctx.fillStyle="rgba(230,185,74,.11)";ctx.fill();ctx.strokeStyle="rgba(230,185,74,.58)";ctx.lineWidth=1.5;ctx.stroke();}
      hexPath(state.deploymentHead.q,state.deploymentHead.r,.68);ctx.strokeStyle="#fff1b4";ctx.lineWidth=3;ctx.stroke();
      for(const path of state.deploymentPaths){const tail=path[2];hexPath(tail.q,tail.r,.58);ctx.strokeStyle="#60d5db";ctx.lineWidth=3;ctx.stroke();}
    }
    if(!state.hover)return;const {q,r}=state.hover;hexPath(q,r,.9);let color="#aebabe";if(state.mode==="track"||state.mode==="turret"||state.mode==="mine"||state.mode==="deploy")color="#e6b94a";if(state.mode==="salvage")color="#e34747";ctx.strokeStyle=color;ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.stroke();ctx.setLineDash([]);
    if(state.mode==="track"&&state.trackStart){hexPath(state.trackStart.q,state.trackStart.r,.78);ctx.strokeStyle="#fff1b4";ctx.lineWidth=3;ctx.stroke();if(hexDistance(state.trackStart,{q,r})===1){const a=axialToWorld(state.trackStart.q,state.trackStart.r),b=axialToWorld(q,r);ctx.strokeStyle="rgba(230,185,74,.45)";ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}}
    const selected=getSelected();if(selected?.wagons&&state.mode==="select"&&isRailHex(q,r)){const path=findPath(selected,{q,r});if(path){ctx.strokeStyle="rgba(230,185,74,.38)";ctx.lineWidth=7;ctx.beginPath();let p=axialToWorld(selected.q,selected.r);ctx.moveTo(p.x,p.y);for(const h of path){p=axialToWorld(h.q,h.r);ctx.lineTo(p.x,p.y);}ctx.stroke();}}
  }

  function drawSelection(){
    const selected=getSelected();if(!selected||selected.wagons)return;const p=axialToWorld(selected.q,selected.r);ctx.strokeStyle="#fff1b4";ctx.lineWidth=1.6;ctx.setLineDash([5,3]);ctx.beginPath();ctx.arc(p.x,p.y,23,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
  }

  function render(){
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.save();ctx.translate(width/2,height/2);ctx.scale(state.camera.zoom,state.camera.zoom);ctx.translate(-state.camera.x,-state.camera.y);
    drawTerrain();drawTurretRanges();drawTracks();drawBase();drawStructures();drawSelection();drawTrains();drawEnemies();drawEffects();drawHover();drawWorldMessages();ctx.restore();
  }

  function hpBlock(object){const ratio=clamp(object.hp/object.maxHp*100,0,100);return `<div class="status-bar"><span style="width:${ratio}%"></span></div><div class="status-caption"><span>HIT POINTS</span><span>${Math.ceil(object.hp)} / ${object.maxHp}</span></div>`;}
  function energyBlock(object){const ratio=clamp(object.energy/object.maxEnergy*100,0,100);return `<div class="status-bar energy"><span style="width:${ratio}%"></span></div><div class="status-caption"><span>ENERGY</span><span>${Math.floor(object.energy)} / ${object.maxEnergy}</span></div>`;}
  function resourceBlock(node){const ratio=clamp(node.amount/node.maxAmount*100,0,100);return `<div class="status-bar resource"><span style="width:${ratio}%"></span></div><div class="status-caption"><span>RESOURCE UNITS</span><span>${Math.floor(node.amount)} / ${node.maxAmount}</span></div>`;}
  function cargoHtml(train){if(!train.wagons.length)return `<div class="action-note">No cargo wagons attached.</div>`;return `<div class="cargo-list">${train.wagons.map((w,i)=>`<div class="cargo-row ${w.type||"empty"}"><i></i><span>Wagon ${i+1} · ${w.type?w.type.toUpperCase():"EMPTY"}</span><strong>${Math.floor(w.amount)} / ${w.capacity}</strong></div>`).join("")}</div>`;}
  function baseInventoryHtml(){return `<div class="cargo-list"><div class="cargo-row material"><i></i><span>MATERIAL</span><strong>${Math.floor(state.baseMaterial)}</strong></div><div class="cargo-row energy"><i></i><span>ENERGY</span><strong>${Math.floor(state.baseEnergy)}</strong></div><div class="cargo-row stock"><i></i><span>TRACK</span><strong>${state.trackInventory}</strong></div><div class="cargo-row loco"><i></i><span>TRAIN SETS</span><strong>${state.trainInventory}</strong></div></div>`;}
  function capitalize(value){return value.charAt(0).toUpperCase()+value.slice(1);}
  function button(action,label,cls="btn-quiet",tooltip="",disabled=false){return `<button class="btn ${cls}" data-action="${action}" ${disabled?"disabled aria-disabled=\"true\"":""} ${tooltip?`data-bs-toggle="tooltip" data-bs-placement="left" title="${tooltip}"`:""}>${label}</button>`;}

  function selectionHtml(){
    const selected=getSelected();
    if(!selected)return `<div class="selection-empty">Select the Base, a Train, Track, Turret, Mine, or Resource Node on the map.</div>`;
    if(selected.type==="base")return `<div class="selection-title"><h2>Command Base</h2></div>${hpBlock(selected)}${baseInventoryHtml()}${state.mode==="deploy"?`<div class="action-note">${state.deploymentHead?"Head selected. Click a highlighted Tail point exactly two connected Track hexes away.":"Click an empty Track hex for the Head, then click a highlighted Tail point. Three connected Track hexes must be clear."}</div>`:""}<div class="panel-actions two">${button("make-track","Fabricate Track Pack","btn-command","Cost: 10 Material + 4 Energy. Adds 10 Track to inventory.")}${button("make-train","Fabricate Train Set","btn-command","Cost: 40 Material + 20 Energy. Adds one Locomotive with a Material Wagon and an Energy Wagon.")}${button("deploy-train","Deploy Train Set",state.trainInventory>0?"btn-command":"btn-quiet","Requires one Train Set and three connected empty Track hexes. Click once for the Head, then click a highlighted point for the Tail.",state.trainInventory<1)}</div>`;
    if(selected.wagons){return `<div class="selection-title"><h2>${selected.name}</h2><span class="badge-tech">${selected.route.length?"MOVING":"READY"}</span></div>${hpBlock(selected)}<div class="status-bar energy"><span style="width:${selected.fuel/selected.maxFuel*100}%"></span></div><div class="status-caption"><span>LOCOMOTIVE ENERGY</span><span>${selected.fuel.toFixed(1)} / ${selected.maxFuel}</span></div>${cargoHtml(selected)}`;}
    if(selected.type==="turret")return `<div class="selection-title"><h2>Defense Turret</h2><span class="badge-tech">AUTO</span></div><div class="selection-subtitle">Range 4 Hexes · Instantly Refills From An Adjacent Stopped Train</div>${hpBlock(selected)}${energyBlock(selected)}<div class="data-grid"><div class="data-cell"><strong>4</strong><span>HEX RANGE</span></div><div class="data-cell"><strong>${selected.energy>=1?"ONLINE":"DRY"}</strong><span>STATUS</span></div></div>`;
    if(selected.type==="mine"){const node=resourceNodeAt(selected.q,selected.r);return `<div class="selection-title"><h2>${capitalize(selected.resource)} Mine</h2><span class="badge-tech">EXTRACTOR</span></div><div class="selection-subtitle">An Adjacent Stopped Locomotive Instantly Loads Available Output</div>${hpBlock(selected)}${resourceBlock(node)}<div class="data-grid"><div class="data-cell"><strong>${Math.floor(node.amount)}</strong><span>UNITS REMAINING</span></div><div class="data-cell"><strong>${node.amount>0?"READY":"DEPLETED"}</strong><span>STATUS</span></div></div>`;}
    if(selected.type==="node")return `<div class="selection-title"><h2>${capitalize(selected.resource)} Node</h2><span class="badge-tech">FINITE</span></div>${resourceBlock(selected)}<div class="selection-subtitle">Build A Mine Here To Extract Its 1,000 Resource Units</div>`;
    if(selected.maxHp===10)return `<div class="selection-title"><h2>Rail Section</h2></div>${hpBlock(selected)}`;
    return `<div class="selection-empty">Unknown selection.</div>`;
  }

  function updateUI(force=false){
    ui.waveNumber.textContent=state.wave;ui.waveTimer.textContent=state.wavesPaused?"PAUSED":formatTime(Math.max(0,state.waveClock));ui.threatFill.style.width=`${Math.min(100,state.enemies.length*7)}%`;ui.waveToggle.textContent=state.wavesPaused?"START WAVES":"PAUSE WAVES";ui.waveToggle.classList.toggle("active",!state.wavesPaused);ui.soundToggle.textContent=state.sound?"SOUND":"MUTED";
    const center=worldToAxial(state.camera.x,state.camera.y);ui.sectorLabel.textContent=`${center.q} · ${center.r}`;
    const selectionMarkup=selectionHtml();
    if(force||selectionMarkup!==selectionCache){disposeTooltips(selectionContent);selectionContent.innerHTML=selectionMarkup;selectionCache=selectionMarkup;initializeTooltips(selectionContent);}
  }

  function initializeTooltips(root=document){if(!window.bootstrap)return;root.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(element=>bootstrap.Tooltip.getOrCreateInstance(element,{container:"body",trigger:"hover focus"}));}
  function disposeTooltips(root){if(!window.bootstrap)return;root.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(element=>bootstrap.Tooltip.getInstance(element)?.dispose());}

  function updateHoverStatus(hex){
    if(!hex){ui.hoverStatus.classList.add("d-none");ui.hoverTitle.textContent="";ui.hoverDetail.textContent="";return;}
    ui.hoverStatus.classList.remove("d-none");
    const {q,r}=hex;
    const enemy=state.enemies.find(item=>{const h=worldToAxial(item.x,item.y);return h.q===q&&h.r===r;});
    if(enemy){ui.hoverTitle.textContent="Biomass";ui.hoverDetail.textContent="Hostile · Moving Toward The Rail Network";return;}
    const trainInfo=trainSegmentAt(q,r);
    if(trainInfo){const {train,segment,index}=trainInfo;ui.hoverTitle.textContent=index===0?`${train.name} · Locomotive`:`${train.name} · Wagon ${index}`;ui.hoverDetail.textContent=index===0?`Energy ${train.fuel.toFixed(1)} · Hit Points ${Math.ceil(train.hp)}/${train.maxHp}`:`${segment.type?capitalize(segment.type):"Empty"} ${Math.floor(segment.amount)}/${segment.capacity} · Hit Points ${Math.ceil(segment.hp)}/${segment.maxHp}`;return;}
    const structure=structureAt(q,r);
    if(structure){ui.hoverTitle.textContent=structure.type==="base"?"Command Base":structure.type==="turret"?"Defense Turret":`${capitalize(structure.resource)} Mine`;const node=structure.type==="mine"?resourceNodeAt(q,r):null;ui.hoverDetail.textContent=`Hit Points ${Math.ceil(structure.hp)}/${structure.maxHp}${structure.energy!==undefined?` · Energy ${Math.floor(structure.energy)}/${structure.maxEnergy}`:""}${node?` · Resource ${Math.floor(node.amount)}/${node.maxAmount}`:""}`;return;}
    const track=state.tracks.get(key(q,r));
    if(track){ui.hoverTitle.textContent="Track";ui.hoverDetail.textContent=`Hit Points ${Math.ceil(track.hp)}/${track.maxHp}`;return;}
    const terrain=terrainAt(q,r);
    if(terrain.type==="resource"){const node=resourceNodeAt(q,r);ui.hoverTitle.textContent=`${capitalize(terrain.resource)} Node`;ui.hoverDetail.textContent=`${Math.floor(node.amount)} / ${node.maxAmount} Units Remaining`;return;}
    ui.hoverTitle.textContent=terrain.type==="water"?"Body of Water":terrain.type==="rock"?"Mountain":capitalize(terrain.type);ui.hoverDetail.textContent=terrain.type==="ground"?"Clear · Passable And Buildable":"Impassable Terrain";
  }

  function formatTime(seconds){const s=Math.max(0,Math.ceil(seconds)),m=Math.floor(s/60);return `${String(m).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;}

  canvas.addEventListener("pointerdown",e=>{sounds.init();canvas.setPointerCapture(e.pointerId);const p=state.pointer;p.down=true;p.moved=false;p.startX=p.x=e.clientX;p.startY=p.y=e.clientY;p.camX=state.camera.x;p.camY=state.camera.y;canvas.focus();});
  canvas.addEventListener("pointermove",e=>{state.hover=screenToHex(e.clientX,e.clientY);updateHoverStatus(state.hover);const p=state.pointer;if(!p.down)return;p.x=e.clientX;p.y=e.clientY;const dx=p.x-p.startX,dy=p.y-p.startY;if(Math.hypot(dx,dy)>4)p.moved=true;if(p.moved){state.camera.x=p.camX-dx/state.camera.zoom;state.camera.y=p.camY-dy/state.camera.zoom;canvas.style.cursor="grabbing";}});
  canvas.addEventListener("pointerup",e=>{const p=state.pointer;if(!p.down)return;p.down=false;canvas.style.cursor=state.mode==="select"?"default":"crosshair";if(!p.moved)handleHexClick(screenToHex(e.clientX,e.clientY));});
  canvas.addEventListener("pointerleave",()=>{state.hover=null;updateHoverStatus(null);if(!state.pointer.down)canvas.style.cursor=state.mode==="select"?"default":"crosshair";});
  canvas.addEventListener("wheel",e=>{e.preventDefault();const rect=canvas.getBoundingClientRect(),sx=e.clientX-rect.left,sy=e.clientY-rect.top;const beforeX=(sx-width/2)/state.camera.zoom+state.camera.x,beforeY=(sy-height/2)/state.camera.zoom+state.camera.y;const factor=Math.exp(-e.deltaY*.0012);state.camera.zoom=clamp(state.camera.zoom*factor,.42,2.15);state.camera.x=beforeX-(sx-width/2)/state.camera.zoom;state.camera.y=beforeY-(sy-height/2)/state.camera.zoom;},{passive:false});

  document.addEventListener("click",e=>{const modeButton=e.target.closest("[data-mode]");if(modeButton){setMode(modeButton.dataset.mode);return;}const actionButton=e.target.closest("[data-action]");if(actionButton&&!actionButton.disabled)handleAction(actionButton.dataset.action,actionButton);});
  document.addEventListener("keydown",e=>{if(e.target.matches("input,textarea"))return;if(e.key>="1"&&e.key<="5"){setMode(["select","track","turret","mine","salvage"][Number(e.key)-1]);}if(e.key==="Escape")setMode("select");});
  document.querySelectorAll("[data-mode]").forEach(button=>button.addEventListener("click",()=>sounds.init()));
  ui.waveToggle.addEventListener("click",()=>{state.wavesPaused=!state.wavesPaused;toast(state.wavesPaused?"Enemy waves paused.":"Enemy waves started.","info");updateUI(true);});
  ui.soundToggle.addEventListener("click",()=>{state.sound=!state.sound;sounds.enabled=state.sound;if(state.sound)sounds.place();updateUI(true);});
  ui.restartButton.addEventListener("click",()=>{state=makeInitialState();selectionCache="";ui.gameOver.classList.add("d-none");updateHoverStatus(null);setMode("select");toast("New Sector Initialized.","info");});
  window.addEventListener("resize",resize);
  resize();initializeTooltips();updateHoverStatus(null);updateUI(true);
  function frame(now){const dt=Math.min(.05,(now-lastTime)/1000);lastTime=now;update(dt);render();requestAnimationFrame(frame);}requestAnimationFrame(frame);
})();
