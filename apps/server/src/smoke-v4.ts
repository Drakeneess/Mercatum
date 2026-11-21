/** V4 smoke: local audible audience, account-level blocks and report evidence. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { Pool } from "pg";
import { Client, type Room } from "@colyseus/sdk";
import {
  BALANCED_STATS, MERCATUM_ROOM_NAME,
  type ChatMessage, type ChatPeersReply, type IdentityReply, type MercatumState,
} from "@mercatum/shared";

const PORT=31340, url=`http://127.0.0.1:${PORT}`;
const base=process.env.DATABASE_URL??"postgres://mercatum:mercatum@127.0.0.1:5432/mercatum";
const schema="v4_smoke_"+randomBytes(6).toString("hex");
const dbUrl=new URL(base);dbUrl.searchParams.set("options",`-csearch_path=${schema}`);
const admin=new Pool({connectionString:base});
const db=new Pool({connectionString:dbUrl.toString()});
let server:ChildProcess|null=null,prepared=false,logs="";
async function eventually(check:()=>boolean|Promise<boolean>,name:string,ms=9000){
  const deadline=Date.now()+ms;
  while(Date.now()<deadline){
    if(await check())return;
    await sleep(60);
  }
  throw new Error("V4 timeout "+name+"; "+logs.slice(-3000));
}
async function boot(){
  server=spawn(process.execPath,["dist/index.js"],{
    cwd:process.cwd(),
    env:{...process.env,PORT:String(PORT),DATABASE_URL:dbUrl.toString(),
      MERCATUM_DISABLE_CREATURES:"1"},
    stdio:["ignore","pipe","pipe"],
  });
  server.stdout?.on("data",(chunk:Buffer)=>{logs+=chunk.toString();});
  server.stderr?.on("data",(chunk:Buffer)=>{logs+=chunk.toString();});
  await eventually(async()=>{
    if(server?.exitCode!==null)throw new Error("Backend exited "+logs);
    try{
      const r=await fetch(url+"/health");
      const data=await r.json() as {worldJoinable?:boolean};
      return r.ok&&data.worldJoinable===true;
    }catch{return false;}
  },"server start");
}
async function stop(){
  if(!server)return;
  const child=server;server=null;
  if(child.exitCode!==null)return;
  const exited=new Promise<void>(resolve=>child.once("exit",()=>resolve()));
  child.kill("SIGTERM");await Promise.race([exited,sleep(2500)]);
}
function once<T>(room:Room<MercatumState>,key:string):Promise<T>{
  return new Promise(resolve=>room.onMessage(key,(payload:T)=>resolve(payload)));
}
async function identity(room:Room<MercatumState>):Promise<IdentityReply>{
  const result=once<IdentityReply>(room,"identity");room.send("identity_request");return result;
}
async function peers(room:Room<MercatumState>):Promise<ChatPeersReply>{
  const result=once<ChatPeersReply>(room,"chat_peers");
  room.send("chat_peers_request");return result;
}
async function notice(room:Room<MercatumState>,key:string,body:unknown):Promise<string>{
  const result=once<{message:string}>(room,"chat_notice");
  room.send(key,body);return (await result).message;
}
async function run(){
  await admin.query(`CREATE SCHEMA "${schema}"`);prepared=true;await boot();
  const browser=new Client(url);
  const rooms:Room<MercatumState>[]=[];
  const a=await browser.join<MercatumState>(MERCATUM_ROOM_NAME,{stats:BALANCED_STATS});
  const b=await browser.join<MercatumState>(MERCATUM_ROOM_NAME,{stats:BALANCED_STATS});
  const c=await browser.join<MercatumState>(MERCATUM_ROOM_NAME,{stats:BALANCED_STATS});
  rooms.push(a,b,c);
  const [ia,ib,ic]=await Promise.all([identity(a),identity(b),identity(c)]);
  assert.ok((await peers(a)).peers.some(p=>p.characterId===ib.characterId));
  assert.ok((await peers(a)).peers.some(p=>p.characterId===ic.characterId));

  // Move a third listener to a distant sector position, then rejoin to make
  // both in-memory room state and PostgreSQL agree on the actor's coordinates.
  await c.leave();rooms.pop();
  await db.query("UPDATE characters SET q=4,r=-3 WHERE id=$1",[ic.characterId]);
  const far=await browser.join<MercatumState>(MERCATUM_ROOM_NAME,{token:ic.token});
  rooms.push(far);
  assert.equal((await peers(far)).peers.length,0);
  assert.equal((await peers(a)).peers.some(p=>p.characterId===ic.characterId),false);
  const aMessages:ChatMessage[]=[],bMessages:ChatMessage[]=[],farMessages:ChatMessage[]=[];
  a.onMessage("chat_message",(m:ChatMessage)=>aMessages.push(m));
  b.onMessage("chat_message",(m:ChatMessage)=>bMessages.push(m));
  far.onMessage("chat_message",(m:ChatMessage)=>farMessages.push(m));
  const firstText="No pases por esa puerta: hay ruido en el pasillo.";
  a.send("chat_send",{text:firstText});
  await eventually(()=>aMessages.length===1&&bMessages.length===1,"delivery to nearby speaker");
  assert.equal(bMessages[0].text,firstText);
  assert.equal(bMessages[0].senderCharacterId,ia.characterId);
  assert.equal(aMessages[0].self,true);
  assert.equal(bMessages[0].self,false);
  await sleep(230);
  assert.equal(farMessages.length,0,"far-off player must never receive a local message");

  // Sending immediately again cannot generate another chat entry.
  const speedError=once<{message:string}>(a,"chat_error");
  a.send("chat_send",{text:"spam"});
  assert.match((await speedError).message,/demasiado rápido/i);
  assert.equal(bMessages.length,1);
  const spoofReport=once<{message:string}>(a,"chat_error");
  a.send("chat_report",{messageId:randomUUID(),reason:"harassment"});
  assert.match((await spoofReport).message,/recibiste recientemente/i);

  // Mute is one-way. The author's self echo still works, the recipient sees nothing.
  assert.match(await notice(b,"chat_preference",{characterId:ia.characterId,mode:"mute"}),/silenciado/i);
  await sleep(1400);
  a.send("chat_send",{text:"Esto no debe aparecer para quien me silenció"});
  await eventually(()=>aMessages.length===2,"sender echo after mute");
  await sleep(220);
  assert.equal(bMessages.length,1,"mute blocks delivery to the owner only");

  // Report the ACTUAL first message, not client-provided fabricated evidence.
  const reportText=await notice(b,"chat_report",{
    messageId:bMessages[0].id,reason:"harassment",
  });
  assert.match(reportText,/registrado/i);
  const reports=await db.query<{reason:string;evidence_text:string}>(`
    SELECT reason,evidence_text FROM chat_reports
  `);
  assert.equal(reports.rows.length,1);
  assert.equal(reports.rows[0].evidence_text,firstText);
  assert.equal(reports.rows[0].reason,"harassment");

  assert.match(await notice(b,"chat_preference",{characterId:ia.characterId,mode:"block"}),/bloqueado/i);
  assert.equal((await peers(b)).peers.some(p=>p.characterId===ia.characterId),false);
  await sleep(1400);
  a.send("chat_send",{text:"Mensaje desde persona bloqueada"});
  await eventually(()=>aMessages.length===3,"sender echo after block");
  await sleep(220);
  assert.equal(bMessages.length,1);
  const noGlobal=await db.query<{n:string}>(`SELECT COUNT(*)::text AS n FROM chat_reports`);
  assert.equal(Number(noGlobal.rows[0].n),1,"ordinary messages must not be stored in report table");

  // Preferences survive reconnect and belong to the account, not the character.
  await b.leave();
  const bReturn=await browser.join<MercatumState>(MERCATUM_ROOM_NAME,{token:ib.token});
  rooms.push(bReturn);
  const prefs=await peers(bReturn);
  assert.ok(prefs.preferences.some(p=>p.mode==="block"&&p.name.startsWith("Explorador-")));
  assert.equal(prefs.peers.some(p=>p.characterId===ia.characterId),false);
  const restored=await identity(bReturn);
  assert.equal(restored.characterId,ib.characterId);

  // The user can deliberately unblock, without a moderator.
  assert.match(await notice(bReturn,"chat_preference",{
    characterId:ia.characterId,mode:"none",
  }),/levantada/i);
  await eventually(async()=>(await peers(bReturn)).peers.some(p=>
    p.characterId===ia.characterId),"unblock and proximity restored");
  for(const room of rooms)await room.leave().catch(()=>undefined);
  console.log("V4 smoke passed: proximity, no global delivery, throttle, mute/block, verified report and reconnect.");
}
try{await run();}
catch(error){console.error(error);process.exitCode=1;}
finally{
  await stop();await db.end();
  if(prepared)await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
  await admin.end();
}
