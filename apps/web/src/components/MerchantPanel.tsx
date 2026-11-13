"use client";

import type {IdentityReply, MarketOperation, MarketReply} from "@mercatum/shared";

interface MerchantPanelProps {
  identity:IdentityReply;
  market:MarketReply|null;
  operate:(request:Omit<MarketOperation,"requestId">)=>void;
}

/** NPC stock and player sell-back stay in the same task context. */
export function MerchantPanel({identity,market,operate}:MerchantPanelProps){
  if(identity.phase!=="outside")return (
    <div className="commerce-section-note">
      <strong>VENTANILLA CERRADA DESDE EL INTERIOR</strong>
      <p>El comerciante está fuera del edificio. Vuelve a la entrada y completa una extracción
        para comprar o vender. Para negociar con exploradores cercanos, abre «Intercambios».</p>
    </div>
  );
  const items=market?.own.filter(item=>identity.stash.some(stored=>stored.id===item.id))??[];
  return (
    <div className="commerce-task">
      <div className="expedition-subheading">01 / MERCANCÍA DEL MOSTRADOR</div>
      <p className="expedition-muted">El stock es finito. Alguien puede llevarse una pieza antes que tú.</p>
      {!market?<p className="expedition-muted">Consultando inventario del comerciante...</p>:
        market.stock.length===0?<p className="expedition-muted">No quedan artículos a la venta.</p>:
        market.stock.map(item=>(
          <div className="commerce-entry" key={item.id}>
            <strong>{item.label}</strong>
            <small>ESTADO {item.condition}/100 · PESO {item.weight} · REG. {item.id.slice(0,8)}</small>
            <div className="commerce-entry-actions">
              <span>{item.price} CR</span>
              <button type="button" disabled={market.credits<item.price}
                onClick={()=>operate({kind:"buy",itemId:item.id})}>COMPRAR</button>
            </div>
          </div>
        ))}
      <div className="expedition-subheading">02 / VENDER DESDE MI DEPÓSITO</div>
      {items.length===0?<p className="expedition-muted">No hay objetos depositados para vender.</p>:
        items.map(item=>(
          <div className="commerce-entry" key={item.id}>
            <strong>{item.label}</strong>
            <small>ESTADO {item.condition}/100 · REG. {item.id.slice(0,8)}</small>
            <div className="commerce-entry-actions">
              <span>TASACIÓN / +{item.resalePrice??"?"} CR</span>
              <button type="button" onClick={()=>operate({kind:"sell",itemId:item.id})}>VENDER</button>
            </div>
          </div>
        ))}
    </div>
  );
}
