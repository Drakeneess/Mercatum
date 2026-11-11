import type { Client } from "colyseus";
import {
  type MarketOperation, type ProvenanceReply,
} from "@mercatum/shared";
import {
  MarketError, marketSnapshot, merchantBuy, merchantSell, toggleListing,
} from "./storage/market.js";
import { proposeTrade, resolveOffer } from "./storage/trades.js";
import { inspectProvenance, publishClaim } from "./storage/provenance.js";
import { pool } from "./storage/db.js";
import { isUuid } from "./domain/marketRules.js";

export interface MarketConnection {
  client: Client;
  characterId: string;
  name: string;
}
/** Marketplace transport boundary. No balance, item ownership or ledger
 * decisions happen in the browser or in MercatumRoom. */
export class MarketGateway {
  constructor(
    private readonly connections: () => readonly MarketConnection[],
    private readonly sendIdentity: (client:Client)=>Promise<void>,
  ) {}

  private current(client:Client):MarketConnection | undefined {
    return this.connections().find(x=>x.client.sessionId===client.sessionId);
  }
  private async guarded(client:Client,work:()=>Promise<void>):Promise<void>{
    try{await work();}
    catch(error){
      const message=error instanceof MarketError?error.message:"Operación de mercado fallida.";
      if(!(error instanceof MarketError))console.error("[Mercatum] Market:",error);
      client.send("market_error",{message});
    }
  }
  async snapshot(client:Client):Promise<void>{
    await this.guarded(client,async()=>{
      const actor=this.current(client);
      if(!actor)return;
      const connected=this.connections().map(x=>({
        sessionId:x.client.sessionId,characterId:x.characterId,name:x.name,
      }));
      client.send("market_snapshot",await marketSnapshot(actor.characterId,connected));
    });
  }
  async provenance(client:Client,payload:unknown):Promise<void>{
    await this.guarded(client,async()=>{
      const actor=this.current(client);if(!actor)return;
      const itemId=payload&&typeof payload==="object"&&"itemId" in payload
        ? (payload as {itemId?:unknown}).itemId:null;
      if(!isUuid(itemId))throw new MarketError("Identificador de objeto inválido.");
      const record:ProvenanceReply=await inspectProvenance(actor.characterId,itemId);
      client.send("provenance",record);
    });
  }
  async operate(client:Client,payload:unknown):Promise<void>{
    await this.guarded(client,async()=>{
      const actor=this.current(client);
      if(!actor)return;
      if(!payload || typeof payload!=="object")throw new MarketError("Solicitud inválida.");
      const value=payload as Record<string,unknown>;
      if(!isUuid(value.requestId))throw new MarketError("Falta el identificador de solicitud.");
      const requestId=value.requestId;
      const kind=value.kind;
      let result:string;
      if(kind==="buy"||kind==="sell"||kind==="list"||kind==="claim"||kind==="offer"){
        if(!isUuid(value.itemId))throw new MarketError("Objeto inválido.");
        const itemId=value.itemId;
        if(kind==="buy")result=await merchantBuy(actor.characterId,requestId,itemId);
        else if(kind==="sell")result=await merchantSell(actor.characterId,requestId,itemId);
        else if(kind==="list"){
          if(value.value!==1 && value.value!==0)throw new MarketError("Marca de publicación inválida.");
          result=await toggleListing(actor.characterId,requestId,itemId,value.value===1);
        }else if(kind==="claim"){
          result=await publishClaim(actor.characterId,requestId,itemId,value.statement);
        }else{
          const other=typeof value.peerSessionId==="string"
            ? this.connections().find(x=>x.client.sessionId===value.peerSessionId)
            : undefined;
          if(!other)throw new MarketError("El destinatario no está conectado.");
          result=await proposeTrade(actor.characterId,other.characterId,itemId,
            value.value,value.barterItemId===undefined?null:value.barterItemId as string,requestId);
        }
      }else if(kind==="accept"||kind==="decline"){
        if(!isUuid(value.offerId))throw new MarketError("Oferta inválida.");
        if(kind==="accept"){
          const ids=await pool.query<{buyer_id:string;seller_id:string}>(
            "SELECT buyer_id,seller_id FROM trade_offers WHERE id=$1",[value.offerId]);
          const offer=ids.rows[0];
          if(!offer)throw new MarketError("No existe la oferta.");
          const present=new Set(this.connections().map(x=>x.characterId));
          if(!present.has(offer.buyer_id)||!present.has(offer.seller_id))
            throw new MarketError("Ambas partes deben estar conectadas para confirmar.");
        }
        result=await resolveOffer(actor.characterId,requestId,value.offerId,kind==="accept");
      }else throw new MarketError("La operación no está permitida.");

      client.send("market_result",{message:result,requestId});
      // Refresh private inventories and balances for every connected player;
      // no other player's credits or inventory are publicly broadcast.
      for(const connection of this.connections()){
        connection.client.send("market_update",{});
        await this.sendIdentity(connection.client);
      }
    });
  }
}
