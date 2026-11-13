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
  // The old panel listed every object on the whole map; only show actionable
  // nearby merchandise here. Authority and visibility still belong to server.
  const reachableItems=inside?groundItems.filter(item=>
    position&&item.q!==undefined&&item.r!==undefined&&
    closeTo(position,{q:item.q,r:item.r})
  ):[];
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
              {canDoor && (
                <div className="expedition-context">
                  <div className="expedition-subheading">PUERTA DE MANTENIMIENTO</div>
                  <p className="expedition-muted">Está bloqueada. Elige un método para intentar abrirla.</p>
                  <div className="expedition-actions">
                    <button type="button" disabled={blocked}
                      onClick={()=>requestAction({kind:"open",method:"force"})}>FORZAR / FUE</button>
                    <button type="button" disabled={blocked}
                      onClick={()=>requestAction({kind:"open",method:"intellect"})}>ANALIZAR / INT</button>
                  </div>
                </div>
              )}
              <div className="expedition-subheading">OBJETOS A TU ALCANCE</div>
              {reachableItems.length===0 ? (
                <p className="expedition-muted">No hay mercancía que puedas recoger desde este hexágono.</p>
              ) : reachableItems.map(item=>(
                <div key={item.id} className="expedition-object">
                  <strong>{item.label}</strong>
                  <span className="expedition-muted">Q {item.q} / R {item.r} · ESTADO {item.condition}/100</span>
                  <div className="expedition-actions">
                    <button disabled={blocked} type="button"
                      onClick={()=>requestAction({kind:"inspect",itemId:item.id})}>EXAMINAR</button>
                    <button disabled={blocked} type="button"
                      onClick={()=>requestAction({kind:"take",itemId:item.id})}>RECOGER</button>
                  </div>
                </div>
              ))}
              <details className="expedition-inventory">
                <summary>MOCHILA <span>{identity.inventory.length} OBJETOS / EN RIESGO</span></summary>
                {identity.inventory.length===0 ?
                  <p className="expedition-muted">No llevas ningún objeto.</p> :
                  identity.inventory.map(item=>(
                    <div key={item.id} className="expedition-object">
                      <strong>{item.label}</strong>
                      <span className="expedition-muted">PESO {item.weight} · ESTADO {item.condition}/100</span>
                      <button type="button" disabled={blocked}
                        onClick={()=>dropItem(item.id)}>DEJAR EN EL SUELO</button>
                    </div>
                  ))
                }
              </details>
              <div className="expedition-subheading">SALIDA / ENTRADA 00</div>
              <p className="expedition-muted">Solo aquí puedes depositar de forma segura lo que llevas.</p>
              <button className="expedition-primary" type="button" disabled={blocked||!canExtract}
                onClick={()=>requestAction({kind:"extract"})}>EXTRAER Y DEPOSITAR</button>
            </>
          ) : (
            <>
              <p className="expedition-muted">
                La incursión terminó. El comerciante y el archivo público están disponibles
                en sus secciones. Puedes reingresar cuando lo decidas.
              </p>
              <button className="expedition-primary" type="button" disabled={blocked}
                onClick={reenter}>VOLVER A INGRESAR</button>
              <details className="expedition-inventory">
                <summary>DEPÓSITO EXTERIOR <span>{identity.stash.length} OBJETOS A SALVO</span></summary>
                {identity.stash.length===0 ? <p className="expedition-muted">Depósito vacío.</p> :
                  identity.stash.map(item=><div className="expedition-object" key={item.id}>
                    <strong>{item.label}</strong>
                    <span className="expedition-muted">ESTADO {item.condition}/100 · RESGUARDADO</span>
                  </div>)
                }
              </details>
            </>
          )}
          <div className="expedition-fineprint">SIN SEGURO. SIN DEVOLUCIONES. CERRAR LA PESTAÑA NO DETIENE A LAS CRIATURAS.</div>
        </>
      )}
    </section>
  );
}
