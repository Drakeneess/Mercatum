"use client";
import type {IdentityReply,MarketItem} from "@mercatum/shared";
export function InventoryPanel({identity,strength,disabled,onDrop}:{
  identity:IdentityReply|null;strength:number;disabled:boolean;onDrop:(id:string)=>void;
}){
  if(!identity)return <p role="status">Esperando identificación...</p>;
  const inside=identity.phase==="inside", dead=identity.phase==="dead";
  const capacity=4+2*strength,weight=identity.inventory.reduce((n,i)=>n+i.weight,0);
  function cards(items:readonly MarketItem[],carried:boolean){
    return items.length===0?<p className="expedition-muted">Sin objetos.</p>:
      <div className="inventory-grid">{items.map(item=><article className="inventory-card" key={item.id}>
        <div className="inventory-icon" aria-hidden="true">◇</div>
        <strong>{item.label}</strong><small>REG. {item.id.slice(0,8)} · PESO {item.weight}</small>
        <span>Condición {item.condition}/100</span><div className="inventory-condition"><i style={{width:Math.max(0,Math.min(100,item.condition))+"%"}}/></div>
        {carried&&inside&&<button type="button" disabled={disabled} onClick={()=>onDrop(item.id)}>DEJAR EN EL SUELO</button>}
      </article>)}</div>;
  }
  return <section className="paper-piece inventory-sheet" aria-label="Inventario">
    <h3>Mochila <em>/ {weight} de {capacity}</em></h3>
    <p>{dead?"Expediente cerrado.":inside?"La carga que llevas está en riesgo.":"Fuera del Mercado."}</p>
    {cards(identity.inventory,true)}
    <h3>Depósito exterior</h3>
    {inside?<p>Disponible después de extraer.</p>:cards(identity.stash,false)}
  </section>;
}
