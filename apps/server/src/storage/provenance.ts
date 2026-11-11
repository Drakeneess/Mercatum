import type { ProvenanceReply, ProvenanceEvent } from "@mercatum/shared";
import { pool, transaction } from "./db.js";
import { isUuid } from "../domain/marketRules.js";
import { MarketError, actorFor, lockedAccount, receipt } from "./market.js";

/** The public register exists OUTSIDE the building only.
 * Fact rows are emitted by SQL triggers; players may append unverified claims. */
export async function inspectProvenance(
  characterId:string,itemId:string,
):Promise<ProvenanceReply>{
  if(!isUuid(itemId))throw new MarketError("Identificador de registro inválido.");
  const client=await pool.connect();
  try{
    const actor=await actorFor(characterId,client);
    if(actor.phase!=="outside")throw new MarketError("El registro público está fuera del Mercado.");
    const item=await client.query("SELECT id FROM market_objects WHERE id=$1",[itemId]);
    if(!item.rows[0])throw new MarketError("No hay ningún objeto registrado con ese identificador.");
    const rows=await client.query<{
      id:string;kind:"fact"|"claim";event_type:string;author_account_id:string|null;
      statement:string|null;detail:Record<string,unknown>;created_at:Date;
    }>(`
      SELECT id::text,kind,event_type,author_account_id,statement,detail,created_at
      FROM object_events WHERE item_id=$1 ORDER BY id LIMIT 200
    `,[itemId]);
    const history:ProvenanceEvent[]=rows.rows.map(row=>({
      id:row.id,kind:row.kind,eventType:row.event_type,
      author:row.kind==="fact"?"REGISTRO DEL MERCADO":`Registrante-${row.author_account_id?.slice(0,8)??"?"}`,
      ...(row.statement?{statement:row.statement}:{}),
      ...(row.kind==="fact"?{detail:JSON.stringify(row.detail)}:{}),
      at:new Date(row.created_at).toISOString(),
    }));
    return {itemId,history};
  }finally{client.release();}
}

export async function publishClaim(
  characterId:string,requestId:string,itemId:string,statement:unknown,
):Promise<string>{
  if(!isUuid(itemId)||typeof statement!=="string")throw new MarketError("Afirmación inválida.");
  const text=statement.trim();
  if(text.length<4||text.length>240)throw new MarketError("El testimonio necesita entre 4 y 240 caracteres.");
  // The SQL uniqueness receipt is per account. Parallel submissions cannot
  // bypass the hourly claim limit because the account row is locked first.
  return transaction(async client=>{
    const actor=await actorFor(characterId,client,true);
    if(actor.phase!=="outside")throw new MarketError("La anotación pública solo funciona fuera del edificio.");
    await lockedAccount(client,actor.accountId);
    if(!(await receipt(client,actor.accountId,requestId,"claim")))return "El testimonio ya fue publicado.";
    const existing=await client.query("SELECT 1 FROM market_objects WHERE id=$1",[itemId]);
    if(!existing.rows[0])throw new MarketError("El objeto no está en el registro.");
    const rate=await client.query<{n:string}>(`
      SELECT COUNT(*)::text AS n FROM object_events
      WHERE author_account_id=$1 AND kind='claim'
        AND created_at>NOW()-INTERVAL '1 hour'
    `,[actor.accountId]);
    if(Number(rate.rows[0]?.n??0)>=3)
      throw new MarketError("Límite de tres testimonios por hora. La anotación no se guardó.");
    await client.query(`
      INSERT INTO object_events(item_id,kind,event_type,author_account_id,statement)
      VALUES($1,'claim','player_statement',$2,$3)
    `,[itemId,actor.accountId,text]);
    return "Testimonio registrado con tu identidad. Es una afirmación pública, NO un hecho verificado.";
  });
}
