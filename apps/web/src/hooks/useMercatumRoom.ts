"use client";

import { Client, type Room } from "@colyseus/sdk";
import {
  hexDistance, hexKey, makeDemoMap, MERCATUM_ROOM_NAME, getMovementDelayMs,
  type ActionRequest, type ActionResult, type CharacterStats, type HexTile,
  type IdentityReply, type MarketItem, type MercatumState, type MoveAccepted,
  type MoveRejected, type MoveRequest, type PlayerSnapshot, type TimedActionReply,
  type WorldItemsReply,
} from "@mercatum/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { connectionErrorMessage, snapshotPlayers } from "../lib/roomSnapshots";

const COLYSEUS_URL=process.env.NEXT_PUBLIC_COLYSEUS_URL || "http://localhost:3001";
const SESSION_KEY="mercatum.session.token";
export type Connection="connecting"|"online"|"offline";

function readToken():string|null {
  try{return window.localStorage.getItem(SESSION_KEY);}
  catch{return null;}
}

/** Network ownership, state snapshots and commands for one persistent expedition. */
export function useMercatumRoom(committedBuild:CharacterStats|null,draftStats:CharacterStats){
  const [connection,setConnection]=useState<Connection>("connecting");
  const [playerId,setPlayerId]=useState<string|null>(null);
  const [players,setPlayers]=useState<readonly PlayerSnapshot[]>([]);
  const [marketTime,setMarketTime]=useState("--:--");
  const [notice,setNotice]=useState("Firma el registro para ingresar.");
  const [events,setEvents]=useState<string[]>(["Terminal de exploración iniciada."]);
  const [identity,setIdentity]=useState<IdentityReply|null>(null);
  const [groundItems,setGroundItems]=useState<readonly MarketItem[]>([]);
  const [doorOpen,setDoorOpen]=useState(false);
  const [action,setAction]=useState<TimedActionReply|null>(null);
  const [cooldownUntil,setCooldownUntil]=useState(0);
  const [clock,setClock]=useState(0);
  const roomRef=useRef<Room<MercatumState>|null>(null);
  const failedAttempts=useRef(0);
  const map=useMemo(()=>makeDemoMap(),[]);

  useEffect(()=>{
    if(!cooldownUntil && !action)return;
    const id=window.setInterval(()=>{
      const now=Date.now();
      setClock(now);
      if(cooldownUntil&&now>=cooldownUntil)setCooldownUntil(0);
    },100);
    return ()=>window.clearInterval(id);
  },[cooldownUntil,action]);

  useEffect(()=>{
    if(!committedBuild)return;
    let mounted=true;
    let retryTimer:ReturnType<typeof setTimeout>|undefined;
    const client=new Client(COLYSEUS_URL);

    function record(message:string){
      if(mounted)setEvents(previous=>[message,...previous].slice(0,6));
    }
    function retry(){
      if(!mounted)return;
      failedAttempts.current++;
      const delay=Math.min(30_000,2000*2**Math.min(failedAttempts.current-1,4));
      retryTimer=setTimeout(()=>void connect(),delay);
    }
    async function connect(){
      if(!mounted)return;
      setConnection("connecting");
      try{
        const token=readToken();
        const joinOptions=token?{token}:{stats:committedBuild};
        const room=await client.join<MercatumState>(MERCATUM_ROOM_NAME,joinOptions);
        if(!mounted){void room.leave();return;}
        roomRef.current=room;
        setPlayerId(room.sessionId);

        let knownPlayers:Set<string>|null=null;
        let initialized=false;
        function publish(state:MercatumState|undefined){
          if(!mounted||roomRef.current!==room||!state?.players)return;
          const snapshot=snapshotPlayers(state);
          const next=new Set(snapshot.map(p=>p.id));
          if(knownPlayers){
            for(const p of snapshot){
              if(!knownPlayers.has(p.id)&&p.id!==room.sessionId)record(p.name+" ha ingresado.");
            }
            for(const id of knownPlayers){
              if(!next.has(id)&&id!==room.sessionId)record("Un explorador se ha marchado.");
            }
          }
          knownPlayers=next;
          setPlayers(snapshot);
          setMarketTime(state.mercatumTime);
          setDoorOpen(state.doorOpen);
          if(!initialized){
            initialized=true;
            failedAttempts.current=0;
            setConnection("online");
            setNotice("Busca mercancía, recoge y regresa a la entrada para extraer.");
            record("Acceso concedido. El registro sigue abierto.");
          }
        }

        room.onStateChange(publish);
        publish(room.state);
        room.onMessage("identity",(reply:IdentityReply)=>{
          if(!mounted)return;
          try{window.localStorage.setItem(SESSION_KEY,reply.token);}
          catch{setNotice("No se pudo guardar la credencial: no recargues la página.");}
          setIdentity(reply);
          const now=Date.now();
          setClock(now);
          setCooldownUntil(reply.nextMoveAt>now?reply.nextMoveAt:0);
        });
        room.onMessage("world_items",(reply:WorldItemsReply)=>{
          if(!mounted)return;
          setGroundItems(reply.items);
          setDoorOpen(reply.doorOpen);
        });
        room.onMessage("move_accepted",(message:MoveAccepted)=>{
          if(!mounted)return;
          const now=Date.now();
          setClock(now);
          setCooldownUntil(now+message.cooldownMs);
          setNotice("Paso registrado.");
        });
        room.onMessage("move_rejected",(message:MoveRejected)=>{
          if(!mounted)return;
          if(message.retryAfterMs){
            const now=Date.now();
            setClock(now);
            setCooldownUntil(now+message.retryAfterMs);
          }
          setNotice(message.reason);
          if(!message.retryAfterMs)record(message.reason);
        });
        room.onMessage("action_started",(reply:TimedActionReply)=>{
          if(mounted)setAction(reply);
        });
        room.onMessage("action_cancelled",(reply:{message:string})=>{
          if(!mounted)return;
          setAction(null);
          setNotice(reply.message);
        });
        room.onMessage("action_result",(reply:ActionResult)=>{
          if(!mounted)return;
          setAction(null);
          setNotice(reply.message);
          record(reply.message);
        });
        room.onMessage("operation_error",(reply:{message:string})=>{
          if(!mounted)return;
          setAction(null);
          setNotice(reply.message);
          record(reply.message);
        });
        room.onMessage("operation_ok",(reply:{message:string})=>{
          if(!mounted)return;
          setNotice(reply.message);
          record(reply.message);
        });
        room.onError((_code,message)=>record("Error de comunicación: "+message));
        room.onLeave(()=>{
          if(!mounted)return;
          if(roomRef.current===room)roomRef.current=null;
          setConnection("offline");
          setPlayerId(null);
          setPlayers([]);
          setIdentity(null);
          setAction(null);
          record("Señal interrumpida. El personaje permanece en el Mercado.");
          retry();
        });
        // Register listeners before requesting any private credentials or loot.
        room.send("identity_request");
        room.send("world_request");
      }catch(error){
        if(!mounted)return;
        setConnection("offline");
        setPlayerId(null);
        setPlayers([]);
        setIdentity(null);
        setAction(null);
        const reason=connectionErrorMessage(error);
        setNotice(reason);
        record(reason);
        retry();
      }
    }
    void connect();
    return ()=>{
      mounted=false;
      if(retryTimer)clearTimeout(retryTimer);
      const room=roomRef.current;
      roomRef.current=null;
      if(room)void room.leave();
    };
  },[committedBuild]);

  const me=useMemo(()=>players.find(p=>p.id===playerId),[players,playerId]);
  const currentPosition=me?.position;
  const walkable=useMemo(()=>new Set(map.filter(tile=>
    tile.kind!=="wall" && (tile.kind!=="door" || doorOpen)
  ).map(hexKey)),[map,doorOpen]);
  const characterStats=me?.stats??committedBuild??draftStats;
  const movementDelayMs=getMovementDelayMs(characterStats.dexterity);
  const cooldownRemaining=Math.max(0,cooldownUntil-clock);
  const recoveryPercentage=Math.min(100,Math.max(0,100*(1-cooldownRemaining/movementDelayMs)));

  function requestMove(tile:HexTile){
    const room=roomRef.current;
    if(!room||connection!=="online"||!currentPosition||!me?.inside){
      setNotice("Tu personaje no puede desplazarse.");return;
    }
    if(action){setNotice("Cancela la acción antes de caminar.");return;}
    if(Date.now()<cooldownUntil){setNotice("Aún estás recuperando el paso.");return;}
    if(!walkable.has(hexKey(tile))){setNotice("No hay paso por esa casilla.");return;}
    if(hexDistance(currentPosition,tile)!==1){setNotice("Solo puedes avanzar a un vecino.");return;}
    const message:MoveRequest={to:{q:tile.q,r:tile.r}};
    room.send("move",message);
    setNotice("Esperando confirmación...");
  }
  function requestAction(request:ActionRequest){
    if(connection!=="online"||!roomRef.current||action)return;
    roomRef.current.send("action",request);
    setNotice("El servidor está evaluando la acción...");
  }
  function cancelAction(){roomRef.current?.send("cancel_action");}
  function dropItem(itemId:string){roomRef.current?.send("drop_item",{itemId});}
  function reenter(){roomRef.current?.send("reenter");}

  return {
    connection,playerId,players,map,marketTime,notice,events,me,currentPosition,
    characterStats,movementDelayMs,cooldownRemaining,recoveryPercentage,walkable,requestMove,
    identity,groundItems,doorOpen,action,clock,requestAction,cancelAction,dropItem,reenter,
  };
}
