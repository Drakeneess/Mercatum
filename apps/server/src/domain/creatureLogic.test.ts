import assert from "node:assert/strict";
import test from "node:test";
import {
  creatureDelayMs, decideCreatureMove, hasLineOfSight, visibleToExplorer,
  woundDamage, woundedMovementDelay,
} from "./creatureLogic.js";

test("perception sees only line of sight, never a wall",()=>{
  assert.equal(hasLineOfSight({q:-3,r:0},{q:-1,r:0},true),false);
  assert.equal(visibleToExplorer({q:-3,r:0},{q:-1,r:0},5,true),false);
  assert.equal(visibleToExplorer({q:2,r:0},{q:0,r:0},3,false),false); // sealed service door
  assert.equal(visibleToExplorer({q:2,r:0},{q:0,r:0},3,true),true);
});
test("hostiles choose an adjacent reachable hex and never teleport",()=>{
  const mind={id:"stalker-01",kind:"stalker" as const,q:3,r:-2,steps:1,
    lastKnownQ:null,lastKnownR:null,searchLeft:0};
  const result=decideCreatureMove(mind,[{id:"A",q:1,r:0}],true);
  const delta=Math.abs(result.to.q-3)+Math.abs(result.to.r+2);
  assert.ok(delta>0&&delta<=2);
  assert.equal(result.lastKnownQ,1);
});
test("two entities use different speeds and hits cannot one-shot a fresh explorer",()=>{
  assert.ok(creatureDelayMs("stalker")<creatureDelayMs("scavenger"));
  assert.ok(woundDamage("stalker",1)<100);
  assert.ok(woundDamage("scavenger",1)<100);
  assert.equal(woundedMovementDelay(900,2),1260);
});
test("memory persists a last known location after target disappears",()=>{
  const mind={id:"stalker-01",kind:"stalker" as const,q:3,r:-2,steps:2,
    lastKnownQ:1,lastKnownR:0,searchLeft:2};
  const r=decideCreatureMove(mind,[],true);
  assert.equal(r.searchLeft,1);
  assert.equal(r.lastKnownQ,1);
});

test("a creature already touching its prey attacks without stepping away",()=>{
  const actor={id:"stalker-01",kind:"stalker" as const,q:4,r:-3,steps:0,
    lastKnownQ:null,lastKnownR:null,searchLeft:0};
  const result=decideCreatureMove(actor,[{id:"prey",q:4,r:-3}],false);
  assert.deepEqual(result.to,{q:4,r:-3});
  assert.equal(result.victimId,"prey");
});
