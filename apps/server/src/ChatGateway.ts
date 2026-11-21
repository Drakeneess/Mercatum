import { randomUUID } from "node:crypto";
import type { Client } from "colyseus";
import type {
  ChatMessage, ChatPeer, ChatPreference, ChatPreferenceMode, ChatReportReason,
} from "@mercatum/shared";
import { pool } from "./storage/db.js";
import { isUuid } from "./domain/marketRules.js";
import {
  CHAT_REPORT_WINDOW_MS, ChatThrottle, chatReachable, parseChatText,
  type Speaker,
} from "./domain/chatRules.js";

export interface ChatConnection extends Speaker {
  readonly client: Client;
  readonly accountId: string;
  readonly characterId: string;
  readonly name: string;
}
type Relationship = {
  owner_account_id: string;
  target_account_id: string;
  mode: ChatPreferenceMode;
};
type DeliveredMessage = {
  id: string;
  at: number;
  senderAccountId: string;
  senderCharacterId: string;
  senderName: string;
  text: string;
};
const REASONS:ReadonlySet<string>=new Set(["harassment","threat","spam","other"]);

/**
 * Text mimics local speech, not a persistent/global channel. Each recipient
 * is chosen server-side from current world positions and acoustic obstruction.
 * No ordinary conversation is written to PostgreSQL.
 */
export class ChatGateway {
  private readonly throttle=new ChatThrottle();
  private readonly receipts=new Map<string,DeliveredMessage[]>();
  constructor(
    private readonly connections:()=>readonly ChatConnection[],
    private readonly isDoorOpen:()=>boolean,
  ){}

  private current(client:Client):ChatConnection|undefined {
    return this.connections().find(x=>x.client.sessionId===client.sessionId);
  }
  private error(client:Client,reason:string):void {
    client.send("chat_error",{message:reason});
  }
  private async guarded(client:Client,work:()=>Promise<void>):Promise<void>{
    try{await work();}
    catch(error){
      console.error("[Mercatum] Chat:",error);
      this.error(client,"No se pudo procesar la operación de comunicación.");
    }
  }
  private nearby(actor:ChatConnection):ChatConnection[] {
    return this.connections().filter(other=>
      other.characterId!==actor.characterId &&
      chatReachable(actor,other,this.isDoorOpen()));
  }
  private async relationships(accountId:string,others:readonly string[]):Promise<Relationship[]> {
    if(!others.length)return [];
    const result=await pool.query<Relationship>(`
      SELECT owner_account_id,target_account_id,mode FROM chat_relationships
      WHERE (owner_account_id=$1 AND target_account_id=ANY($2::uuid[]))
         OR (target_account_id=$1 AND owner_account_id=ANY($2::uuid[]))
    `,[accountId,others]);
    return result.rows;
  }
  private blocked(a:string,b:string,rels:readonly Relationship[]):boolean {
    return rels.some(r=>r.mode==="block"&&
      (r.owner_account_id===a&&r.target_account_id===b ||
       r.owner_account_id===b&&r.target_account_id===a));
  }
  private canHear(sender:string,recipient:string,rels:readonly Relationship[]):boolean {
    return !this.blocked(sender,recipient,rels) &&
      !rels.some(r=>r.owner_account_id===recipient &&
        r.target_account_id===sender && r.mode==="mute");
  }
  private async preferences(accountId:string):Promise<ChatPreference[]> {
    const result=await pool.query<{
      character_id:string;display_name:string;mode:ChatPreferenceMode;
    }>(`
      SELECT c.id AS character_id,c.display_name,rel.mode
      FROM chat_relationships rel
      JOIN LATERAL (
        SELECT id,display_name FROM characters
        WHERE account_id=rel.target_account_id
        ORDER BY created_at DESC,id DESC LIMIT 1
      ) c ON TRUE
      WHERE rel.owner_account_id=$1
      ORDER BY c.display_name,rel.target_account_id LIMIT 100
    `,[accountId]);
    return result.rows.map(x=>({
      characterId:x.character_id,name:x.display_name,mode:x.mode,
    }));
  }
  async snapshot(client:Client):Promise<void>{
    await this.guarded(client,async()=>{
      const actor=this.current(client);if(!actor)return;
      const peers=this.nearby(actor);
      const rels=await this.relationships(actor.accountId,peers.map(p=>p.accountId));
      if(!this.current(client))return;
      const visible:ChatPeer[]=peers.filter(peer=>!this.blocked(actor.accountId,peer.accountId,rels))
        .map(peer=>({characterId:peer.characterId,name:peer.name}));
      client.send("chat_peers",{
        peers:visible,
        preferences:await this.preferences(actor.accountId),
      });
    });
  }
  notifyPeers():void {
    for(const actor of this.connections())void this.snapshot(actor.client);
  }
  onLeave(client:Client):void {
    this.receipts.delete(client.sessionId);
  }
  private remember(client:Client,item:DeliveredMessage):void {
    const since=Date.now()-CHAT_REPORT_WINDOW_MS;
    const previous=(this.receipts.get(client.sessionId)??[]).filter(x=>x.at>=since);
    this.receipts.set(client.sessionId,[...previous,item].slice(-40));
  }
  send(client:Client,payload:unknown):void {
    // Synchronously consume the quota before any database awaits. Parallel
    // chat_send messages cannot bypass the limiter by racing their queries.
    const actor=this.current(client);if(!actor)return;
    const text=payload&&typeof payload==="object"&&"text" in payload
      ? parseChatText((payload as {text:unknown}).text):null;
    if(text===null){this.error(client,"El mensaje debe contener entre 1 y 160 caracteres.");return;}
    if(actor.phase!=="inside"||actor.health<=0){
      this.error(client,"Solo puedes hablar mientras estás vivo dentro del Mercado.");return;
    }
    if(!this.throttle.allowed(actor.accountId,Date.now())){
      this.error(client,"Hablas demasiado rápido. Deja un intervalo entre mensajes.");return;
    }
    void this.guarded(client,async()=>{
      const nearby=this.nearby(actor);
      if(!nearby.length){this.error(client,"No hay nadie al alcance de tu voz.");return;}
      const rels=await this.relationships(actor.accountId,nearby.map(x=>x.accountId));
      // Re-evaluate both ends AFTER SQL, including movement during query.
      const fresh=this.current(client);
      if(!fresh||fresh.phase!=="inside"||fresh.health<=0)return;
      const actual=this.nearby(fresh).filter(other=>
        this.canHear(fresh.accountId,other.accountId,rels));
      // A newly arrived recipient without relationship data is not part of
      // the original verified audience; no delivery until next message.
      const original=new Set(nearby.map(x=>x.client.sessionId));
      const recipients=actual.filter(x=>original.has(x.client.sessionId));
      const at=Date.now(),id=randomUUID();
      const message:ChatMessage={
        id,senderCharacterId:fresh.characterId,senderName:fresh.name,text,at,self:false,
      };
      client.send("chat_message",{...message,self:true});
      for(const recipient of recipients){
        recipient.client.send("chat_message",message);
        this.remember(recipient.client,{
          id,at,senderAccountId:fresh.accountId,
          senderCharacterId:fresh.characterId,senderName:fresh.name,text,
        });
      }
    });
  }
  preference(client:Client,payload:unknown):void {
    void this.guarded(client,async()=>{
      const actor=this.current(client);if(!actor)return;
      if(!payload||typeof payload!=="object") {
        this.error(client,"Preferencia inválida.");return;
      }
      const data=payload as Record<string,unknown>;
      if(!isUuid(data.characterId)||
        !["mute","block","none"].includes(String(data.mode))){
        this.error(client,"Preferencia inválida.");return;
      }
      const target=await pool.query<{account_id:string}>(`
        SELECT account_id FROM characters WHERE id=$1
      `,[data.characterId]);
      const targetId=target.rows[0]?.account_id;
      if(!targetId||targetId===actor.accountId){
        this.error(client,"No se puede modificar ese explorador.");return;
      }
      if(data.mode==="none"){
        await pool.query(`
          DELETE FROM chat_relationships
          WHERE owner_account_id=$1 AND target_account_id=$2
        `,[actor.accountId,targetId]);
      }else{
        await pool.query(`
          INSERT INTO chat_relationships(owner_account_id,target_account_id,mode)
          VALUES($1,$2,$3)
          ON CONFLICT(owner_account_id,target_account_id)
          DO UPDATE SET mode=EXCLUDED.mode
        `,[actor.accountId,targetId,data.mode]);
      }
      client.send("chat_notice",{message:data.mode==="none"?"Restricción levantada.":
        data.mode==="mute"?"Explorador silenciado.":"Explorador bloqueado."});
      this.notifyPeers();
    });
  }
  report(client:Client,payload:unknown):void {
    void this.guarded(client,async()=>{
      const actor=this.current(client);if(!actor)return;
      if(!payload||typeof payload!=="object"){
        this.error(client,"Reporte inválido.");return;
      }
      const data=payload as Record<string,unknown>;
      if(!isUuid(data.messageId)||!REASONS.has(String(data.reason))){
        this.error(client,"Selecciona un mensaje recibido y un motivo.");return;
      }
      const received=(this.receipts.get(client.sessionId)??[]).find(r=>
        r.id===data.messageId && Date.now()-r.at<=CHAT_REPORT_WINDOW_MS);
      if(!received||received.senderAccountId===actor.accountId){
        this.error(client,"Solo puedes reportar mensajes que recibiste recientemente.");return;
      }
      await pool.query(`
        INSERT INTO chat_reports(
          id,reporter_account_id,sender_account_id,message_id,reason,evidence_text
        ) VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(reporter_account_id,message_id) DO NOTHING
      `,[randomUUID(),actor.accountId,received.senderAccountId,
        received.id,data.reason,received.text]);
      client.send("chat_notice",{message:"Reporte registrado para revisión. No se aplicó una sanción automática."});
    });
  }
}
