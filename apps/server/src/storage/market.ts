import type { PoolClient } from "pg";
import {
  type MarketItem, type MarketListing, type MarketReply, type TradeOffer,
  type TradePeer, type TradeableItem,
} from "@mercatum/shared";
import { pool, transaction } from "./db.js";
import { canVisitMerchant, isUuid, purchasePrice, salePrice, tradeAllowed } from "../domain/marketRules.js";

export class MarketError extends Error {}

export interface Actor {
  id: string;
  accountId: string;
  phase: "inside" | "outside" | "dead";
  q: number;
  r: number;
  health: number;
  strength: number;
  trato: number;
}
interface ActorRow {
  id: string; account_id: string; phase: Actor["phase"];
  q: number; r: number; health: number; stats: { strength: number; social: number };
}
export interface ObjectRow {
  id: string; label: string; weight: number; condition: number;
  state: string; owner_character_id: string|null; listed: boolean; base_price: number;
  q: number|null; r: number|null;
}
function actorFromRow(x: ActorRow): Actor {
  return {id:x.id,accountId:x.account_id,phase:x.phase,q:x.q,r:x.r,
    health:x.health,strength:Number(x.stats.strength),trato:Number(x.stats.social)};
}
function cleanItem(row: ObjectRow):TradeableItem{
  return {id:row.id,label:row.label,weight:row.weight,condition:row.condition,
    listed:row.listed,...(row.q===null||row.r===null?{}:{q:row.q,r:row.r})};
}
export function itemForTrade(row: ObjectRow): MarketItem {
  const {listed:_,...item}=cleanItem(row);
  return item;
}
export async function actorFor(id:string,client:PoolClient,lock=false):Promise<Actor>{
  const found=await client.query<ActorRow>(`
    SELECT id,account_id,phase,q,r,health,stats FROM characters WHERE id=$1
    ${lock?"FOR UPDATE":""}
  `,[id]);
  if(!found.rows[0])throw new MarketError("No se encontró el personaje.");
  return actorFromRow(found.rows[0]);
}
export function storageState(actor: Actor): "stash" | "carried" {
  if(actor.phase==="outside")return "stash";
  if(actor.phase==="inside"&&actor.health>0)return "carried";
  throw new MarketError("No puedes comerciar desde este estado.");
}
export async function lockedAccount(db:PoolClient,id:string):Promise<number>{
  const r=await db.query<{credits:number}>(
    "SELECT credits FROM accounts WHERE id=$1 FOR UPDATE",[id]);
  if(!r.rows[0])throw new MarketError("Cuenta inexistente.");
  return r.rows[0].credits;
}
export async function receipt(db:PoolClient,accountId:string,requestId:string,kind:string):Promise<boolean>{
  if(!isUuid(requestId))throw new MarketError("Solicitud inválida.");
  const added=await db.query(`
    INSERT INTO operation_receipts(account_id,request_id,kind)
    VALUES($1,$2,$3) ON CONFLICT DO NOTHING
  `,[accountId,requestId,kind]);
  return added.rowCount===1;
}
export async function wallet(
  db:PoolClient,accountId:string,delta:number,reason:string,
  operationId:string,itemId:string|null,
):Promise<number>{
  const r=await db.query<{credits:number}>(`
    UPDATE accounts SET credits=credits+$2
    WHERE id=$1 AND credits+$2>=0 AND credits+$2<=10000000
    RETURNING credits
  `,[accountId,delta]);
  if(!r.rows[0])throw new MarketError("Saldo insuficiente o límite de cuenta superado.");
  await db.query(`
    INSERT INTO wallet_ledger(account_id,delta,balance_after,reason,operation_id,item_id)
    VALUES($1,$2,$3,$4,$5,$6)
  `,[accountId,delta,r.rows[0].credits,reason,operationId,itemId]);
  return r.rows[0].credits;
}

/** Public peers are derived from current Colyseus connections, not stale SQL users. */
export async function marketSnapshot(
  characterId:string,
  connected:readonly {sessionId:string;characterId:string;name:string}[],
):Promise<MarketReply> {
  const db=await pool.connect();
  try {
    const actor=await actorFor(characterId,db);
    const owned=await db.query<ObjectRow>(`
      SELECT * FROM market_objects WHERE owner_character_id=$1
        AND state IN ('stash','carried') ORDER BY label,id
    `,[characterId]);
    const own=owned.rows.map(x=>({...cleanItem(x),resalePrice:salePrice(x.base_price,x.condition,actor.trato)}));
    const account=await db.query<{credits:number}>("SELECT credits FROM accounts WHERE id=$1",[actor.accountId]);
    const merchantAvailable=canVisitMerchant(actor);
    const stock=merchantAvailable
      ? await db.query<ObjectRow>("SELECT * FROM market_objects WHERE state='merchant' ORDER BY label,id")
      : {rows:[] as ObjectRow[]};
    const available:TradePeer[]=[];
    for(const peer of connected){
      if(peer.characterId===actor.id)continue;
      const other=await actorFor(peer.characterId,db);
      if(!tradeAllowed(actor,other))continue;
      const listings=await db.query<ObjectRow>(`
        SELECT * FROM market_objects WHERE owner_character_id=$1 AND state=$2 AND listed=TRUE
        ORDER BY label,id
      `,[other.id,storageState(other)]);
      available.push({sessionId:peer.sessionId,name:peer.name,listed:listings.rows.map(x=>({...cleanItem(x),resalePrice:salePrice(x.base_price,x.condition,other.trato)}))});
    }
    const offers=await db.query<{
      id:string;buyer_id:string;seller_id:string;credits:number;expires_at:Date;
      seller_name:string;buyer_name:string;item_id:string;item_label:string;
      item_weight:number;item_condition:number;barter_item_id:string|null;
      barter_label:string|null;barter_weight:number|null;barter_condition:number|null;
    }>(`
      SELECT o.*,s.display_name AS seller_name,b.display_name AS buyer_name,
        i.label AS item_label,i.weight AS item_weight,i.condition AS item_condition,
        j.label AS barter_label,j.weight AS barter_weight,j.condition AS barter_condition
      FROM trade_offers o
      JOIN characters s ON s.id=o.seller_id JOIN characters b ON b.id=o.buyer_id
      JOIN market_objects i ON i.id=o.item_id
      LEFT JOIN market_objects j ON j.id=o.barter_item_id
      WHERE (o.buyer_id=$1 OR o.seller_id=$1) AND o.status='pending'
        AND o.expires_at>NOW() ORDER BY o.created_at DESC LIMIT 40
    `,[characterId]);
    const result:TradeOffer[]=offers.rows.map(x=>({
      id:x.id,fromName:x.buyer_name,fromCharacterId:x.buyer_id,
      toCharacterId:x.seller_id,
      item:{id:x.item_id,label:x.item_label,weight:x.item_weight,condition:x.item_condition},
      credits:x.credits,
      ...(x.barter_item_id&&x.barter_label!==null?{barterItem:{
        id:x.barter_item_id,label:x.barter_label,
        weight:x.barter_weight??0,condition:x.barter_condition??0,
      }}:{}),
      expiresAt:new Date(x.expires_at).getTime(),
      status:"pending",direction:x.seller_id===characterId?"incoming":"outgoing",
    }));
    return {
      merchantAvailable,
      credits:account.rows[0]?.credits??0,
      stock:stock.rows.map(item=>({...cleanItem(item),price:purchasePrice(item.base_price,item.condition,actor.trato)} as MarketListing)),
      own,peers:available,offers:result,
    };
  } finally {db.release();}
}

export async function merchantBuy(characterId:string,requestId:string,itemId:string):Promise<string>{
  if(!isUuid(itemId))throw new MarketError("Objeto inválido.");
  return transaction(async db=>{
    const actor=await actorFor(characterId,db,true);
    if(!canVisitMerchant(actor))throw new MarketError("Acércate al puesto para comprar o extrae al comerciante exterior.");
    const balance=await lockedAccount(db,actor.accountId);
    if(!(await receipt(db,actor.accountId,requestId,"buy")))return "Compra ya registrada.";
    const r=await db.query<ObjectRow>(`
      SELECT * FROM market_objects WHERE id=$1 AND state='merchant' FOR UPDATE
    `,[itemId]);
    const item=r.rows[0];if(!item)throw new MarketError("La mercancía ya no está a la venta.");
    const price=purchasePrice(item.base_price,item.condition,actor.trato);
    if(balance<price)throw new MarketError("Saldo insuficiente.");
    const destination=storageState(actor);
    if(destination==="carried"){
      const carried=await db.query<{total:string}>(`
        SELECT COALESCE(SUM(weight),0)::text AS total FROM market_objects
        WHERE owner_character_id=$1 AND state='carried'
      `,[characterId]);
      if(Number(carried.rows[0]?.total??0)+item.weight>4+2*actor.strength)
        throw new MarketError("Tu mochila no tiene capacidad para esta compra.");
    }
    await wallet(db,actor.accountId,-price,"merchant_purchase",requestId,item.id);
    await db.query(`
      UPDATE market_objects SET state=$3,owner_character_id=$2,listed=FALSE,
        condition=GREATEST(0,condition-1) WHERE id=$1
    `,[itemId,characterId,destination]);
    return `Compra registrada: ${item.label} por ${price} créditos.`;
  });
}

export async function merchantSell(characterId:string,requestId:string,itemId:string):Promise<string>{
  if(!isUuid(itemId))throw new MarketError("Objeto inválido.");
  return transaction(async db=>{
    const actor=await actorFor(characterId,db,true);
    if(!canVisitMerchant(actor))throw new MarketError("Acércate al puesto para vender o extrae al comerciante exterior.");
    const source=storageState(actor);
    await lockedAccount(db,actor.accountId);
    if(!(await receipt(db,actor.accountId,requestId,"sell")))return "Venta ya registrada.";
    const r=await db.query<ObjectRow>(`
      SELECT * FROM market_objects WHERE id=$1 AND owner_character_id=$2 AND state=$3
      FOR UPDATE
    `,[itemId,characterId,source]);
    const item=r.rows[0];if(!item)throw new MarketError("No llevas ese objeto a este mostrador.");
    const price=salePrice(item.base_price,item.condition,actor.trato);
    await wallet(db,actor.accountId,price,"merchant_sale",requestId,itemId);
    await db.query(`
      UPDATE market_objects SET state='merchant',owner_character_id=NULL,listed=FALSE,
        condition=GREATEST(0,condition-1) WHERE id=$1
    `,[itemId]);
    return `Venta registrada: +${price} créditos por ${item.label}.`;
  });
}

export async function toggleListing(
  characterId:string,requestId:string,itemId:string,listed:boolean,
):Promise<string>{
  if(!isUuid(itemId))throw new MarketError("Objeto inválido.");
  return transaction(async db=>{
    const actor=await actorFor(characterId,db,true);
    const state=storageState(actor);
    if(!(await receipt(db,actor.accountId,requestId,"list")))return "Anuncio ya actualizado.";
    const changed=await db.query(`
      UPDATE market_objects SET listed=$4
      WHERE id=$1 AND owner_character_id=$2 AND state=$3
    `,[itemId,characterId,state,listed]);
    if(changed.rowCount!==1)throw new MarketError("No puedes publicar ese objeto en esta ubicación.");
    return listed?"El objeto queda anunciado a exploradores próximos.":"El objeto ya no está anunciado.";
  });
}
