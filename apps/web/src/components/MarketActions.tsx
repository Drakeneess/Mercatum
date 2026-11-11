"use client";

import { ENTRY, SERVICE_DOOR, hexDistance,
  type ActionRequest, type HexCoordinate, type IdentityReply,
  type MarketItem, type TimedActionReply } from "@mercatum/shared";
import type { Connection } from "../hooks/useMercatumRoom";

export interface MarketActionsProps {
  connection:Connection;
  identity:IdentityReply|null;
  position?:HexCoordinate;
  groundItems:readonly MarketItem[];
  doorOpen:boolean;
  action:TimedActionReply|null;
  clock:number;
  requestAction:(request:ActionRequest)=>void;
  cancelAction:()=>void;
  dropItem:(id:string)=>void;
  reenter:()=>void;
  onNewCharacter:()=>void;
}

function closeTo(a:HexCoordinate|undefined,b:HexCoordinate):boolean {
  return Boolean(a&&hexDistance(a,b)<=1);
}

export function MarketActions(props:MarketActionsProps){
  const {connection,identity,position,groundItems,doorOpen,action,clock,
    requestAction,cancelAction,dropItem,reenter,onNewCharacter}=props;
  const ready=connection==="online"&&!!identity;
  const inside=identity?.phase==="inside";
  const blocked=!ready||!!action;
  const canDoor=inside&&!doorOpen&&closeTo(position,SERVICE_DOOR);
  const canExtract=inside&&!!position&&hexDistance(position,ENTRY)===0;
  const pendingSeconds=action?Math.max(0,(action.finishesAt-clock)/1000):0;
  return (
    <section className="paper-piece expedition-sheet" aria-label="Acciones e inventario">
      <div className="piece-meta"><span>HOJA DE RECUPERACIÓN</span><span>V1 / INCURSIÓN</span></div>
      <h3>Lo que <em>queda.</em></h3>
      {!ready ? <p className="expedition-muted">Esperando identificación del explorador...</p> : (
        <>
          <div className="expedition-status">
            <span>ESTADO DE LA INCURSIÓN</span>
            <strong>{identity.phase==="dead"?"FALLECIMIENTO CONFIRMADO":inside?"EN EL INTERIOR":"EXTRACCIÓN COMPLETADA"}</strong>
          </div>

          {action && (
            <div className="expedition-action-live" role="status">
              <strong>ACCIÓN EN CURSO / {action.kind.toUpperCase()}</strong>
              <span>{pendingSeconds.toFixed(1)} s restantes</span>
              <button type="button" onClick={cancelAction}>INTERRUMPIR</button>
            </div>
          )}

          {identity.phase==="dead" ? (
            <div className="death-record">
              <strong>EXPEDIENTE CERRADO / DEFUNCIÓN</strong>
              <p>Este personaje no puede volver. Lo que llevaba ha quedado dentro.
                El depósito exterior pertenece a la cuenta y seguirá disponible.</p>
              <button className="expedition-primary" type="button" onClick={onNewCharacter}>
                REGISTRAR SUCESOR
              </button>
            </div>
          ) : inside ? (
            <>
              <div className="expedition-subheading">PUERTA DE MANTENIMIENTO</div>
              <p className="expedition-muted">{doorOpen
                ?"La hoja de metal está abierta. El tránsito es posible."
                :"Bloquea el paso al puesto cercano. También puede rodearse."}</p>
              {!doorOpen&&(
                <div className="expedition-actions">
                  <button type="button" disabled={blocked||!canDoor}
                    onClick={()=>requestAction({kind:"open",method:"force"})}>FORZAR / FUE</button>
                  <button type="button" disabled={blocked||!canDoor}
                    onClick={()=>requestAction({kind:"open",method:"intellect"})}>ANALIZAR / INT</button>
                </div>
              )}
              <div className="expedition-subheading">OBJETOS EN EL SECTOR</div>
              {groundItems.length===0 ? (
                <p className="expedition-muted">No quedan piezas registradas en el suelo.</p>
              ) : groundItems.map(item=>{
                const near=!!position&&item.q!==undefined&&item.r!==undefined&&
                  closeTo(position,{q:item.q,r:item.r});
                return (
                  <div key={item.id} className="expedition-object">
                    <strong>{item.label}</strong>
                    <span className="expedition-muted">Q {item.q} / R {item.r} · ESTADO {item.condition}/100</span>
                    <div className="expedition-actions">
                      <button disabled={blocked||!near} type="button"
                        onClick={()=>requestAction({kind:"inspect",itemId:item.id})}>EXAMINAR</button>
                      <button disabled={blocked||!near} type="button"
                        onClick={()=>requestAction({kind:"take",itemId:item.id})}>RECOGER</button>
                    </div>
                  </div>
                );
              })}
              <div className="expedition-subheading">MOCHILA / EN RIESGO</div>
              {identity.inventory.length===0 ? <p className="expedition-muted">Sin pertenencias transportadas.</p> :
                identity.inventory.map(item=>(
                  <div key={item.id} className="expedition-object">
                    <strong>{item.label}</strong>
                    <span className="expedition-muted">Peso {item.weight} · condición {item.condition}/100</span>
                    <div className="expedition-actions">
                      <button type="button" disabled={blocked} onClick={()=>dropItem(item.id)}>DEJAR EN EL SUELO</button>
                    </div>
                  </div>
                ))
              }
              <div className="expedition-subheading">SALIDA / ENTRADA 00</div>
              <p className="expedition-muted">Solo aquí puedes depositar de forma segura lo que llevas.</p>
              <button className="expedition-primary" type="button" disabled={blocked||!canExtract}
                onClick={()=>requestAction({kind:"extract"})}>EXTRAER Y DEPOSITAR</button>
            </>
          ) : (
            <>
              <div className="expedition-subheading">DEPÓSITO EXTERIOR</div>
              <p className="expedition-muted">Estos objetos han sido extraídos y permanecen registrados fuera del edificio.</p>
              {identity.stash.length===0 ? <p className="expedition-muted">Depósito vacío.</p> :
                identity.stash.map(item=><div className="expedition-object" key={item.id}>
                  <strong>{item.label}</strong><span className="expedition-muted">ESTADO {item.condition}/100 · RESGUARDADO</span>
                </div>)
              }
              <button className="expedition-primary" type="button" disabled={blocked}
                onClick={reenter}>VOLVER A INGRESAR</button>
            </>
          )}
          <div className="expedition-fineprint">SIN SEGURO. SIN DEVOLUCIONES. CERRAR LA PESTAÑA NO REGISTRA UNA SALIDA.</div>
        </>
      )}
    </section>
  );
}
