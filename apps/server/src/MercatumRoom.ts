import { randomUUID } from "node:crypto";
import { Room, ServerError, type Client } from "colyseus";
import {
  ENTRY, MercatumPlayer, MercatumState, hexDistance, SERVICE_DOOR,
  type ActionRequest, type CreatureSighting, type IdentityReply,
  type TimedActionReply, type WorldItemsReply,
} from "@mercatum/shared";
import { mercatumClock } from "./domain/clock.js";
import { MarketGateway } from "./MarketGateway.js";
import { pool } from "./storage/db.js";
import { ENTRY_GRACE_MS, visibleToExplorer } from "./domain/creatureLogic.js";
import { CreatureScheduler } from "./CreatureScheduler.js";
import { creaturePositions, type CreatureTick } from "./storage/creatures.js";
import { resolveMovement } from "./domain/movement.js";
import { planAction } from "./domain/actionPlan.js";
import { admit, extract, reenter, saveStep } from "./storage/characters.js";
import { characterItems, dropItem, inspectItem, pickItem, worldItems } from "./storage/objects.js";
import { doorOpen, openDoor } from "./storage/world.js";
import type { Admission } from "./storage/models.js";

type PendingAction = {
  id:string; request:ActionRequest; origin:{q:number;r:number};
  timer:ReturnType<typeof setTimeout>;
};
const MAX_PLAYERS=20;

/** A single authoritative room: networking and lifecycle only. SQL commits decisions. */
export class MercatumRoom extends Room<{state:MercatumState}> {
  maxClients=MAX_PLAYERS;
  autoDispose=false;
  patchRate=200;
  maxMessagesPerSecond=30;
  state=new MercatumState();

  private readonly sessions=new Map<string,Admission>();
  private readonly joiningTokens=new Set<string>();
  private readonly activeActions=new Map<string,PendingAction>();
  private readonly busy=new Set<string>();
  private creatures:CreatureScheduler|null=null;
  private market:MarketGateway|null=null;

  async onCreate():Promise<void>{
    this.state.mercatumTime=mercatumClock();
    this.state.doorOpen=await doorOpen();
    this.clock.setInterval(()=>{
      const now=mercatumClock();
      if(this.state.mercatumTime!==now)this.state.mercatumTime=now;
    },10_000);
    this.onMessage("move",(client,payload:unknown)=>void this.move(client,payload));
    this.onMessage("identity_request",(client)=>void this.sendIdentity(client));
    this.onMessage("world_request",(client)=>void this.sendWorld(client));
    this.onMessage("action",(client,payload:unknown)=>void this.startAction(client,payload));
    this.onMessage("cancel_action",(client)=>this.cancelAction(client,"Acción interrumpida."));
    this.onMessage("drop_item",(client,payload:unknown)=>void this.drop(client,payload));
    this.onMessage("reenter",(client)=>void this.reenter(client));
    this.onMessage("sightings_request",(client)=>void this.sendSightings(client));
    this.market=new MarketGateway(
      ()=>this.clients.flatMap(client=>{
        const current=this.sessions.get(client.sessionId);
        return current?[{client,characterId:current.character.id,name:current.character.displayName}]:[];
      }),
      client=>this.sendIdentity(client),
    );
    this.onMessage("market_request",(client)=>void this.market?.snapshot(client));
    this.onMessage("market_operation",(client,payload:unknown)=>void this.market?.operate(client,payload));
    this.onMessage("provenance_request",(client,payload:unknown)=>void this.market?.provenance(client,payload));
    // Local V1 smoke exercises extraction without external threats. Normal
    // gameplay keeps the creatures running even when nobody is connected.
    if(process.env.MERCATUM_DISABLE_CREATURES!=="1"){
      this.creatures=new CreatureScheduler(tick=>this.onCreatureTick(tick));
      await this.creatures.start();
    }
  }

  async onJoin(client:Client,options:unknown):Promise<void>{
    const token=options&&typeof options==="object"&&"token" in options
      ? (options as {token?:unknown}).token : undefined;
    if(token!==undefined){
      if(typeof token!=="string")throw new ServerError(401,"Credencial inválida.");
      if(this.joiningTokens.has(token))throw new ServerError(409,"Hay otra conexión en curso.");
      this.joiningTokens.add(token);
    }
    try {
      const admission=await admit(options);
      if([...this.sessions.values()].some(session=>session.character.id===admission.character.id))
        throw new ServerError(409,"Ese personaje ya está conectado.");
      this.sessions.set(client.sessionId,admission);
      const character=admission.character;
      this.state.players.set(client.sessionId,new MercatumPlayer({
        name:character.displayName,q:character.q,r:character.r,
        inside:character.phase==="inside",health:character.health,wounds:character.wounds,
        ...character.stats,
      }));
    } finally {
      if(typeof token==="string")this.joiningTokens.delete(token);
    }
  }

  onLeave(client:Client):void{
    this.cancelAction(client,"Acción cancelada al perder la conexión.");
    this.sessions.delete(client.sessionId);
    this.broadcast("market_update",{});
    this.busy.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    // Position, objects and movement cooldown remain saved. No free extraction.
  }

  onDispose():void{
    this.creatures?.stop();
    for(const action of this.activeActions.values())clearTimeout(action.timer);
    this.activeActions.clear();
  }

  private session(client:Client):Admission|null {
    return this.sessions.get(client.sessionId)??null;
  }
  private message(client:Client,message:string):void{
    client.send("operation_error",{message});
  }
  private async sendIdentity(client:Client):Promise<void>{
    const admission=this.session(client);
    if(!admission)return;
    const belongings=await characterItems(admission.character.id);
    const account=await pool.query<{credits:number}>(`
      SELECT a.credits FROM accounts a JOIN characters c ON c.account_id=a.id WHERE c.id=$1
    `,[admission.character.id]);
    const identity:IdentityReply={
      token:admission.token,characterId:admission.character.id,
      phase:admission.character.phase,inventory:belongings.inventory,stash:belongings.stash,
      nextMoveAt:admission.character.nextMoveAt,
      protectedUntil:admission.character.protectedUntil,
      health:admission.character.health,wounds:admission.character.wounds,
      balance:account.rows[0]?.credits??0,
    };
    client.send("identity",identity);
  }
  private async sendWorld(client?:Client):Promise<void>{
    const world:WorldItemsReply={items:await worldItems(),doorOpen:this.state.doorOpen};
    if(client)client.send("world_items",world);
    else this.broadcast("world_items",world);
  }

  /** The creature set is never a public synchronized Schema field. */
  private async sendSightings(client:Client,all?:readonly CreatureSighting[]):Promise<void>{
    const player=this.state.players.get(client.sessionId);
    if(!player||!player.inside||player.health<=0){
      client.send("sightings",{creatures:[]});
      return;
    }
    const creatures=all??await creaturePositions();
    const visible=creatures.filter(creature=>
      visibleToExplorer(
        {q:creature.q,r:creature.r},{q:player.q,r:player.r},
        player.perception,this.state.doorOpen,
      ),
    );
    client.send("sightings",{creatures:visible});
  }

  private async onCreatureTick(tick:CreatureTick):Promise<void>{
    if(!tick.moved)return;
    let changedInventory=tick.groundChanged;
    for(const attack of tick.attacks){
      const connected=[...this.sessions.entries()].find(
        ([,session])=>session.character.id===attack.characterId,
      );
      if(!connected)continue; // Disconnected characters are still harmed in SQL.
      const [sessionId,admission]=connected;
      admission.character.health=attack.report.health;
      admission.character.wounds=attack.report.wounds;
      if(attack.report.dead)admission.character.phase="dead";
      const player=this.state.players.get(sessionId);
      if(player){
        player.health=attack.report.health;
        player.wounds=attack.report.wounds;
        if(attack.report.dead)player.inside=false;
      }
      const client=this.clients.find(c=>c.sessionId===sessionId);
      if(client){
        client.send("harm",attack.report);
        if(attack.report.dead)this.cancelAction(client,"La acción terminó con el fallecimiento.");
        await this.sendIdentity(client);
      }
      if(attack.report.dead||attack.report.stolenItem)changedInventory=true;
    }
    const positions=await creaturePositions();
    await Promise.all(this.clients.map(client=>this.sendSightings(client,positions)));
    if(changedInventory){await this.sendWorld();this.broadcast("market_update",{});}
  }

  private async move(client:Client,payload:unknown):Promise<void>{
    const admission=this.session(client);
    const player=this.state.players.get(client.sessionId);
    if(!admission||!player||this.busy.has(client.sessionId))return;
    this.busy.add(client.sessionId);
    try{
      const character=admission.character;
      const from={q:player.q,r:player.r};
      const result=resolveMovement(player,payload,Date.now(),character.nextMoveAt,this.state.doorOpen);
      if(!result.ok){client.send("move_rejected",result.response);return;}
      const success=await saveStep(character.id,from,result.response.to,Date.now(),result.nextMoveAt);
      if(!success){this.message(client,"Movimiento obsoleto. Solicita reconexión.");return;}
      this.cancelAction(client,"La acción se interrumpió al desplazarte.");
      character.nextMoveAt=result.nextMoveAt;
      character.q=result.response.to.q;character.r=result.response.to.r;
      player.q=character.q;player.r=character.r;
      client.send("move_accepted",result.response);
      await this.sendSightings(client);
      this.broadcast("market_update",{});
    }catch(error){
      console.error("[Mercatum] Movement:",error);this.message(client,"No se pudo registrar el movimiento.");
    }finally{this.busy.delete(client.sessionId);}
  }

  private cancelAction(client:Client,reason:string):void{
    const active=this.activeActions.get(client.sessionId);
    if(!active)return;
    clearTimeout(active.timer);
    this.activeActions.delete(client.sessionId);
    client.send("action_cancelled",{message:reason});
  }

  private async startAction(client:Client,payload:unknown):Promise<void>{
    const admission=this.session(client);
    const player=this.state.players.get(client.sessionId);
    if(!admission||!player||this.busy.has(client.sessionId)||this.activeActions.has(client.sessionId))return;
    try{
      const ground=await worldItems();
      const plan=planAction(player,payload,this.state.doorOpen,ground);
      if(!plan.ok){this.message(client,plan.reason);return;}
      const id=randomUUID();
      const origin={q:player.q,r:player.r};
      const pending:PendingAction={
        id,request:plan.request,origin,
        timer:setTimeout(()=>void this.finishAction(client,id),plan.duration),
      };
      this.activeActions.set(client.sessionId,pending);
      const started:TimedActionReply={id,kind:plan.request.kind,finishesAt:Date.now()+plan.duration};
      client.send("action_started",started);
    }catch(error){console.error("[Mercatum] Start action:",error);this.message(client,"La acción no pudo iniciarse.");}
  }

  private async finishAction(client:Client,id:string):Promise<void>{
    const session=this.session(client);
    const pending=this.activeActions.get(client.sessionId);
    const actor=this.state.players.get(client.sessionId);
    if(!session||!pending||pending.id!==id||!actor)return;
    if(this.busy.has(client.sessionId)){
      // Retry briefly rather than resolve against an in-flight SQL movement.
      pending.timer=setTimeout(()=>void this.finishAction(client,id),40);
      return;
    }
    this.busy.add(client.sessionId);
    this.activeActions.delete(client.sessionId);
    const {request,origin}=pending;
    try{
      if(!actor.inside||actor.q!==origin.q||actor.r!==origin.r){
        this.message(client,"La acción quedó anulada por un cambio de posición.");return;
      }
      let message:string;
      if(request.kind==="open"){
        if(this.state.doorOpen||hexDistance(origin,SERVICE_DOOR)>1){this.message(client,"Ya no puedes abrir esa puerta.");return;}
        await openDoor(session.character.id);
        this.state.doorOpen=true;
        await this.sendWorld();
        message="La puerta metálica ha cedido.";
      }else if(request.kind==="inspect"){
        const item=await inspectItem(request.itemId);
        if(!item||item.q===undefined||item.r===undefined||hexDistance(origin,{q:item.q,r:item.r})>1){
          this.message(client,"El objeto ya no está aquí.");return;
        }
        message=`${item.label}: condición ${item.condition}/100, peso ${item.weight}.`;
      }else if(request.kind==="take"){
        const success=await pickItem(session.character.id,request.itemId,origin);
        if(!success){this.message(client,"No puedes recoger el objeto. Puede que alguien se lo llevara.");return;}
        await this.sendIdentity(client);
        await this.sendWorld();
        this.broadcast("market_update",{});
        message="Mercancía recogida. No es propiedad segura hasta extraerla.";
      }else{
        if(origin.q!==ENTRY.q||origin.r!==ENTRY.r){this.message(client,"Regresa a la entrada.");return;}
        const success=await extract(session.character.id);
        if(!success){this.message(client,"No se pudo completar la extracción.");return;}
        session.character.phase="outside";
        actor.inside=false;
        await this.sendIdentity(client);
        this.broadcast("market_update",{});
        message="Extracción registrada. El botín ha pasado al depósito seguro.";
      }
      client.send("action_result",{kind:request.kind,message});
    }catch(error){
      console.error("[Mercatum] Complete action:",error);
      this.message(client,"Falló la operación. Comprueba el estado del Mercado.");
    }finally{this.busy.delete(client.sessionId);}
  }

  private async drop(client:Client,payload:unknown):Promise<void>{
    const session=this.session(client);const player=this.state.players.get(client.sessionId);
    if(!session||!player||!player.inside||this.busy.has(client.sessionId)||this.activeActions.has(client.sessionId))return;
    const itemId=payload&&typeof payload==="object"&&"itemId" in payload?(payload as {itemId?:unknown}).itemId:null;
    if(typeof itemId!=="string"|| !/^[0-9a-f-]{36}$/.test(itemId)){this.message(client,"Objeto inválido.");return;}
    this.busy.add(client.sessionId);
    try{
      const success=await dropItem(session.character.id,itemId,{q:player.q,r:player.r});
      if(!success){this.message(client,"Ese objeto no está en tu inventario.");return;}
      await this.sendIdentity(client);await this.sendWorld();
      this.broadcast("market_update",{});
      client.send("operation_ok",{message:"Objeto dejado en el suelo."});
    }catch(error){console.error("[Mercatum] Drop:",error);this.message(client,"No se pudo dejar el objeto.");}
    finally{this.busy.delete(client.sessionId);}
  }

  private async reenter(client:Client):Promise<void>{
    const session=this.session(client);const player=this.state.players.get(client.sessionId);
    if(!session||!player||player.inside||this.busy.has(client.sessionId))return;
    this.busy.add(client.sessionId);
    try{
      const success=await reenter(session.character.id);
      if(!success){this.message(client,"El personaje no puede reingresar.");return;}
      session.character.phase="inside";session.character.q=ENTRY.q;session.character.r=ENTRY.r;
      session.character.health=100;session.character.wounds=0;
      session.character.protectedUntil=Date.now()+ENTRY_GRACE_MS;
      player.inside=true;player.q=ENTRY.q;player.r=ENTRY.r;
      player.health=100;player.wounds=0;
      await this.sendIdentity(client);
      await this.sendSightings(client);
      this.broadcast("market_update",{});
      client.send("operation_ok",{message:"Regreso registrado. El depósito permanece fuera del edificio."});
    }catch(error){console.error("[Mercatum] Reentry:",error);this.message(client,"No se pudo registrar la entrada.");}
    finally{this.busy.delete(client.sessionId);}
  }
}
