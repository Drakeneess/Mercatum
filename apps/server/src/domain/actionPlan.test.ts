import assert from "node:assert/strict";
import test from "node:test";
import { MercatumPlayer } from "@mercatum/shared";
import { planAction } from "./actionPlan.js";

const actor=()=>new MercatumPlayer({q:0,r:0,strength:2,intellect:2,inside:true});
test("opening a door is timed and uses the chosen attribute",()=>{
  const force=planAction(actor(),{kind:"open",method:"force"},false,[]);
  const analyze=planAction(actor(),{kind:"open",method:"intellect"},false,[]);
  assert.equal(force.ok,true);
  assert.equal(analyze.ok,true);
  if(force.ok&&analyze.ok)assert.ok(force.duration<analyze.duration);
});
test("an outside player cannot interact",()=>{
  const p=actor();p.inside=false;
  const result=planAction(p,{kind:"extract"},false,[]);
  assert.equal(result.ok,false);
});
test("an object must be nearby and cannot be forged",()=>{
  const far=[{id:"00000000-0000-4000-8000-000000000001",label:"Navaja",weight:2,condition:34,q:4,r:0}];
  assert.equal(planAction(actor(),{kind:"take",itemId:far[0].id},false,far).ok,false);
  assert.equal(planAction(actor(),{kind:"take",itemId:"bad"},false,far).ok,false);
});
