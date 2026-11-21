/** S-045: isolated real Colyseus 20-player load rehearsal, never touches dev gameplay. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { performance } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";
import { Pool } from "pg";
import { Client, type Room } from "@colyseus/sdk";
import {
  BALANCED_STATS, MERCATUM_ROOM_NAME,
  type ChatMessage, type MercatumState, type MoveRejected, type MoveAccepted,
  type SightingsReply,
} from "@mercatum/shared";

type ServerMetrics={
  at:number;rssMB:number;heapMB:number;cpuPercent:number;
  eventLoopP95Ms:number;eventLoopMaxMs:number;
};
type Health={
  worldReady:boolean;roomId:string|null;roomClients:number;
  roomMaxClients:number|null;roomLocked:boolean;activeRoomIds:string[];
};
type MoveOutcome={ok:boolean;latencyMs:number;reason?:string};
type LoadClient={
  room:Room<MercatumState>;
  joinMs:number;
  chatReceived:number;
  receivedBytes:number;
  chatTransitMs:number[];
  marketUpdatesReceived:number;
  sightingsReceived:number;
  peerUpdatesReceived:number;
  errors:string[];
  move:((result:MoveOutcome)=>void)|null;
};
const N=20;
const ROUNDS=6;
const PORT=31343;
const endpoint="http://127.0.0.1:"+PORT;
const databaseBase=process.env.DATABASE_URL??
  "postgres://mercatum:mercatum@127.0.0.1:5432/mercatum";
const schema="load_20_"+randomBytes(6).toString("hex");
const databaseUrl=new URL(databaseBase);
databaseUrl.searchParams.set("options","-csearch_path="+schema);
const admin=new Pool({connectionString:databaseBase});
const database=new Pool({connectionString:databaseUrl.toString()});
const metrics:ServerMetrics[]=[];
const participants:LoadClient[]=[];
let server:ChildProcess|null=null;
let schemaCreated=false;
let logTail="",stdoutBuffer="";
function addLog(chunk:Buffer,parse:boolean):void {
  const text=chunk.toString();
  logTail=(logTail+text).slice(-12000);
  if(!parse)return;
  stdoutBuffer+=text;
  const lines=stdoutBuffer.split("\n");
  stdoutBuffer=lines.pop()??"";
  for(const line of lines) {
    const start=line.indexOf("[MercatumLoad] ");
    if(start<0)continue;
    try{metrics.push(JSON.parse(line.slice(start+15)) as ServerMetrics);}
    catch{/* Keep raw logs for debugging. */}
  }
}
function percentile(values:readonly number[],p:number):number {
  if(values.length===0)return 0;
  const sorted=[...values].sort((a,b)=>a-b);
  const i=Math.min(sorted.length-1,Math.max(0,Math.ceil(sorted.length*p)-1));
  return Math.round(sorted[i]*100)/100;
}
function rounded(value:number):number{return Math.round(value*100)/100;}
async function waitUntil(condition:()=>Promise<boolean>|boolean,
  description:string,timeout=20000):Promise<void> {
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){
    if(await condition())return;
    await sleep(100);
  }
  throw new Error("Timeout: "+description+"\nServer log:\n"+logTail);
}
async function withTimeout<T>(promise:Promise<T>,timeout:number,label:string):Promise<T>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  const deadline=new Promise<T>((_,reject)=>{
    timer=setTimeout(()=>reject(new Error("Timeout "+label)),timeout);
  });
  try{return await Promise.race([promise,deadline]);}
  finally{if(timer)clearTimeout(timer);}
}
async function health():Promise<Health>{
  const response=await fetch(endpoint+"/health");
  if(!response.ok)throw new Error("Health HTTP "+response.status);
  return response.json() as Promise<Health>;
}
async function boot():Promise<void>{
  server=spawn(process.execPath,["dist/index.js"],{
    cwd:process.cwd(),
    env:{...process.env,PORT:String(PORT),DATABASE_URL:databaseUrl.toString(),
      MERCATUM_LOAD_METRICS:"1",MERCATUM_DISABLE_CREATURES:"0"},
    stdio:["ignore","pipe","pipe"],
  });
  server.stdout?.on("data",(chunk:Buffer)=>addLog(chunk,true));
  server.stderr?.on("data",(chunk:Buffer)=>addLog(chunk,false));
  await waitUntil(async()=>{
    if(server?.exitCode!==null)throw new Error("Server crashed: "+logTail);
    try{return (await health()).worldReady;}
    catch{return false;}
  },"load-test backend",15000);
}
async function shutdown():Promise<void>{
  const child=server;server=null;
  if(!child||child.exitCode!==null)return;
  const done=new Promise<void>(resolve=>child.once("exit",()=>resolve()));
  child.kill("SIGTERM");
  await Promise.race([done,sleep(2800)]);
  if(child.exitCode===null)child.kill("SIGKILL");
}
async function join(index:number,canonicalRoomId:string):Promise<LoadClient>{
  const start=performance.now();
  // Each new join receives its own random account token and fresh character.
  const room=await withTimeout(
    new Client(endpoint).join<MercatumState>(MERCATUM_ROOM_NAME,{stats:BALANCED_STATS}),
    30000,"join #"+(index+1),
  );
  const participant:LoadClient={
    room,joinMs:performance.now()-start,chatReceived:0,
    receivedBytes:0,chatTransitMs:[],
    marketUpdatesReceived:0,sightingsReceived:0,peerUpdatesReceived:0,
    errors:[],move:null,
  };
  participants.push(participant);
  assert.equal(room.roomId,canonicalRoomId,"No alternate world allowed");
  // The load client does not render these game events, but must subscribe to
  // them: the server broadcasts them during movement, creature ticks, and
  // player joins. Otherwise @colyseus/sdk floods stderr with 'not registered'
  // warnings, interleaving with the benchmark's structured JSON report.
  // Count the fanout instead of ignoring the packets.
  room.onMessage("market_update",()=>{participant.marketUpdatesReceived++;});
  room.onMessage("sightings",(_reply:SightingsReply)=>{
    participant.sightingsReceived++;
  });
  room.onMessage("chat_peers",()=>{
    participant.peerUpdatesReceived++;
  });
  room.onMessage("chat_message",(message:ChatMessage)=>{
    participant.chatReceived++;
    participant.receivedBytes+=Buffer.byteLength(JSON.stringify(message));
    participant.chatTransitMs.push(Math.max(0,Date.now()-message.at));
  });
  room.onMessage("chat_error",(error:{message:string})=>{
    participant.errors.push("chat: "+error.message);
  });
  room.onMessage("move_accepted",(_reply:MoveAccepted)=>{
    const finish=participant.move;participant.move=null;
    if(finish)finish({ok:true,latencyMs:0});
  });
  room.onMessage("move_rejected",(reply:MoveRejected)=>{
    const finish=participant.move;participant.move=null;
    if(finish)finish({ok:false,latencyMs:0,reason:reply.reason});
    else participant.errors.push("late movement: "+reply.reason);
  });
  room.onMessage("operation_error",(error:{message:string})=>{
    participant.errors.push("server: "+error.message);
  });
  return participant;
}
async function step(participant:LoadClient,to:{q:number;r:number}):Promise<MoveOutcome>{
  if(participant.move)throw new Error("Overlapping move request");
  const since=performance.now();
  const outcome=new Promise<MoveOutcome>(resolve=>{
    participant.move=(result)=>resolve({
      ...result,latencyMs:performance.now()-since,
    });
  });
  participant.room.send("move",{to});
  return withTimeout(outcome,12000,"movement response");
}
async function run():Promise<void>{
  console.log("[Load20] Creating disposable PostgreSQL schema "+schema);
  await admin.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated=true;
  await boot();
  const initial=await health();
  assert.equal(initial.roomMaxClients,N,"Room should have 20 slots");
  assert.ok(initial.roomId);
  const worldId=initial.roomId;
  const started=performance.now();

  // Four waves of five clients resemble real people joining, but all twenty
  // remain connected and active concurrently after the ramp.
  for(let wave=0;wave<4;wave++){
    const current=Array.from({length:5},(_,i)=>wave*5+i);
    await Promise.all(current.map(index=>join(index,worldId)));
    console.log("[Load20] Joined "+participants.length+"/20");
    if(wave<3)await sleep(200);
  }
  assert.equal(participants.length,N);
  await waitUntil(()=>participants.every(p=>p.room.state?.players?.size===N),
    "all 20 synchronized",20000);
  const full=await health();
  assert.equal(full.roomClients,N,"Health roomClients=20");
  assert.equal(full.activeRoomIds.length,1,"Single canonical world");
  // The room must NOT silently spawn a twenty-first player or new world.
  let extraRejected=false;
  try{
    const excess=await withTimeout(
      new Client(endpoint).join<MercatumState>(MERCATUM_ROOM_NAME,{stats:BALANCED_STATS}),
      6000,"21st player admission",
    );
    await excess.leave();
  }catch{extraRejected=true;}
  assert.equal(extraRejected,true,"The 21st player must be rejected");
  assert.equal((await health()).roomClients,N);

  // Six concurrent waves of legal moves, without bypassing server cooldowns.
  // All 20 players share the same safe entrance hexes; human-human overlap
  // is permitted by game design. Threat scheduler continues to run normally.
  const moveLatencies:number[]=[];
  let accepted=0,rejected=0;
  for(let round=0;round<ROUNDS;round++){
    const to=round%2===0?{q:0,r:1}:{q:0,r:0};
    const result=await Promise.all(participants.map(p=>step(p,to)));
    for(const item of result){
      if(item.ok){accepted++;moveLatencies.push(item.latencyMs);}
      else{rejected++;console.warn("[Load20] Move rejected: "+item.reason);}
    }
    if(round!==ROUNDS-1)await sleep(1270);
  }
  assert.equal(accepted,N*ROUNDS,"All legal movements must be accepted");

  // One local utterance per player: 20 sends, up to 400 received packets
  // including each sender's self echo. Each recipient is authorized by hex.
  for(let i=0;i<N;i++){
    participants[i].room.send("chat_send",{text:"Prueba de carga "+(i+1)});
  }
  await waitUntil(()=>participants.every(p=>p.chatReceived===N),
    "20x20 local chat deliveries",20000);
  const chatCount=participants.reduce((a,p)=>a+p.chatReceived,0);
  const chatApproxBytes=participants.reduce((a,p)=>a+p.receivedBytes,0);

  // Fetch each player's private sightings on an already saturated room.
  const sightings:Promise<SightingsReply>[]=[];
  for(const p of participants){
    sightings.push(withTimeout(new Promise<SightingsReply>(resolve=>
      p.room.onMessage("sightings",(packet:SightingsReply)=>resolve(packet))),
    9000,"creature map"));
    p.room.send("sightings_request");
  }
  const maps=await Promise.all(sightings);
  assert.equal(maps.length,N);
  const userCount=await database.query<{n:string}>(`
    SELECT COUNT(*)::text AS n FROM characters
  `);
  assert.equal(Number(userCount.rows[0]?.n),N,"Exactly 20 test characters");

  // Keep all 20 connections stable for a few seconds of creature ticks.
  await sleep(3000);
  assert.equal((await health()).roomClients,N,"20 users remain connected");
  const allErrors=participants.flatMap(p=>p.errors);
  assert.equal(allErrors.length,0,"No unexpected chat or server errors");

  const chatTransit=participants.flatMap(p=>p.chatTransitMs);
  const summary={
    scenario:"Mercatum S-045 / 20 concurrent players",
    roomId:worldId,
    createdAccounts:N,peakConcurrentPlayers:N,
    rejectedExtraPlayer:extraRejected,
    durationSeconds:rounded((performance.now()-started)/1000),
    join:{p50Ms:percentile(participants.map(p=>p.joinMs),.5),
      p95Ms:percentile(participants.map(p=>p.joinMs),.95)},
    movement:{attempts:N*ROUNDS,accepted,rejected,
      p50Ms:percentile(moveLatencies,.5),p95Ms:percentile(moveLatencies,.95)},
    chat:{sent:N,delivered:chatCount,p95TransitMs:percentile(chatTransit,.95),
      approxReceivedPayloadKiB:rounded(chatApproxBytes/1024)},
    sightings:{requests:maps.length,
      countPerPlayer:maps.map(x=>x.creatures.length)},
    serverEvents:{
      marketUpdatesReceived:participants.reduce((a,p)=>a+p.marketUpdatesReceived,0),
      sightingsReceived:participants.reduce((a,p)=>a+p.sightingsReceived,0),
      peerUpdatesReceived:participants.reduce((a,p)=>a+p.peerUpdatesReceived,0),
    },
    runtime:{rssPeakMB:Math.max(0,...metrics.map(x=>x.rssMB)),
      heapPeakMB:Math.max(0,...metrics.map(x=>x.heapMB)),
      cpuPeakPercent:Math.max(0,...metrics.map(x=>x.cpuPercent)),
      eventLoopP95PeakMs:Math.max(0,...metrics.map(x=>x.eventLoopP95Ms)),
      samples:metrics.length},
    errors:allErrors.length,
  };
  console.log("\n========== MERCATUM / CARGA 20 ==========\n"+
    JSON.stringify(summary,null,2)+"\n=========================================");
  console.log("[Load20] PASS — 20 connected, 120 movements, 400 chat deliveries, one world.");
  console.log("[Load20] Network KiB above reflects JSON chat payload only, not true WebSocket wire bytes.");
}
try{await run();}
catch(error){console.error("[Load20] FAIL",error);process.exitCode=1;}
finally{
  await Promise.allSettled(participants.map(x=>x.room.leave()));
  await shutdown();
  await database.end();
  if(schemaCreated)await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
  await admin.end();
}
