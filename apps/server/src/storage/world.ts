import { pool, transaction } from "./db.js";
export async function doorOpen():Promise<boolean>{
  const r=await pool.query<{door_open:boolean}>("SELECT door_open FROM world_state WHERE id=1");
  return r.rows[0]?.door_open??false;
}
/** Door transition is durable and idempotent. */
export async function openDoor(characterId:string):Promise<boolean>{
  return transaction(async client=>{
    const result=await client.query("UPDATE world_state SET door_open=TRUE WHERE id=1 AND door_open=FALSE");
    if(result.rowCount===1){
      await client.query("INSERT INTO event_log(kind,character_id) VALUES('door_opened',$1)",[characterId]);
    }
    return result.rowCount===1;
  });
}
