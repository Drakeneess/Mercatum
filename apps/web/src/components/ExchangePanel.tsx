"use client";

import { useState } from "react";
import type {IdentityReply, MarketOperation, MarketReply} from "@mercatum/shared";

interface ExchangePanelProps {
  identity:IdentityReply;
  market:MarketReply|null;
  operate:(request:Omit<MarketOperation,"requestId">)=>void;
}

/** Explicit offer -> explicit acceptance; merely announcing never transfers anything. */
export function ExchangePanel({identity,market,operate}:ExchangePanelProps){
  const [selection,setSelection]=useState<{peerSessionId:string;itemId:string}|null>(null);
  const [credits,setCredits]=useState("0");
  const [barter,setBarter]=useState("");
  const outside=identity.phase==="outside";
  const ownIds=new Set((outside?identity.stash:identity.inventory).map(item=>item.id));
  const own=market?.own.filter(item=>ownIds.has(item.id))??[];
  const offerAmount=Number(credits);
  const validOffer=credits.trim()!==""&&Number.isInteger(offerAmount)&&
    offerAmount>=0&&offerAmount<=100_000&&offerAmount<=(market?.credits??identity.balance);
  const offerItem=market?.peers.flatMap(peer=>peer.listed.map(item=>({...item,peer})))
    .find(x=>x.id===selection?.itemId&&x.peer.sessionId===selection.peerSessionId);
  return (
    <div className="commerce-task">
      <p className="expedition-muted">
        {outside?"Fuera del Mercado puedes negociar con otros exploradores conectados.":
        "Dentro del edificio debes estar a un hexágono de distancia para intercambiar."}
        {" "}Primero se anuncia un objeto. El comprador propone y el dueño decide.
      </p>
      <div className="expedition-subheading">01 / PUBLICAR MIS OBJETOS</div>
      {!own.length?<p className="expedition-muted">No hay piezas comerciables en esta ubicación.</p>:
        own.map(item=>(
          <div className="commerce-entry" key={item.id}>
            <strong>{item.label}</strong>
            <small>ESTADO {item.condition}/100 · {item.listed?"ANUNCIADO":"SIN ANUNCIAR"}</small>
            <button type="button" onClick={()=>operate({kind:"list",itemId:item.id,value:item.listed?0:1})}>
              {item.listed?"RETIRAR ANUNCIO":"ANUNCIAR OBJETO"}
            </button>
          </div>
        ))}
      <div className="expedition-subheading">02 / OBJETOS OFRECIDOS POR OTROS</div>
      {!market?<p className="expedition-muted">Buscando anuncios cercanos...</p>:
        market.peers.length===0?<p className="expedition-muted">No hay exploradores a distancia de intercambio.</p>:
        market.peers.map(peer=>(
          <div className="commerce-peer" key={peer.sessionId}>
            <strong>{peer.name}</strong>
            {peer.listed.length===0?<small>No ha anunciado ningún objeto.</small>:
              peer.listed.map(item=>(
                <div className="commerce-entry" key={item.id}>
                  <strong>{item.label}</strong>
                  <small>ESTADO {item.condition}/100 · REG. {item.id.slice(0,8)}</small>
                  <button type="button" onClick={()=>{
                    setSelection({peerSessionId:peer.sessionId,itemId:item.id});
                    setCredits("0");setBarter("");
                  }}>HACER OFERTA</button>
                </div>
              ))}
          </div>
        ))}
      {selection&&offerItem&&(
        <form className="commerce-offer-form" onSubmit={e=>{
          e.preventDefault();
          if(!validOffer)return;
          operate({kind:"offer",peerSessionId:selection.peerSessionId,
            itemId:selection.itemId,value:offerAmount,...(barter?{barterItemId:barter}:{})});
          setSelection(null);
        }}>
          <strong>PROPUESTA / {offerItem.peer.name}</strong>
          <p>Solicitas: {offerItem.label} · estado {offerItem.condition}/100</p>
          <label htmlFor="offer-credits">CRÉDITOS A ENTREGAR</label>
          <input id="offer-credits" inputMode="numeric" type="number" min={0}
            max={Math.min(100000,market?.credits??identity.balance)}
            value={credits} onChange={e=>setCredits(e.target.value)}/>
          <label htmlFor="barter-item">OBJETO A ENTREGAR (OPCIONAL)</label>
          <select id="barter-item" value={barter} onChange={e=>setBarter(e.target.value)}>
            <option value="">SIN OBJETO ADICIONAL</option>
            {own.filter(item=>item.id!==selection.itemId).map(item=>
              <option key={item.id} value={item.id}>{item.label} · {item.condition}/100</option>)}
          </select>
          <p className="expedition-muted">
            Solo se transfiere al aceptar. La propuesta vence en tres minutos.
          </p>
          <div className="commerce-entry-actions">
            <button disabled={!validOffer} type="submit">ENVIAR PROPUESTA</button>
            <button type="button" onClick={()=>setSelection(null)}>DESCARTAR</button>
          </div>
        </form>
      )}
      <div className="expedition-subheading">03 / OFERTAS PENDIENTES</div>
      {!market?.offers.length?<p className="expedition-muted">Sin propuestas por resolver.</p>:
        market.offers.map(offer=>(
          <div className="commerce-entry" key={offer.id}>
            <strong>{offer.direction==="incoming"?"OFERTA RECIBIDA":"OFERTA ENVIADA"} · {offer.item.label}</strong>
            <small>{offer.direction==="incoming"?offer.fromName:"En espera de aceptación"}
              {" · "}{offer.credits} CR
              {offer.barterItem?" + "+offer.barterItem.label:""}
              {" · VENCE: "}{new Date(offer.expiresAt).toLocaleTimeString()}</small>
            <div className="commerce-entry-actions">
              {offer.direction==="incoming"&&<button type="button"
                onClick={()=>operate({kind:"accept",offerId:offer.id})}>ACEPTAR</button>}
              <button type="button" onClick={()=>operate({kind:"decline",offerId:offer.id})}>
                {offer.direction==="incoming"?"RECHAZAR":"CANCELAR"}
              </button>
            </div>
          </div>
        ))}
    </div>
  );
}
