/** V2 smoke: autonomous hostiles damage an offline explorer and death persists. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { Pool } from "pg";
import { Client, type Room } from "@colyseus/sdk";
import {
  BALANCED_STATS, MERCATUM_ROOM_NAME, type IdentityReply,
  type MercatumState, type SightingsReply,
} from "@mercatum/shared";

const PORT=31239;
const url=`http://127.0.0.1:${PORT}`;
const dbBase=process.env.DATABASE_URL??"postgres://mercatum:mercatum@127.0.0.1:5432/mercatum";
const schema="v2_smoke_"+randomBytes(6).toString("hex");
const isolatedUrl=new URL(dbBase);
isolatedUrl.searchParams.set("options",`-csearch_path=${schema}`);
const admin=new Pool({connectionString:dbBase});
const db=new Pool({connectionString:isolatedUrl.toString()});
let server:ChildProcess|null=null;
let prepared=false;
let logs="";

async function eventually(check:()=>Promise<boolean>|boolean,label:string,timeout=12_000){
  const until=Date.now()+timeout;
  while(Date.now()<until){
    if(await check())return;
    await sleep(100);
  }
  throw new Error(`Timed out: ${label}. Logs:\n${logs.slice(-5000)}`);
}
async function boot(creaturesEnabled:boolean){
  server=spawn(process.execPath,["dist/index.js"],{
    cwd:process.cwd(),
    env:{
      ...process.env,PORT:String(PORT),DATABASE_URL:isolatedUrl.toString(),
      MERCATUM_DISABLE_CREATURES:creaturesEnabled?"0":"1",
    },
    stdio:["ignore","pipe","pipe"],
  });
  server.stdout?.on("data",(b:Buffer)=>{logs+=b.toString();});
  server.stderr?.on("data",(b:Buffer)=>{logs+=b.toString();});
  await eventually(async()=>{
    if(server?.exitCode!==null)throw new Error("Backend exited early: "+logs);
    try{
      const response=await fetch(url+"/health");
      const json=await response.json() as {worldJoinable?:boolean};
      return response.ok&&json.worldJoinable===true;
    }catch{return false;}
  },"backend ready");
}
async function stop(){
  const child=server;if(!child)return;server=null;
  if(child.exitCode!==null)return;
  const done=new Promise<void>(resolve=>child.once("exit",()=>resolve()));
  child.kill("SIGTERM");
  await Promise.race([done,sleep(3000)]);
}
function message<T>(room:Room<MercatumState>,key:string):Promise<T>{
  return new Promise<T>(resolve=>room.onMessage(key,(p:T)=>resolve(p)));
}
async function identity(room:Room<MercatumState>):Promise<IdentityReply>{
  const reply=message<IdentityReply>(room,"identity");
  room.send("identity_request");
  return Promise.race([reply,sleep(3500).then(()=>{throw new Error("No identity reply");})]);
}
async function run(){
  await admin.query(`CREATE SCHEMA "${schema}"`);
  prepared=true;
  await boot(false);
  const sdk=new Client(url);
  const room=await sdk.join<MercatumState>(MERCATUM_ROOM_NAME,{stats:BALANCED_STATS});
  const first=await identity(room);
  assert.equal(first.health,100);
  assert.equal(first.wounds,0);
  assert.equal(first.phase,"inside");
  assert.ok(!("creatures" in room.state),"hidden creatures are not in the public Schema");
  const sightings=message<SightingsReply>(room,"sightings");
  room.send("sightings_request");
  const initial=await sightings;
  assert.deepEqual(initial.creatures,[],"both creatures start beyond perception");
  await room.leave();
  await stop();

  const charId=first.characterId;
  const stashId=randomUUID();
  await db.query(`
    UPDATE characters SET q=4,r=-3 WHERE id=$1 AND phase='inside'
  `,[charId]);
  await db.query(`
    UPDATE market_objects SET state='carried',owner_character_id=$1,q=NULL,r=NULL
    WHERE label='Navaja oxidada'
  `,[charId]);
  await db.query(`
    INSERT INTO market_objects(id,label,weight,condition,state,owner_character_id)
    VALUES($1,'Moneda del depósito',1,90,'stash',$2)
  `,[stashId,charId]);
  await db.query(`
    UPDATE creatures SET q=4,r=-3,next_action_at=0
    WHERE id='stalker-01'
  `);
  await db.query(`
    UPDATE creatures SET next_action_at=$1
    WHERE id='scavenger-01'
  `,[Date.now()+60000]);

  // An offline explorer remains in the world, and is not immune to predators.
  await boot(true);
  await eventually(async()=>{
    const r=await db.query<{phase:string}>("SELECT phase FROM characters WHERE id=$1",[charId]);
    return r.rows[0]?.phase==="dead";
  },"offline permadeath",15000);
  const state=await db.query<{health:number;wounds:number;phase:string}>(`
    SELECT health,wounds,phase FROM characters WHERE id=$1
  `,[charId]);
  assert.equal(state.rows[0].health,0);
  assert.equal(state.rows[0].phase,"dead");
  assert.ok(state.rows[0].wounds>1,"requires repeated attacks");
  const attackCount=await db.query<{total:string}>(`
    SELECT count(*)::text AS total FROM event_log
    WHERE kind='creature_attack' AND character_id=$1
  `,[charId]);
  assert.ok(Number(attackCount.rows[0].total)>=2);

  const dropped=await db.query<{state:string;owner_character_id:string|null;q:number;r:number}>(`
    SELECT state,owner_character_id,q,r FROM market_objects
    WHERE label='Navaja oxidada'
  `);
  assert.equal(dropped.rows[0].state,"ground");
  assert.equal(dropped.rows[0].owner_character_id,null);
  assert.deepEqual({q:dropped.rows[0].q,r:dropped.rows[0].r},{q:4,r:-3});

  const corpse=await new Client(url).join<MercatumState>(MERCATUM_ROOM_NAME,{token:first.token});
  const deathRecord=await identity(corpse);
  assert.equal(deathRecord.phase,"dead");
  assert.equal(deathRecord.characterId,charId);
  await corpse.leave();

  const successor=await new Client(url).join<MercatumState>(
    MERCATUM_ROOM_NAME,{token:first.token,stats:BALANCED_STATS},
  );
  try{
    const fresh=await identity(successor);
    assert.notEqual(fresh.characterId,charId);
    assert.equal(fresh.phase,"inside");
    assert.equal(fresh.health,100);
    assert.equal(fresh.stash.filter(x=>x.id===stashId).length,1);
    assert.equal(fresh.inventory.length,0);
    assert.equal(fresh.token,first.token);
    const old=await db.query<{phase:string}>("SELECT phase FROM characters WHERE id=$1",[charId]);
    assert.equal(old.rows[0].phase,"dead","old explorer remains permanently deceased");
  }finally{await successor.leave();}
  console.log("V2 smoke passed: filtered visibility, offline wounds, permadeath, dropped loot and explicit successor.");
}

try{await run();}
catch(error){console.error(error);process.exitCode=1;}
finally{
  await stop();
  await db.end();
  if(prepared)await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
  await admin.end();
}
