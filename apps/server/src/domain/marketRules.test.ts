import assert from "node:assert/strict";
import test from "node:test";
import { purchasePrice, salePrice, safeAmount, isUuid, tradeAllowed } from "./marketRules.js";
test("trade must be an intentional nearby or exterior encounter",()=>{
  const a={q:0,r:0,health:100,phase:"inside" as const};
  assert.equal(tradeAllowed(a,{...a,q:1}),true);
  assert.equal(tradeAllowed(a,{...a,q:3}),false);
  assert.equal(tradeAllowed({...a,phase:"outside"},{...a,phase:"outside"}),true);
  assert.equal(tradeAllowed({...a,phase:"dead"},{...a,phase:"dead"}),false);
  assert.equal(tradeAllowed(a,{...a,health:0}),false);
});
test("merchant cannot generate profitable buyback cycles",()=>{
  for(const condition of [0,1,34,75,100]) for(const trato of [1,2,3,5]){
    const buy=purchasePrice(45,condition,trato);
    const sell=salePrice(45,condition,trato);
    assert.ok(buy>=sell);
  }
  assert.ok(purchasePrice(50,20,2)<purchasePrice(50,100,2));
});
test("only whole nonnegative amounts and canonical UUIDs are accepted",()=>{
  for(const bad of [-1,1.2,NaN,Infinity,100001,"15",null])assert.equal(safeAmount(bad),null);
  assert.equal(safeAmount(0),0);
  assert.equal(isUuid("00000000-0000-4000-8000-000000000101"),true);
  assert.equal(isUuid("0' OR 1=1--"),false);
});
