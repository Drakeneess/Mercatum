"use client";

import { useEffect, useState } from "react";
import type {IdentityReply, MarketOperation, MarketReply} from "@mercatum/shared";
import { MerchantPanel } from "./MerchantPanel";
import { ExchangePanel } from "./ExchangePanel";

export interface MarketBoardProps {
  identity:IdentityReply|null;
  market:MarketReply|null;
  operate:(request:Omit<MarketOperation,"requestId">)=>void;
  requestMarket:()=>void;
}
type CommerceSection="merchant"|"exchange";

/** Two distinct jobs. Shopping never buries pending player offers. */
export function MarketBoard({identity,market,operate,requestMarket}:MarketBoardProps){
  const [section,setSection]=useState<CommerceSection>("merchant");
  useEffect(()=>{
    if(identity?.phase==="inside")setSection("exchange");
  },[identity?.phase]);
  if(!identity||identity.phase==="dead")return (
    <div className="workspace-gate" role="status">
      <strong>REGISTRO NO DISPONIBLE</strong>
      <p>Necesitas una identidad activa para comerciar.</p>
    </div>
  );
  const outside=identity.phase==="outside";
  const pending=market?.offers.filter(offer=>offer.direction==="incoming").length??0;
  return (
    <section className="paper-piece commerce-sheet" aria-label="Mercado y trueque">
      <div className="piece-meta"><span>HOJA DE TRANSACCIONES</span><span>V3 / SIN GARANTÍAS</span></div>
      <h3>¿Cuánto <em>vale?</em></h3>
      <div className="commerce-balance">
        <span>SALDO / CRÉDITOS INTERNOS</span>
        <strong>{market?.credits??identity.balance}</strong>
        <button type="button" onClick={requestMarket}>ACTUALIZAR</button>
      </div>
      <div className="commerce-sections" role="group" aria-label="Operaciones comerciales">
        <button type="button" aria-pressed={section==="merchant"}
          className={section==="merchant"?"commerce-sections__active":""}
          onClick={()=>setSection("merchant")}>
          COMERCIANTE <small>{outside?"COMPRAR / VENDER":"SOLO EXTERIOR"}</small>
        </button>
        <button type="button" aria-pressed={section==="exchange"}
          className={section==="exchange"?"commerce-sections__active":""}
          onClick={()=>setSection("exchange")}>
          INTERCAMBIOS <small>{pending?pending+" OFERTAS RECIBIDAS":"OFERTAS / TRUEQUE"}</small>
        </button>
      </div>
      {section==="merchant"?
        <MerchantPanel identity={identity} market={market} operate={operate}/>:
        <ExchangePanel identity={identity} market={market} operate={operate}/>}
      <p className="expedition-fineprint">
        El servidor confirma la propiedad y el saldo. El precio que otros proponen no tiene por qué ser justo.
        Consulta el Archivo exterior para investigar la historia de cada objeto.
      </p>
    </section>
  );
}
