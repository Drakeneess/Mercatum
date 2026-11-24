import assert from "node:assert/strict";
import test from "node:test";
import {
  CHAT_MAX_CHARS, ChatThrottle, chatReachable, parseChatText,
} from "./chatRules.js";
test("no global chat; only living nearby explorers in the same interior",()=>{
  const a={phase:"inside" as const,health:100,q:0,r:0};
  assert.equal(chatReachable(a,{...a,q:1},true),true);
  assert.equal(chatReachable(a,{...a,q:2},true),true);
  assert.equal(chatReachable(a,{...a,q:3},true),false);
  assert.equal(chatReachable(a,{...a,phase:"outside"},true),false);
  assert.equal(chatReachable({...a,phase:"outside"},{...a,phase:"outside"},true),false);
  assert.equal(chatReachable(a,{...a,phase:"dead"},true),false);
  assert.equal(chatReachable(a,{...a,health:0},true),false);
});
test("a locked door and wall block acoustic line of sight",()=>{
  const one={phase:"inside" as const,health:100,q:0,r:0};
  const behindDoor={...one,q:2,r:0};
  assert.equal(chatReachable(one,behindDoor,false),false);
  assert.equal(chatReachable(one,behindDoor,true),true);
  const acrossWall={...one,q:-1,r:0};
  const beforeWall={...one,q:-3,r:0};
  assert.equal(chatReachable(beforeWall,acrossWall,true),false);
});
test("chat validation prevents empty, control-only and oversized packets",()=>{
  assert.equal(parseChatText("  hola  \n  mundo  "),"hola mundo");
  assert.equal(parseChatText("<b>hola</b>"),"<b>hola</b>");
  assert.equal(parseChatText(" \u0000\n"),null);
  assert.equal(parseChatText("x".repeat(CHAT_MAX_CHARS+1)),null);
  assert.equal(parseChatText(null),null);
});
test("rate limiter enforces spacing and total messages in rolling window",()=>{
  const throttle=new ChatThrottle();
  assert.equal(throttle.allowed("a",100_000),true);
  assert.equal(throttle.allowed("a",100_010),false);
  for(const time of [101_400,102_800,104_200,105_600])
    assert.equal(throttle.allowed("a",time),true);
  assert.equal(throttle.allowed("a",107_000),false);
  assert.equal(throttle.allowed("b",107_000),true);
  assert.equal(throttle.allowed("a",112_010),true);
});

test("an edge wall stops even adjacent voices",()=>{
  const a={phase:"inside" as const,health:100,q:0,r:-3};
  const b={...a,r:-2};
  assert.equal(chatReachable(a,b,true),false);
  assert.equal(chatReachable(b,a,true),false);
});
