import { createHash, randomBytes, randomUUID } from "node:crypto";
import { ServerError } from "colyseus";
import { parseCharacterStats, type CharacterStats, type ExpeditionPhase, type HexCoordinate } from "@mercatum/shared";
import { pool, transaction } from "./db.js";
import type { Admission, CharacterRecord } from "./models.js";

type CharacterRow = {
  id:string; display_name:string; stats:CharacterStats; q:number; r:number; phase:ExpeditionPhase; next_move_at:string;
};
function fromRow(row: CharacterRow): CharacterRecord {
  const stats=parseCharacterStats(row.stats);
  if(!stats) throw new Error("Personaje corrupto: distribución de atributos inválida");
  return { id:row.id, displayName:row.display_name, stats, q:row.q, r:row.r, phase:row.phase, nextMoveAt:Number(row.next_move_at) };
}
function hashToken(token:string):string { return createHash("sha256").update(token).digest("hex"); }

/** Credentials are high-entropy bearer tokens; a hash, not the bearer token, is stored in DB.
 * No password/account recovery yet: closed local prototype only. */
export async function admit(options:unknown):Promise<Admission>{
  const props = options && typeof options==="object" ? options as Record<string,unknown> : {};
  const suppliedToken=props.token;
  if(suppliedToken!==undefined){
    if(typeof suppliedToken!=="string"|| !/^[A-Za-z0-9_-]{43}$/.test(suppliedToken)){
      throw new ServerError(401,"Credencial de registro inválida.");
    }
    const found=await pool.query<CharacterRow>(`
      SELECT c.* FROM characters c
      INNER JOIN accounts a ON a.id=c.account_id
      WHERE a.token_hash=$1
    `,[hashToken(suppliedToken)]);
    if(!found.rows[0])throw new ServerError(401,"Credencial desconocida; no se creó otro personaje.");
    return {token:suppliedToken, character:fromRow(found.rows[0])};
  }
  const stats = parseCharacterStats(props.stats);
  if(!stats) throw new ServerError(400,"Distribución de atributos inválida.");
  const token=randomBytes(32).toString("base64url");
  const accountId=randomUUID();
  const characterId=randomUUID();
  const displayName=`Explorador-${characterId.slice(0,4).toUpperCase()}`;
  await transaction(async client=>{
    await client.query("INSERT INTO accounts(id,token_hash) VALUES($1,$2)",[accountId,hashToken(token)]);
    await client.query(`
      INSERT INTO characters(id,account_id,display_name,stats,q,r,phase,next_move_at)
      VALUES($1,$2,$3,$4,0,0,'inside',0)
    `,[characterId,accountId,displayName,JSON.stringify(stats)]);
    await client.query("INSERT INTO event_log(kind,character_id) VALUES('character_created',$1)",[characterId]);
  });
  return {
    token, character:{id:characterId,displayName,stats,q:0,r:0,phase:"inside",nextMoveAt:0},
  };
}

/** Conditional update protects against duplicate/reordered movement requests. */
export async function saveStep(
  characterId:string,from:HexCoordinate,to:HexCoordinate,now:number,nextMoveAt:number,
):Promise<boolean>{
  const r=await pool.query(`
    UPDATE characters SET q=$2,r=$3,next_move_at=$4
    WHERE id=$1 AND phase='inside' AND q=$5 AND r=$6 AND next_move_at<=$7
  `,[characterId,to.q,to.r,nextMoveAt,from.q,from.r,now]);
  return r.rowCount===1;
}

export async function reenter(characterId:string):Promise<boolean>{
  const r=await pool.query(`
    UPDATE characters SET phase='inside',q=0,r=0
    WHERE id=$1 AND phase='outside'
  `,[characterId]);
  if(r.rowCount===1)await pool.query("INSERT INTO event_log(kind,character_id) VALUES('entered',$1)",[characterId]);
  return r.rowCount===1;
}

/** Transactional extraction: stash all carried objects and then mark the character outside. */
export async function extract(characterId:string):Promise<boolean>{
  return transaction(async client=>{
    const char=await client.query("SELECT id FROM characters WHERE id=$1 AND phase='inside' AND q=0 AND r=0 FOR UPDATE",[characterId]);
    if(!char.rows[0])return false;
    await client.query(`
      UPDATE market_objects SET state='stash' WHERE owner_character_id=$1 AND state='carried'
    `,[characterId]);
    await client.query("UPDATE characters SET phase='outside' WHERE id=$1",[characterId]);
    await client.query("INSERT INTO event_log(kind,character_id) VALUES('extracted',$1)",[characterId]);
    return true;
  });
}

/** No gameplay resources are restored by disconnecting. The character remains where it was. */
export async function getCharacterPhase(characterId:string):Promise<ExpeditionPhase>{
  const r=await pool.query<{phase:ExpeditionPhase}>("SELECT phase FROM characters WHERE id=$1",[characterId]);
  if(!r.rows[0])throw new Error("Personaje no encontrado.");
  return r.rows[0].phase;
}
