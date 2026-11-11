/** V1 integration smoke: a single durable object cannot be duplicated and survives server restart. */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { Client, type Room } from "@colyseus/sdk";
import {
  BALANCED_STATS, MERCATUM_ROOM_NAME,
  type ActionResult, type IdentityReply, type MercatumState,
  type WorldItemsReply,
} from "@mercatum/shared";

const PORT=31238;
const url=`http://127.0.0.1:${PORT}`;
let server:ChildProcess|null=null;
let logs="";

async function eventually(check:()=>boolean|Promise<boolean>, label:string, timeout=10_000):Promise<void>{
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){
    if(await check())return;
    await sleep(80);
  }
  throw new Error(`Timed out: ${label}. Logs:\n${logs.slice(-5000)}`);
}
async function boot():Promise<void>{
  server=spawn(process.execPath,["dist/index.js"],{
    cwd:process.cwd(),env:{...process.env,PORT:String(PORT)},
    stdio:["ignore","pipe","pipe"],
  });
  server.stdout?.on("data",(chunk:Buffer)=>{logs+=chunk.toString();});
  server.stderr?.on("data",(chunk:Buffer)=>{logs+=chunk.toString();});
  await eventually(async ()=>{
    if(server?.exitCode!==null)throw new Error("Backend exited early: "+logs);
    try{
      const response=await fetch(url+"/health");
      const body=await response.json() as {worldJoinable?:boolean};
      return response.ok&&body.worldJoinable===true;
    }catch{return false;}
  },"server ready");
}
async function stop():Promise<void>{
  const child=server;
  if(!child)return;
  server=null;
  if(child.exitCode!==null)return;
  const done=new Promise<void>(resolve=>child.once("exit",()=>resolve()));
  child.kill("SIGTERM");
  await Promise.race([done,sleep(3000)]);
}
function nextMessage<T>(room:Room<MercatumState>,type:string):Promise<T>{
  return new Promise<T>(resolve=>room.onMessage(type,(payload:T)=>resolve(payload)));
}
async function identity(room:Room<MercatumState>):Promise<IdentityReply>{
  const ready=nextMessage<IdentityReply>(room,"identity");
  room.send("identity_request");
  return Promise.race([ready,sleep(3500).then(()=>{throw new Error("Missing private identity");})]);
}
async function world(room:Room<MercatumState>):Promise<WorldItemsReply>{
  const ready=nextMessage<WorldItemsReply>(room,"world_items");
  room.send("world_request");
  return ready;
}
async function actionOutcome(room:Room<MercatumState>,request:unknown):Promise<{ok:boolean;message:string}>{
  const reply=new Promise<{ok:boolean;message:string}>(resolve=>{
    room.onMessage("action_result",(p:ActionResult)=>resolve({ok:true,message:p.message}));
    room.onMessage("operation_error",(p:{message:string})=>resolve({ok:false,message:p.message}));
  });
  room.send("action",request);
  return Promise.race([reply,sleep(5000).then(()=>{throw new Error("Action response timed out");})]);
}
async function run():Promise<void>{
  await boot();
  const sdk=new Client(url);
  const a=await sdk.join<MercatumState>(MERCATUM_ROOM_NAME,{stats:BALANCED_STATS});
  const b=await sdk.join<MercatumState>(MERCATUM_ROOM_NAME,{stats:BALANCED_STATS});
  const first=await identity(a);
  const second=await identity(b);
  assert.notEqual(first.characterId,second.characterId);
  assert.match(first.token,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(first.phase,"inside");

  // A token denotes exactly one connected character, not multiple replicas.
  await assert.rejects(sdk.join(MERCATUM_ROOM_NAME,{token:first.token}),/conectado|409/i);

  const w=await world(a);
  assert.ok(w.items.some(x=>x.label==="Navaja oxidada"),"seeded unique object");
  if(!w.doorOpen){
    const opened=await actionOutcome(a,{kind:"open",method:"force"});
    assert.equal(opened.ok,true,opened.message);
  }
  await eventually(()=>a.state?.doorOpen===true&&b.state?.doorOpen===true,"door shared");

  a.send("move",{to:{q:1,r:0}});
  b.send("move",{to:{q:1,r:0}});
  await eventually(()=>a.state?.players?.get(a.sessionId)?.q===1&&b.state?.players?.get(b.sessionId)?.q===1,"both near loot");

  const item=(await world(a)).items.find(x=>x.label==="Navaja oxidada");
  assert.ok(item);
  const [ra,rb]=await Promise.all([
    actionOutcome(a,{kind:"take",itemId:item.id}),
    actionOutcome(b,{kind:"take",itemId:item.id}),
  ]);
  assert.equal(Number(ra.ok)+Number(rb.ok),1,"exactly one winner");
  const winner=ra.ok?a:b;
  const loser=ra.ok?b:a;
  const taken=await identity(winner);
  const lost=await identity(loser);
  assert.equal(taken.inventory.filter(x=>x.id===item.id).length,1);
  assert.equal(lost.inventory.filter(x=>x.id===item.id).length,0);
  assert.equal((await world(winner)).items.some(x=>x.id===item.id),false);

  winner.send("move",{to:{q:0,r:0}});
  await eventually(()=>winner.state?.players?.get(winner.sessionId)?.q===0,"return to entrance");
  const extracted=await actionOutcome(winner,{kind:"extract"});
  assert.equal(extracted.ok,true,extracted.message);
  const deposited=await identity(winner);
  assert.equal(deposited.phase,"outside");
  assert.equal(deposited.inventory.length,0);
  assert.equal(deposited.stash.filter(x=>x.id===item.id).length,1);
  const token=deposited.token,characterId=deposited.characterId;

  await a.leave();await b.leave();
  await stop();

  // A new room process is created, but data survives in PostgreSQL.
  await boot();
  const returned=await new Client(url).join<MercatumState>(MERCATUM_ROOM_NAME,{token});
  try{
    const restored=await identity(returned);
    assert.equal(restored.characterId,characterId);
    assert.equal(restored.phase,"outside");
    assert.equal(restored.stash.filter(x=>x.id===item.id).length,1);
    assert.equal((await world(returned)).items.some(x=>x.id===item.id),false);
  }finally{await returned.leave();}
  console.log("V1 smoke passed: unique pickup, atomic extraction, stable identity and restart persistence.");
}

try{await run();}
catch(error){console.error(error);process.exitCode=1;}
finally{await stop();}
