import { randomUUID } from "node:crypto";
import { transaction } from "./db.js";
import { MarketError, actorFor, lockedAccount, receipt, storageState, wallet, type ObjectRow } from "./market.js";
import { isUuid, safeAmount, tradeAllowed } from "../domain/marketRules.js";

interface TradeRow {
  id:string;buyer_id:string;seller_id:string;item_id:string;
  barter_item_id:string|null;credits:number;status:string;expires_at:Date;
}
/** Always lock characters, then accounts, then items in stable order.
 * Two simultaneous accepted offers cannot double-spend an item or wallet. */
async function lockCharacters(db:import("pg").PoolClient, ids:readonly string[]) {
  const unique=[...new Set(ids)].sort();
  const r=await db.query(`
    SELECT id FROM characters WHERE id = ANY($1::uuid[])
    ORDER BY id FOR UPDATE
  `,[unique]);
  if(r.rowCount!==unique.length)throw new MarketError("Algún explorador ya no existe.");
}
async function lockAccounts(db:import("pg").PoolClient,ids:readonly string[]){
  const unique=[...new Set(ids)].sort();
  const accounts=new Map<string,number>();
  for(const id of unique)accounts.set(id,await lockedAccount(db,id));
  return accounts;
}

export async function proposeTrade(
  buyerId:string,sellerId:string,itemId:string,
  creditsUnknown:unknown,barterItemId:string|null,requestId:string,
):Promise<string>{
  const credits=safeAmount(creditsUnknown);
  if(credits===null||!isUuid(itemId)||barterItemId!==null&&!isUuid(barterItemId))
    throw new MarketError("La oferta contiene valores inválidos.");
  if(buyerId===sellerId)throw new MarketError("No puedes intercambiar contigo mismo.");
  if(barterItemId===itemId)throw new MarketError("Los objetos de ambas partes deben ser distintos.");
  return transaction(async db=>{
    await lockCharacters(db,[buyerId,sellerId]);
    const buyer=await actorFor(buyerId,db);
    const seller=await actorFor(sellerId,db);
    if(!tradeAllowed(buyer,seller))throw new MarketError("Los exploradores ya no están a distancia de intercambio.");
    const balances=await lockAccounts(db,[buyer.accountId,seller.accountId]);
    if(!(await receipt(db,buyer.accountId,requestId,"offer")))return "La oferta ya fue registrada.";
    if((balances.get(buyer.accountId)??0)<credits)throw new MarketError("No tienes créditos suficientes.");
    const state=storageState(seller);
    const item=await db.query<ObjectRow>(`
      SELECT * FROM market_objects WHERE id=$1 AND owner_character_id=$2
        AND state=$3 AND listed=TRUE FOR UPDATE
    `,[itemId,sellerId,state]);
    if(!item.rows[0])throw new MarketError("El artículo ya no está anunciado.");
    if(barterItemId){
      const barter=await db.query<ObjectRow>(`
        SELECT * FROM market_objects WHERE id=$1 AND owner_character_id=$2
          AND state=$3 FOR UPDATE
      `,[barterItemId,buyerId,storageState(buyer)]);
      if(!barter.rows[0])throw new MarketError("El objeto ofrecido a cambio ya no es tuyo.");
    }
    const offerId=randomUUID();
    await db.query(`
      INSERT INTO trade_offers(id,buyer_id,seller_id,item_id,barter_item_id,credits,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,NOW()+INTERVAL '3 minutes')
    `,[offerId,buyerId,sellerId,itemId,barterItemId,credits]);
    return "Oferta enviada. El dueño debe aceptarla expresamente; vence en tres minutos.";
  });
}

export async function resolveOffer(
  characterId:string,requestId:string,offerId:string,accept:boolean,
):Promise<string>{
  if(!isUuid(offerId))throw new MarketError("Oferta inválida.");
  return transaction(async db=>{
    const target=await db.query<TradeRow>(`
      SELECT * FROM trade_offers WHERE id=$1 FOR UPDATE
    `,[offerId]);
    const offer=target.rows[0];
    if(!offer)throw new MarketError("La oferta no existe.");
    if(offer.status!=="pending"||new Date(offer.expires_at).getTime()<=Date.now())
      throw new MarketError("La oferta ya expiró o fue procesada.");
    if(accept&&characterId!==offer.seller_id)
      throw new MarketError("Solo el propietario puede aceptar esta oferta.");
    if(!accept&&characterId!==offer.seller_id&&characterId!==offer.buyer_id)
      throw new MarketError("Esta oferta no te pertenece.");
    await lockCharacters(db,[offer.buyer_id,offer.seller_id]);
    const buyer=await actorFor(offer.buyer_id,db);
    const seller=await actorFor(offer.seller_id,db);
    const balances=await lockAccounts(db,[buyer.accountId,seller.accountId]);
    const requester=characterId===offer.buyer_id?buyer:seller;
    if(!(await receipt(db,requester.accountId,requestId,accept?"accept":"decline")))
      return "La decisión ya fue registrada.";
    if(!accept){
      await db.query("UPDATE trade_offers SET status='cancelled' WHERE id=$1",[offerId]);
      return "Oferta rechazada o cancelada.";
    }
    if(!tradeAllowed(buyer,seller))
      throw new MarketError("Ambos exploradores deben permanecer juntos o fuera del Mercado.");
    if((balances.get(buyer.accountId)??0)<offer.credits)
      throw new MarketError("El comprador ya no tiene créditos suficientes.");

    const ids=[offer.item_id,...(offer.barter_item_id?[offer.barter_item_id]:[])].sort();
    const existing=await db.query<ObjectRow>(`
      SELECT * FROM market_objects WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE
    `,[ids]);
    const sale=existing.rows.find(x=>x.id===offer.item_id);
    const barter=offer.barter_item_id
      ? existing.rows.find(x=>x.id===offer.barter_item_id):undefined;
    if(!sale||sale.owner_character_id!==seller.id||sale.state!==storageState(seller)||!sale.listed)
      throw new MarketError("El objeto ofertado cambió de dueño o ya no está anunciado.");
    if(offer.barter_item_id &&
      (!barter||barter.owner_character_id!==buyer.id||barter.state!==storageState(buyer)))
      throw new MarketError("El objeto ofrecido en trueque ya no está disponible.");

    if(buyer.phase==="inside"){
      const used=await db.query<{owner_character_id:string;total:string}>(`
        SELECT owner_character_id,COALESCE(SUM(weight),0)::text AS total
        FROM market_objects WHERE owner_character_id=ANY($1::uuid[]) AND state='carried'
        GROUP BY owner_character_id
      `,[[buyer.id,seller.id]]);
      const weight=new Map(used.rows.map(x=>[x.owner_character_id,Number(x.total)]));
      const buyerAfter=(weight.get(buyer.id)??0)+(sale.weight)-(barter?.weight??0);
      const sellerAfter=(weight.get(seller.id)??0)-(sale.weight)+(barter?.weight??0);
      if(buyerAfter>4+2*buyer.strength||sellerAfter>4+2*seller.strength)
        throw new MarketError("El intercambio excede la capacidad de carga de uno de los dos.");
    }
    if(offer.credits>0){
      await wallet(db,buyer.accountId,-offer.credits,"trade_paid",requestId,sale.id);
      await wallet(db,seller.accountId,offer.credits,"trade_received",requestId,sale.id);
    }
    const changed=await db.query(`
      UPDATE market_objects SET owner_character_id=$2,listed=FALSE,
        condition=GREATEST(0,condition-1)
      WHERE id=$1 AND owner_character_id=$3 AND state=$4 AND listed=TRUE
    `,[sale.id,buyer.id,seller.id,storageState(seller)]);
    if(changed.rowCount!==1)throw new MarketError("La mercancía dejó de estar disponible.");
    if(barter){
      const exchanged=await db.query(`
        UPDATE market_objects SET owner_character_id=$2,listed=FALSE,
          condition=GREATEST(0,condition-1)
        WHERE id=$1 AND owner_character_id=$3 AND state=$4
      `,[barter.id,seller.id,buyer.id,storageState(buyer)]);
      if(exchanged.rowCount!==1)throw new MarketError("El objeto de trueque dejó de estar disponible.");
    }
    await db.query("UPDATE trade_offers SET status='accepted' WHERE id=$1",[offerId]);
    return "Intercambio confirmado. Los objetos y créditos cambiaron de manos.";
  });
}
