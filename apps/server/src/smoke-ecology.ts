/** V4 ecology: global visibility, exclusive hexes, persistent rival combat and roaming. */
import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {spawn,type ChildProcess} from "node:child_process";
import {setTimeout as sleep} from "node:timers/promises";
import {Pool} from "pg";
import {Client,type Room} from "@colyseus/sdk";
import {
  BALANCED_STATS,MERCATUM_ROOM_NAME,type MercatumState,
  type SightingsReply,
} from "@mercatum/shared";

const PORT=31341,url=`http://127.0.0.1:${PORT}`;
const base=process.env.DATABASE_URL??"postgres://mercatum:mercatum@127.0.0.1:5432/mercatum";
const schema="ecology_smoke_"+randomBytes(6).toString("hex");
const isolated=new URL(base);
isolated.searchParams.set("options",`-csearch_path=${schema}`);
const admin=new Pool({connectionString:base});
const db=new Pool({connectionString:isolated.toString()});
let server:ChildProcess|null=null,prepared=false,logs="";
async function eventually(check:()=>boolean|Promise<boolean>,label:string,ms=10000) {
  const end=Date.now()+ms;
  while(Date.now()<end){if(await check())return;await sleep(70);}
  throw new Error("Ecology timeout: "+label+"; "+logs.slice(-4000));
}
async function boot(creaturesEnabled:boolean) {
  server=spawn(process.execPath,["dist/index.js"],{
    cwd:process.cwd(),
    env:{...process.env,PORT:String(PORT),DATABASE_URL:isolated.toString(),
      MERCATUM_DISABLE_CREATURES:creaturesEnabled?"0":"1",
      MERCATUM_CREATURE_SMOKE_FAST:"1"},
    stdio:["ignore","pipe","pipe"],
  });
  server.stdout?.on("data",(data:Buffer)=>logs+=data.toString());
  server.stderr?.on("data",(data:Buffer)=>logs+=data.toString());
  await eventually(async()=>{
    if(server?.exitCode!==null)throw new Error("Backend crashed: "+logs);
    try{
      const reply=await fetch(url+"/health");
      const body=await reply.json() as {worldJoinable?:boolean};
      return reply.ok&&body.worldJoinable===true;
    }catch{return false;}
  },"backend startup");
}
async function stop() {
  if(!server)return;
  const child=server;server=null;
  if(child.exitCode!==null)return;
  const finished=new Promise<void>(resolve=>child.once("exit",()=>resolve()));
  child.kill("SIGTERM");
  await Promise.race([finished,sleep(3000)]);
}
async function locate(room:Room<MercatumState>):Promise<SightingsReply>{
  const result=new Promise<SightingsReply>(resolve=>
    room.onMessage("sightings",(reply:SightingsReply)=>resolve(reply)));
  room.send("sightings_request");
  return Promise.race([result,sleep(3500).then(()=>{
    throw new Error("Sighting request timed out");
  })]);
}
async function run(){
  await admin.query(`CREATE SCHEMA "${schema}"`);prepared=true;
  await boot(false);
  const room=await new Client(url).join<MercatumState>(
    MERCATUM_ROOM_NAME,{stats:BALANCED_STATS});
  const initial=await locate(room);
  assert.equal(initial.creatures.length,2,"all two enemies shown even from the entrance");
  assert.ok(initial.creatures.every(x=>x.health===120&&x.maxHealth===120));
  await room.leave();

  const position=await db.query<{q:number;r:number;name:string}>(`
    SELECT q,r,name FROM creatures WHERE health>0
  `);
  assert.equal(new Set(position.rows.map(x=>x.q+","+x.r)).size,2);
  await assert.rejects(db.query(`
    UPDATE creatures SET q=4,r=-3 WHERE id='scavenger-01'
  `),(err:unknown)=>(err as {code?:string}).code==="23505");

  await stop();
  // Fight from adjacent distinct cells. Place target deliberately below the
  // damage threshold and make the predator due first, without any players.
  const stolenId=randomUUID();
  await db.query(`
    INSERT INTO market_objects(id,label,weight,condition,state,creature_id)
    VALUES($1,'Reliquia robada',1,70,'stolen','scavenger-01')
  `,[stolenId]);
  await db.query(`
    UPDATE creatures SET q=4,r=-3,health=120,steps=3,next_action_at=0,
      next_attack_at=0,next_harm_at=0,previous_q=NULL,previous_r=NULL
    WHERE id='stalker-01'
  `);
  await db.query(`
    UPDATE creatures SET q=3,r=-3,health=7,steps=0,
      next_action_at=$1,next_harm_at=0
    WHERE id='scavenger-01'
  `,[Date.now()+60000]);
  await boot(true);
  await eventually(async()=>{
    const row=await db.query<{health:number}>(`
      SELECT health FROM creatures WHERE id='scavenger-01'
    `);
    return row.rows[0]?.health===0;
  },"rival defeat");
  const clashes=await db.query<{payload:{damage:number;defenderHealth:number;defeated:boolean}}>(`
    SELECT payload FROM event_log WHERE kind='creature_clash'
  `);
  assert.equal(clashes.rows.length,1);
  assert.equal(clashes.rows[0].payload.damage,14);
  assert.equal(clashes.rows[0].payload.defenderHealth,0);
  assert.equal(clashes.rows[0].payload.defeated,true);
  const loot=await db.query<{state:string;q:number;r:number;creature_id:string|null}>(`
    SELECT state,q,r,creature_id FROM market_objects WHERE id=$1
  `,[stolenId]);
  assert.equal(loot.rows[0].state,"ground");
  assert.equal(loot.rows[0].creature_id,null);
  assert.deepEqual({q:loot.rows[0].q,r:loot.rows[0].r},{q:3,r:-3});

  // With no players and no surviving opponent, the predator still wanders.
  await eventually(async()=>{
    const pos=await db.query<{q:number;r:number;steps:number}>(`
      SELECT q,r,steps FROM creatures WHERE id='stalker-01'
    `);
    return pos.rows[0].steps>=5 &&
      (pos.rows[0].q!==4||pos.rows[0].r!==-3);
  },"independent roaming",5000);
  const living=await db.query<{n:string;total:string}>(`
    SELECT COUNT(*) FILTER(WHERE health>0)::text AS n,
      COUNT(*)::text AS total FROM creatures
  `);
  assert.equal(Number(living.rows[0].n),1);
  assert.equal(Number(living.rows[0].total),2);

  const scout=await new Client(url).join<MercatumState>(
    MERCATUM_ROOM_NAME,{stats:BALANCED_STATS});
  try{
    const after=await locate(scout);
    assert.equal(after.creatures.length,1,"defeated hostiles disappear from the active map");
    assert.equal(after.creatures[0].id,"stalker-01");
  }finally{await scout.leave();}
  await stop();
  await boot(false);
  const stillDead=await db.query<{health:number}>(`
    SELECT health FROM creatures WHERE id='scavenger-01'
  `);
  assert.equal(stillDead.rows[0].health,0,"defeat persists after restart");
  console.log("Ecology smoke passed: globally visible hostiles, unique hexes, rival combat, drops and solo wandering.");
}
try{await run();}
catch(error){console.error(error);process.exitCode=1;}
finally{
  await stop();await db.end();
  if(prepared)await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
  await admin.end();
}
