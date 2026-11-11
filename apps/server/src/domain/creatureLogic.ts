import {
  hexDistance, hexKey, hexNeighbors, makeDemoMap, SERVICE_DOOR,
  type CreatureKind, type HexCoordinate,
} from "@mercatum/shared";

export interface CreatureMind {
  id: string;
  kind: CreatureKind;
  q: number;
  r: number;
  steps: number;
  lastKnownQ: number | null;
  lastKnownR: number | null;
  searchLeft: number;
}
export interface Prey {
  id: string;
  q: number;
  r: number;
}
export interface CreatureDecision {
  to: HexCoordinate;
  lastKnownQ: number | null;
  lastKnownR: number | null;
  searchLeft: number;
  victimId: string | null;
}
const tiles = makeDemoMap();
const walls = new Set(tiles.filter(t => t.kind === "wall").map(hexKey));
const existing = new Set(tiles.map(hexKey));
const DOOR = hexKey(SERVICE_DOOR);

export function passable(tile: HexCoordinate, doorOpen: boolean): boolean {
  const key = hexKey(tile);
  return existing.has(key) && !walls.has(key) && (doorOpen || key !== DOOR);
}

function roundCube(x: number, y: number, z: number): HexCoordinate {
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return {q: rx, r: rz};
}

/** A wall or locked door blocks vision, even if the endpoints are close. */
export function hasLineOfSight(a: HexCoordinate, b: HexCoordinate, open: boolean): boolean {
  const distance = hexDistance(a,b);
  if (distance === 0) return true;
  for (let i=1; i<distance; i++) {
    const t=i/distance;
    const x=a.q + (b.q-a.q)*t;
    const z=a.r + (b.r-a.r)*t;
    const y= -x-z;
    if (!passable(roundCube(x,y,z), open)) return false;
  }
  return true;
}

export function visibleToExplorer(
  creature: HexCoordinate, explorer: HexCoordinate, perception: number, doorOpen: boolean,
): boolean {
  const radius = Math.max(1, Math.min(4, 1 + Math.trunc(perception)));
  return hexDistance(creature,explorer) <= radius &&
    hasLineOfSight(creature,explorer,doorOpen);
}

function nextStepToward(
  from: HexCoordinate, target: HexCoordinate, doorOpen: boolean,
): HexCoordinate | null {
  if (hexKey(from)===hexKey(target)) return from;
  const visited = new Set([hexKey(from)]);
  const queue: Array<{tile:HexCoordinate;first:HexCoordinate|null}> = [{tile:from,first:null}];
  for(let i=0;i<queue.length;i++){
    const current=queue[i];
    for(const neighbor of hexNeighbors(current.tile)){
      const key=hexKey(neighbor);
      if(visited.has(key)||!passable(neighbor,doorOpen))continue;
      const first=current.first??neighbor;
      if(key===hexKey(target))return first;
      visited.add(key);
      queue.push({tile:neighbor,first});
    }
  }
  return null;
}

/** All decisions come from the server's private world, never client coordinates. */
export function decideCreatureMove(
  creature: CreatureMind,
  characters: readonly Prey[],
  doorOpen: boolean,
): CreatureDecision {
  const from={q:creature.q,r:creature.r};
  const senseRange=creature.kind==="stalker"?4:3;
  const detectable=characters.filter(prey=>
    hexDistance(from,prey)<=senseRange && hasLineOfSight(from,prey,doorOpen)
  ).sort((a,b)=>hexDistance(from,a)-hexDistance(from,b) || a.id.localeCompare(b.id));
  const prey=detectable[0];
  let knownQ=creature.lastKnownQ;
  let knownR=creature.lastKnownR;
  let search=creature.searchLeft;
  let goal:HexCoordinate|null=null;
  if(prey){
    goal={q:prey.q,r:prey.r};
    knownQ=prey.q; knownR=prey.r; search=3;
  }else if(knownQ!==null&&knownR!==null&&search>0){
    goal={q:knownQ,r:knownR};
    search--;
  }

  let to:HexCoordinate|null=goal?nextStepToward(from,goal,doorOpen):null;
  // If a creature and its prey already share a hex, it attacks here instead
  // of accidentally wandering away before resolving the contact.
  if(prey && prey.q===from.q && prey.r===from.r){
    return {
      to:from, lastKnownQ:knownQ, lastKnownR:knownR, searchLeft:search,
      victimId:prey.id,
    };
  }
  if(!to||hexKey(to)===hexKey(from)){
    // Rotation is deterministic and persisted (steps). No random global ticks.
    const neighbors=hexNeighbors(from).filter(n=>passable(n,doorOpen));
    if(neighbors.length){
      const seed=[...creature.id].reduce((n,c)=>n+c.charCodeAt(0),0);
      to=neighbors[(seed+creature.steps)%neighbors.length];
    }
    if(!prey&&search===0){knownQ=null;knownR=null;}
  }
  const destination=to??from;
  const victim=characters.find(p=>p.q===destination.q&&p.r===destination.r);
  return {
    to:destination,lastKnownQ:knownQ,lastKnownR:knownR,searchLeft:search,
    victimId:victim?.id??null,
  };
}

export function creatureDelayMs(kind:CreatureKind):number {
  return kind==="stalker"?950:2100;
}
export function woundDamage(kind:CreatureKind, endurance:number):number {
  return Math.max(kind==="stalker"?12:7,(kind==="stalker"?37:20)-3*endurance);
}
export function woundedMovementDelay(base:number,wounds:number):number {
  return base + Math.max(0,Math.min(5,wounds))*180;
}
