/** V3 integration: closed-credit commerce, consented barter, public truth vs claims. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { Pool } from "pg";
import { Client, type Room } from "@colyseus/sdk";
import {
  BALANCED_STATS, MERCATUM_ROOM_NAME, type ActionResult, type IdentityReply,
  type MarketReply, type MarketOperation, type MercatumState, type ProvenanceReply,
} from "@mercatum/shared";

const PORT=31240, url=`http://127.0.0.1:${PORT}`;
const base=process.env.DATABASE_URL??"postgres://mercatum:mercatum@127.0.0.1:5432/mercatum";
const schema="v3_smoke_"+randomBytes(6).toString("hex");
const dbUrl=new URL(base); dbUrl.searchParams.set("options",`-csearch_path=${schema}`);
const admin=new Pool({connectionString:base}),db=new Pool({connectionString:dbUrl.toString()});
let server:ChildProcess|null=null,prepared=false,logs="";
async function eventually(check:()=>Promise<boolean>|boolean,label:string,ms=12000){
  const end=Date.now()+ms;
  while(Date.now()<end){if(await check())return;await sleep(75);}
  throw new Error(`Timeout: ${label}. Logs:\n${logs.slice(-5500)}`);
}
async function boot(){
  server=spawn(process.execPath,["dist/index.js"],{
    cwd:process.cwd(),
    env:{...process.env,PORT:String(PORT),DATABASE_URL:dbUrl.toString(),MERCATUM_DISABLE_CREATURES:"1"},
    stdio:["ignore","pipe","pipe"],
  });
  server.stdout?.on("data",(v:Buffer)=>{logs+=v.toString();});
  server.stderr?.on("data",(v:Buffer)=>{logs+=v.toString();});
  await eventually(async()=>{
    if(server?.exitCode!==null)throw new Error("Backend exited: "+logs);
    try{
      const response=await fetch(url+"/health");
      const body=await response.json() as {worldJoinable?:boolean};
      return response.ok&&body.worldJoinable===true;
    }catch{return false;}
  },"startup");
}
async function stop(){
  const child=server;if(!child)return;server=null;
  if(child.exitCode!==null)return;
  const done=new Promise<void>(resolve=>child.once("exit",()=>resolve()));
  child.kill("SIGTERM"); await Promise.race([done,sleep(3000)]);
}
function wait<T>(room:Room<MercatumState>,key:string):Promise<T>{
  return new Promise(resolve=>room.onMessage(key,(payload:T)=>resolve(payload)));
}
async function identity(room:Room<MercatumState>):Promise<IdentityReply>{
  const promise=wait<IdentityReply>(room,"identity");
  room.send("identity_request");return promise;
}
async function market(room:Room<MercatumState>):Promise<MarketReply>{
  const promise=wait<MarketReply>(room,"market_snapshot");
  room.send("market_request");return promise;
}
async function registry(room:Room<MercatumState>,itemId:string):Promise<ProvenanceReply>{
  const promise=wait<ProvenanceReply>(room,"provenance");
  room.send("provenance_request",{itemId});return promise;
}
async function operation(room:Room<MercatumState>,op:Omit<MarketOperation,"requestId">,id=randomUUID()){
  const promise=new Promise<{ok:boolean;message:string}>(resolve=>{
    room.onMessage("market_result",(r:{message:string;requestId:string})=>{
      if(r.requestId===id)resolve({ok:true,message:r.message});
    });
    room.onMessage("market_error",(r:{message:string})=>resolve({ok:false,message:r.message}));
  });
  room.send("market_operation",{...op,requestId:id});
  return Promise.race([
    promise,sleep(5000).then(()=>{throw new Error("Market operation timeout "+op.kind);}),
  ]);
}
async function extract(room:Room<MercatumState>){
  const promise=new Promise<{ok:boolean;message:string}>(resolve=>{
    room.onMessage("action_result",(r:ActionResult)=>{if(r.kind==="extract")resolve({ok:true,message:r.message});});
    room.onMessage("operation_error",(r:{message:string})=>resolve({ok:false,message:r.message}));
  });
  room.send("action",{kind:"extract"});
  return Promise.race([
    promise,sleep(4000).then(()=>{throw new Error("Extraction timed out");}),
  ]);
}
async function run(){
  await admin.query(`CREATE SCHEMA "${schema}"`);
  prepared=true;await boot();
  const client=new Client(url);
  const a=await client.join<MercatumState>(MERCATUM_ROOM_NAME,{stats:BALANCED_STATS});
  const b=await client.join<MercatumState>(MERCATUM_ROOM_NAME,{stats:BALANCED_STATS});
  const [ia,ib]=await Promise.all([identity(a),identity(b)]);
  assert.equal(ia.balance,100);assert.equal(ib.balance,100);
  // The in-world booth at (2,0) is not a teleporting merchant menu.
  const visitor=await client.join<MercatumState>(MERCATUM_ROOM_NAME,{stats:BALANCED_STATS});
  const visitorIdentity=await identity(visitor);
  const unopened=await market(visitor);
  assert.equal(unopened.merchantAvailable,false);
  assert.equal(unopened.stock.length,0);
  const lanternId="00000000-0000-4000-8000-000000000101";
  const remote=await operation(visitor,{kind:"buy",itemId:lanternId});
  assert.equal(remote.ok,false,"remote buy blocked even with a forged message");

  // An isolated actor moves to the storefront in SQL, bypassing lengthy walk
  // animations without compromising the authoritative market position check.
  await db.query("UPDATE characters SET q=2,r=0 WHERE id=$1",[visitorIdentity.characterId]);
  const counter=await market(visitor);
  assert.equal(counter.merchantAvailable,true,"storefront authorized within one hex");
  const lamp=counter.stock.find(item=>item.id===lanternId);
  assert.ok(lamp);
  assert.ok((await operation(visitor,{kind:"buy",itemId:lanternId})).ok);
  const inBag=await identity(visitor);
  assert.equal(inBag.inventory.filter(item=>item.id===lanternId).length,1);
  assert.equal(inBag.stash.length,0,"in-world purchases go into carried inventory");
  assert.equal(inBag.balance,100-lamp.price);

  // Over-capacity purchases must fail without debiting currency or duplicating.
  const heavyId=randomUUID();
  await db.query(`
    INSERT INTO market_objects(id,label,weight,condition,state,owner_character_id)
    VALUES($1,'Fardo pesado',90,100,'carried',$2)
  `,[heavyId,visitorIdentity.characterId]);
  const creditsBefore=(await identity(visitor)).balance;
  const overloaded=await operation(visitor,{
    kind:"buy",itemId:"00000000-0000-4000-8000-000000000103",
  });
  assert.equal(overloaded.ok,false);
  assert.equal((await identity(visitor)).balance,creditsBefore);

  // Selling from the counter consumes the same object ID as the purchase.
  assert.ok((await operation(visitor,{kind:"sell",itemId:lanternId})).ok);
  const afterSale=await identity(visitor);
  assert.equal(afterSale.inventory.some(item=>item.id===lanternId),false);
  assert.ok((await market(visitor)).stock.some(item=>item.id===lanternId));
  await db.query("UPDATE characters SET q=0,r=0 WHERE id=$1",[visitorIdentity.characterId]);
  assert.equal((await market(visitor)).merchantAvailable,false);
  const remoteAgain=await operation(visitor,{kind:"buy",itemId:lanternId});
  assert.equal(remoteAgain.ok,false);
  await visitor.leave();
  // The register is outside, and hidden behind an explicit server check.
  const rejected=wait<{message:string}>(a,"market_error");
  a.send("provenance_request",{itemId:"00000000-0000-4000-8000-000000000001"});
  assert.match((await rejected).message,/fuera/i);
  const [exa,exb]=await Promise.all([extract(a),extract(b)]);
  assert.ok(exa.ok&&exb.ok,"both explorers extracted safely");
  const ma=await market(a),mb=await market(b);
  assert.equal(ma.credits,100);assert.equal(mb.credits,100);
  const lantern=ma.stock.find(x=>x.label==="Linterna de emergencia");
  const gloves=mb.stock.find(x=>x.label==="Guantes de cuero viejo");
  const key=ma.stock.find(x=>x.label==="Llave sin cerradura");
  assert.ok(lantern&&gloves&&key,"unique merchant stock");

  const buyRequest=randomUUID();
  assert.ok((await operation(a,{kind:"buy",itemId:lantern.id},buyRequest)).ok);
  const duplicate=await operation(a,{kind:"buy",itemId:lantern.id},buyRequest);
  assert.match(duplicate.message,/registrada/i);
  assert.ok((await operation(b,{kind:"buy",itemId:gloves.id})).ok);
  const boughtA=await identity(a),boughtB=await identity(b);
  assert.equal(boughtA.stash.filter(x=>x.id===lantern.id).length,1);
  assert.equal(boughtB.stash.filter(x=>x.id===gloves.id).length,1);
  assert.equal(boughtA.balance,100-lantern.price);
  assert.equal(boughtB.balance,100-gloves.price);

  assert.ok((await operation(a,{kind:"list",itemId:lantern.id,value:1})).ok);
  const listB=await market(b);
  const peer=listB.peers.find(p=>p.sessionId===a.sessionId);
  assert.ok(peer?.listed.some(item=>item.id===lantern.id),"only seller-listed object is visible");
  const offer=await operation(b,{
    kind:"offer",peerSessionId:a.sessionId,itemId:lantern.id,value:8,barterItemId:gloves.id,
  });
  assert.ok(offer.ok,offer.message);
  const incoming=(await market(a)).offers.find(o=>o.direction==="incoming"&&o.item.id===lantern.id);
  assert.ok(incoming,"seller received buyer's precise offer");
  const accepted=await operation(a,{kind:"accept",offerId:incoming.id});
  assert.ok(accepted.ok,accepted.message);
  const afterA=await identity(a),afterB=await identity(b);
  assert.equal(afterA.stash.filter(x=>x.id===gloves.id).length,1);
  assert.equal(afterB.stash.filter(x=>x.id===lantern.id).length,1);
  assert.equal(afterA.stash.some(x=>x.id===lantern.id),false);
  assert.equal(afterB.stash.some(x=>x.id===gloves.id),false);
  assert.equal(afterA.balance,100-lantern.price+8);
  assert.equal(afterB.balance,100-gloves.price-8);
  const saleEstimate=(await market(a)).own.find(x=>x.id===gloves.id)?.resalePrice;
  assert.equal(typeof saleEstimate,"number");
  const sold=await operation(a,{kind:"sell",itemId:gloves.id});
  assert.ok(sold.ok,sold.message);
  assert.equal((await identity(a)).balance,afterA.balance+(saleEstimate??0));
  assert.ok((await market(a)).stock.some(x=>x.id===gloves.id),
    "sold object returned to NPC stock without cloning");

  // No player edits a fact. A claim can allege anything, but never becomes a fact.
  const claim=await operation(b,{kind:"claim",itemId:lantern.id,
    statement:"Esta linterna estuvo en una expedición legendaria. Fuente: MasterSex69."});
  assert.ok(claim.ok,claim.message);
  const history=await registry(a,lantern.id);
  assert.ok(history.history.some(e=>e.kind==="fact"&&e.eventType==="state_changed"));
  assert.ok(history.history.some(e=>e.kind==="claim"&&e.statement?.includes("MasterSex69")));
  assert.ok(history.history.find(e=>e.kind==="claim")?.author.startsWith("Registrante-"));
  for(let i=0;i<2;i++)assert.ok((await operation(b,{
    kind:"claim",itemId:lantern.id,statement:"Otra declaración independiente "+i,
  })).ok);
  const throttled=await operation(b,{
    kind:"claim",itemId:lantern.id,statement:"Cuarta declaración dentro de la misma hora",
  });
  assert.equal(throttled.ok,false,"unverified claims have a spam limit");
  await assert.rejects(db.query(`
    DELETE FROM object_events WHERE item_id=$1 AND kind='fact'
  `,[lantern.id]),/append-only/i);

  // Unique merchant supply: only one buyer wins a simultaneous attempt.
  const [contestA,contestB]=await Promise.all([
    operation(a,{kind:"buy",itemId:key.id}),
    operation(b,{kind:"buy",itemId:key.id}),
  ]);
  assert.equal(Number(contestA.ok)+Number(contestB.ok),1,"single owner of contested item");
  const owner=await db.query<{owner_character_id:string|null}>(`
    SELECT owner_character_id FROM market_objects WHERE id=$1
  `,[key.id]);
  assert.ok([ia.characterId,ib.characterId].includes(owner.rows[0].owner_character_id??""));
  await assert.rejects(db.query("DELETE FROM wallet_ledger WHERE delta<0"),/append-only/i);

  // The cash ledger must reconcile exactly with the account's balance.
  const reconciled=await db.query<{account_id:string;total:string;credits:number}>(`
    SELECT a.id AS account_id,a.credits,COALESCE(SUM(w.delta),0)::text AS total
    FROM accounts a LEFT JOIN wallet_ledger w ON w.account_id=a.id
    GROUP BY a.id,a.credits
  `);
  for(const r of reconciled.rows)assert.equal(Number(r.total),r.credits);

  const oldToken=afterB.token,oldId=afterB.characterId;
  const credits=(await market(b)).credits;
  await a.leave();await b.leave();await stop();
  await boot();
  const returning=await new Client(url).join<MercatumState>(MERCATUM_ROOM_NAME,{token:oldToken});
  try{
    const restored=await identity(returning);
    assert.equal(restored.characterId,oldId);
    assert.equal(restored.balance,credits);
    assert.ok(restored.stash.some(x=>x.id===lantern.id));
    assert.ok((await registry(returning,lantern.id)).history.some(x=>x.kind==="claim"));
  }finally{await returning.leave();}
  console.log("V3 smoke passed: commerce, no duplication, consented trade, factual ledger, unverified claims and restart.");
}
try{await run();}
catch(error){console.error(error);process.exitCode=1;}
finally{
  await stop();await db.end();
  if(prepared)await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
  await admin.end();
}
