"use client";

import { useState } from "react";
import type {
  IdentityReply, MarketOperation, MarketReply, MarketItem,
} from "@mercatum/shared";

export interface MarketBoardProps {
  identity: IdentityReply|null;
  market: MarketReply|null;
  operate: (request:Omit<MarketOperation,"requestId">)=>void;
  requestMarket:()=>void;
}

export function MarketBoard({identity,market,operate,requestMarket}:MarketBoardProps){
  const [selection,setSelection]=useState<{peerSessionId:string;itemId:string}|null>(null);
  const [credits,setCredits]=useState("0");
  const [barter,setBarter]=useState("");
  if(!identity||identity.phase==="dead")return null;
  const outside=identity.phase==="outside";
  const transferable=new Set((outside?identity.stash:identity.inventory).map(item=>item.id));
  const own=market?.own.filter(item=>transferable.has(item.id))??[];
  const offerAmount=Number(credits);
  const validOffer=Number.isInteger(offerAmount)&&offerAmount>=0&&offerAmount<=100000;
  const offerItem=market?.peers.flatMap(peer=>peer.listed.map(item=>({...item,peer})))
    .find(x=>x.id===selection?.itemId&&x.peer.sessionId===selection.peerSessionId);
  return (
    <section className="paper-piece commerce-sheet" aria-label="Mercado y trueque">
      <div className="piece-meta"><span>HOJA DE TRANSACCIONES</span><span>V3 / NO GARANTIZADO</span></div>
      <h3>¿Cuánto <em>vale?</em></h3>
      <div className="commerce-balance">
        <span>SALDO DECLARADO / CRÉDITOS INTERNOS</span>
        <strong>{market?.credits??identity.balance}</strong>
        <button type="button" onClick={requestMarket}>ACTUALIZAR REGISTROS</button>
      </div>
      <p className="expedition-muted">
        No existe precio justo obligatorio. El estado del objeto y tu Trato alteran la tasación del comerciante;
        las ofertas entre personas pueden ser absurdas, engañosas o generosas.
      </p>
      <div className="expedition-subheading">PUESTO DE COMPRAVENTA / EXTERIOR</div>
      {!outside ? <p className="expedition-muted">El comerciante opera fuera del edificio. Extrae primero para negociar con él.</p> : (
        market?.stock.length ? market.stock.map(item=>(
          <div className="commerce-entry" key={item.id}>
            <strong>{item.label}</strong>
            <small>ESTADO {item.condition}/100 · PESO {item.weight} · ID {item.id.slice(0,8)}</small>
            <div className="commerce-entry-actions">
              <span>PRECIO / {item.price} CR</span>
              <button type="button" disabled={!market||market.credits<item.price}
                onClick={()=>operate({kind:"buy",itemId:item.id})}>COMPRAR</button>
            </div>
          </div>
        )) : <p className="expedition-muted">No quedan artículos en el mostrador.</p>
      )}
      <div className="expedition-subheading">MIS OBJETOS / OFERTAS PÚBLICAS</div>
      {!own.length ? <p className="expedition-muted">Sin mercancía comerciable en esta ubicación.</p> :
        own.map(item=>(
          <div className="commerce-entry" key={item.id}>
            <strong>{item.label}</strong>
            <small>ESTADO {item.condition}/100 · {item.listed?"ANUNCIADO":"NO ANUNCIADO"}</small>
            <div className="commerce-entry-actions">
              <button type="button" onClick={()=>operate({kind:"list",itemId:item.id,value:item.listed?0:1})}>
                {item.listed?"RETIRAR ANUNCIO":"ANUNCIAR"}
              </button>
              {outside&&<button type="button" onClick={()=>operate({kind:"sell",itemId:item.id})}>
                VENDER / +{item.resalePrice} CR
              </button>}
            </div>
          </div>
        ))
      }
      <div className="expedition-subheading">EXPLORADORES DISPONIBLES / trueque</div>
      <p className="expedition-muted">Solo aparecen anuncios voluntarios de exploradores próximos, o de quienes están fuera contigo.</p>
      {!market?.peers.length ? <p className="expedition-muted">Nadie al alcance para negociar.</p> :
        market.peers.map(peer=>(
          <div className="commerce-peer" key={peer.sessionId}>
            <strong>{peer.name}</strong>
            {!peer.listed.length ? <small>No ha publicado mercancía.</small> :
              peer.listed.map(item=>(
                <div className="commerce-entry" key={item.id}>
                  <span>{item.label} · {item.condition}/100</span>
                  <button type="button" onClick={()=>{
                    setSelection({peerSessionId:peer.sessionId,itemId:item.id});
                    setCredits("0");setBarter("");
                  }}>HACER OFERTA</button>
                </div>
              ))}
          </div>
        ))
      }
      {selection&&offerItem&&(
        <div className="commerce-offer-form">
          <strong>OFERTA A {offerItem.peer.name}</strong>
          <p>Por: {offerItem.label} · estado {offerItem.condition}/100</p>
          <label htmlFor="offer-credits">CRÉDITOS A ENTREGAR</label>
          <input id="offer-credits" inputMode="numeric" type="number" min={0} max={100000}
            value={credits} onChange={e=>setCredits(e.target.value)}/>
          <label htmlFor="barter-item">OBJETO DE TRUEQUE (OPCIONAL)</label>
          <select id="barter-item" value={barter} onChange={e=>setBarter(e.target.value)}>
            <option value="">SIN OBJETO ADICIONAL</option>
            {own.filter(item=>item.id!==selection.itemId).map(item=>
              <option key={item.id} value={item.id}>{item.label} · {item.condition}/100</option>)}
          </select>
          <p className="expedition-muted">La otra persona debe aceptar; nada se transfiere todavía. La oferta caduca en tres minutos.</p>
          <div className="commerce-entry-actions">
            <button disabled={!validOffer} type="button" onClick={()=>{
              operate({kind:"offer",peerSessionId:selection.peerSessionId,itemId:selection.itemId,
                value:offerAmount,...(barter?{barterItemId:barter}:{})});
              setSelection(null);
            }}>ENVIAR OFERTA</button>
            <button type="button" onClick={()=>setSelection(null)}>CANCELAR</button>
          </div>
        </div>
      )}
      <div className="expedition-subheading">PROPUESTAS PENDIENTES</div>
      {!market?.offers.length ? <p className="expedition-muted">Ninguna oferta sin resolver.</p> :
        market.offers.map(offer=>(
          <div className="commerce-entry" key={offer.id}>
            <strong>{offer.direction==="incoming"?"RECIBIDA":"ENVIADA"} · {offer.item.label}</strong>
            <small>{offer.direction==="incoming"?offer.fromName:"En espera de la otra parte"}
              {" · "}{offer.credits} CR
              {offer.barterItem?" + "+offer.barterItem.label:""}
              {" · "}{new Date(offer.expiresAt).toLocaleTimeString()}</small>
            <div className="commerce-entry-actions">
              {offer.direction==="incoming"&&
                <button onClick={()=>operate({kind:"accept",offerId:offer.id})}>ACEPTAR INTERCAMBIO</button>}
              <button type="button" onClick={()=>operate({kind:"decline",offerId:offer.id})}>
                {offer.direction==="incoming"?"RECHAZAR":"CANCELAR"}
              </button>
            </div>
          </div>
        ))
      }
      <p className="expedition-fineprint">Al aceptar se transfieren los objetos y créditos en una sola transacción.
        Nadie garantiza el origen de lo que compras. Verifica el registro público fuera del Mercado.</p>
    </section>
  );
}
