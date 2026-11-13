import assert from "node:assert/strict";
import test from "node:test";
import {
  creatureDelayMs, creatureAttackCooldownMs, canDealContactDamage, decideCreatureMove, hasLineOfSight,
  inProtectedThreshold, postHitRecoveryMs, visibleToExplorer,
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
  const result=decideCreatureMove(mind,[{id:"A",q:2,r:0}],true);
  const delta=Math.abs(result.to.q-3)+Math.abs(result.to.r+2);
  assert.ok(delta>0&&delta<=2);
  assert.equal(result.lastKnownQ,2);
});
test("two entities use different speeds and hits cannot one-shot a fresh explorer",()=>{
  assert.ok(creatureDelayMs("stalker")<creatureDelayMs("scavenger"));
  assert.ok(woundDamage("stalker",1)<100);
  assert.ok(woundDamage("scavenger",1)<100);
  assert.equal(woundedMovementDelay(900,2),1060);
});
test("memory persists a last known location after target disappears",()=>{
  const mind={id:"stalker-01",kind:"stalker" as const,q:3,r:-2,steps:2,
    lastKnownQ:2,lastKnownR:0,searchLeft:2};
  const r=decideCreatureMove(mind,[],true);
  assert.equal(r.searchLeft,1);
  assert.equal(r.lastKnownQ,2);
});

test("a creature already touching its prey attacks without stepping away",()=>{
  const actor={id:"stalker-01",kind:"stalker" as const,q:4,r:-3,steps:0,
    lastKnownQ:null,lastKnownR:null,searchLeft:0};
  const result=decideCreatureMove(actor,[{id:"prey",q:4,r:-3}],false);
  assert.deepEqual(result.to,{q:4,r:-3});
  assert.equal(result.victimId,"prey");
});

test("the entrance and its immediate approaches cannot be camped or attacked",()=>{
  assert.equal(inProtectedThreshold({q:0,r:0}),true);
  assert.equal(inProtectedThreshold({q:1,r:0}),true);
  assert.equal(inProtectedThreshold({q:2,r:0}),false);
  const mind={id:"stalker-01",kind:"stalker" as const,q:1,r:0,steps:1,
    lastKnownQ:0,lastKnownR:0,searchLeft:2};
  const move=decideCreatureMove(mind,[{id:"entry",q:0,r:0}],true);
  assert.ok(!inProtectedThreshold(move.to));
  assert.equal(move.victimId,null);
  assert.equal(move.lastKnownQ,null);
  const outside={...mind,q:2,r:0};
  const decision=decideCreatureMove(outside,[{id:"entry",q:1,r:0}],true);
  assert.equal(decision.victimId,null);
  assert.ok(!inProtectedThreshold(decision.to));
});
test("players have an actionable lead and repeated attacks are individually paced",()=>{
  for(const dex of [1,2,3]){
    const walk=[0,1200,1050,900][dex];
    assert.ok(creatureDelayMs("stalker")>walk);
  }
  assert.ok(creatureDelayMs("scavenger")>creatureDelayMs("stalker"));
  assert.ok(creatureAttackCooldownMs("stalker")>creatureDelayMs("stalker"));
  assert.ok(postHitRecoveryMs()>creatureDelayMs("scavenger"));
  assert.ok(woundDamage("stalker",1)<30);
  assert.ok(woundDamage("scavenger",1)<20);
  assert.equal(woundedMovementDelay(1200,5),1600);
});

test("a contact must respect persisted creature cooldown, player recovery and entry grace",()=>{
  const position={q:3,r:0};
  assert.equal(canDealContactDamage(position,10_000,8_000,9_000,0),true);
  assert.equal(canDealContactDamage(position,10_000,12_000,9_000,0),false);
  assert.equal(canDealContactDamage(position,10_000,8_000,11_000,0),false);
  assert.equal(canDealContactDamage(position,10_000,8_000,9_000,15_000),false);
  assert.equal(canDealContactDamage({q:1,r:0},10_000,0,0,0),false);
});
test("an old memory inside the entry threshold is discarded",()=>{
  const mind={id:"stalker-01",kind:"stalker" as const,q:3,r:0,steps:3,
    lastKnownQ:0,lastKnownR:0,searchLeft:2};
  const decision=decideCreatureMove(mind,[],true);
  assert.equal(decision.lastKnownQ,null);
  assert.equal(decision.searchLeft,0);
  assert.ok(!inProtectedThreshold(decision.to));
});
