import { randomUUID } from "node:crypto";
import { hexDistance, type HexCoordinate, type MarketItem } from "@mercatum/shared";
import { pool, transaction } from "./db.js";
import type { StoredObject } from "./models.js";

type ObjectRow={id:string;label:string;weight:number;condition:number;state:StoredObject["state"];q:number|null;r:number|null;owner_character_id:string|null};
function mapItem(row:ObjectRow):StoredObject {
  return {id:row.id,label:row.label,weight:row.weight,condition:row.condition,state:row.state,
    ownerCharacterId:row.owner_character_id,...(row.q===null||row.r===null?{}:{q:row.q,r:row.r})};
}
export async function worldItems():Promise<MarketItem[]> {
  const r=await pool.query<ObjectRow>("SELECT * FROM market_objects WHERE state='ground' ORDER BY id");
  return r.rows.map(mapItem);
}
export async function characterItems(characterId:string):Promise<{inventory:MarketItem[];stash:MarketItem[]}> {
  const r=await pool.query<ObjectRow>(`
    SELECT * FROM market_objects WHERE owner_character_id=$1 ORDER BY id
  `,[characterId]);
  return {inventory:r.rows.filter(x=>x.state==="carried").map(mapItem),
    stash:r.rows.filter(x=>x.state==="stash").map(mapItem)};
}
export async function inspectItem(id:string):Promise<StoredObject|null>{
  const r=await pool.query<ObjectRow>("SELECT * FROM market_objects WHERE id=$1 AND state='ground'",[id]);
  return r.rows[0]?mapItem(r.rows[0]):null;
}

/** Inventory cap is checked against the server-owned stats, inside the same SQL transaction. */
export async function pickItem(characterId:string,itemId:string,position:HexCoordinate):Promise<boolean>{
  return transaction(async client=>{
    const char=await client.query<{strength:number;q:number;r:number;phase:string}>(`
      SELECT (stats->>'strength')::integer AS strength,q,r,phase FROM characters WHERE id=$1 FOR UPDATE
    `,[characterId]);
    const actor=char.rows[0];
    if(!actor||actor.phase!=="inside"||actor.q!==position.q||actor.r!==position.r)return false;
    const item=await client.query<ObjectRow>(`
      SELECT * FROM market_objects WHERE id=$1 AND state='ground' FOR UPDATE
    `,[itemId]);
    const ground=item.rows[0];
    if(!ground||ground.q===null||ground.r===null||hexDistance(position,{q:ground.q,r:ground.r})>1)return false;
    const weight=await client.query<{total:string}>(`
      SELECT COALESCE(SUM(weight),0)::text AS total FROM market_objects
      WHERE owner_character_id=$1 AND state='carried'
    `,[characterId]);
    if(Number(weight.rows[0]?.total??0)+ground.weight>4+actor.strength*2)return false;
    const changed=await client.query(`
      UPDATE market_objects SET state='carried',owner_character_id=$1,q=NULL,r=NULL
      WHERE id=$2 AND state='ground'
    `,[characterId,itemId]);
    if(changed.rowCount!==1)return false;
    await client.query(`
      INSERT INTO event_log(kind,character_id,object_id,payload)
      VALUES('picked_up',$1,$2,$3)
    `,[characterId,itemId,JSON.stringify({q:position.q,r:position.r})]);
    return true;
  });
}
export async function dropItem(characterId:string,itemId:string,position:HexCoordinate):Promise<boolean>{
  return transaction(async client=>{
    const char=await client.query<{q:number;r:number;phase:string}>(`
      SELECT q,r,phase FROM characters WHERE id=$1 FOR UPDATE
    `,[characterId]);
    if(!char.rows[0]||char.rows[0].phase!=="inside"||char.rows[0].q!==position.q||char.rows[0].r!==position.r)return false;
    const changed=await client.query(`
      UPDATE market_objects SET state='ground',owner_character_id=NULL,q=$3,r=$4
      WHERE id=$1 AND owner_character_id=$2 AND state='carried'
    `,[itemId,characterId,position.q,position.r]);
    if(changed.rowCount!==1)return false;
    await client.query("INSERT INTO event_log(kind,character_id,object_id) VALUES('dropped',$1,$2)",[characterId,itemId]);
    return true;
  });
}
