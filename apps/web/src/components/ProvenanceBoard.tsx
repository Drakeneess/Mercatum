"use client";

import { useState } from "react";
import type {
  IdentityReply, MarketOperation, MarketReply, ProvenanceReply,
} from "@mercatum/shared";
interface ProvenanceBoardProps {
  identity:IdentityReply|null;
  market:MarketReply|null;
  record:ProvenanceReply|null;
  inspect:(id:string)=>void;
  operate:(request:Omit<MarketOperation,"requestId">)=>void;
}
export function ProvenanceBoard({identity,market,record,inspect,operate}:ProvenanceBoardProps){
  const [id,setId]=useState("");
  const [statement,setStatement]=useState("");
  if(identity?.phase!=="outside")return null;
  const options=[
    ...identity.stash,...identity.inventory,
    ...(market?.stock??[]),
    ...(market?.peers.flatMap(p=>p.listed)??[]),
  ];
  const known=[...new Map(options.map(x=>[x.id,x])).values()];
  const selected=record?.itemId===id?record:null;
  return (
    <section className="paper-piece provenance-sheet" aria-label="Registro público de objetos">
      <div className="piece-meta"><span>ARCHIVO DE PROCEDENCIA</span><span>FUERA DEL PERÍMETRO</span></div>
      <h3>Consta, <em>dicen.</em></h3>
      <p className="expedition-muted">El registro distingue hechos del sistema y declaraciones de personas.
        Una afirmación puede ser falsa hasta que aparezca una prueba que la contradiga.</p>
      <label htmlFor="object-register">IDENTIFICADOR PÚBLICO DEL OBJETO</label>
      <input id="object-register" type="text" spellCheck={false} value={id}
        placeholder="UUID del objeto..." onChange={e=>setId(e.target.value.trim())}/>
      <select aria-label="Seleccionar objeto conocido" value={known.some(x=>x.id===id)?id:""}
        onChange={e=>setId(e.target.value)}>
        <option value="">OBJETOS CONOCIDOS / ELEGIR</option>
        {known.map(item=><option key={item.id} value={item.id}>{item.label} · {item.id.slice(0,8)}</option>)}
      </select>
      <button className="commerce-register-button" type="button" disabled={!id}
        onClick={()=>inspect(id)}>CONSULTAR ANOTACIONES</button>
      {selected&&(
        <div className="provenance-history">
          <strong>REGISTRO CONSULTADO / {selected.itemId.slice(0,8)}</strong>
          {!selected.history.length?<p>Sin anotaciones.</p>:selected.history.map(event=>(
            <div key={event.id} className={"provenance-event provenance-event--"+event.kind}>
              <span>{event.kind==="fact"?"HECHO REGISTRADO":"DECLARACIÓN NO VERIFICADA"}</span>
              <strong>{event.author}</strong>
              <small>{new Date(event.at).toLocaleString()}</small>
              <p>{event.kind==="fact"
                ? event.eventType+" — "+(event.detail??"")
                : event.statement}</p>
            </div>
          ))}
        </div>
      )}
      <div className="expedition-subheading">DEJAR CONSTANCIA</div>
      <label htmlFor="registry-statement">TESTIMONIO / HASTA 240 CARACTERES</label>
      <textarea id="registry-statement" rows={3} maxLength={240} value={statement}
        placeholder="Este cuchillo participó en una expedición legendaria..."
        onChange={e=>setStatement(e.target.value)}/>
      <button className="commerce-register-button" type="button"
        disabled={!id||statement.trim().length<4}
        onClick={()=>{
          operate({kind:"claim",itemId:id,statement:statement.trim()});
          setStatement("");
        }}>PUBLICAR TESTIMONIO ATRIBUIDO</button>
      <p className="expedition-fineprint">Tu identidad de cuenta queda unida a la declaración.
        No podrá editarse ni eliminarse desde el juego. Puedes publicar otra que la contradiga.
        Máximo tres testimonios por hora.</p>
    </section>
  );
}
