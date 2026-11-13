"use client";

import type {CreatureSighting, HexCoordinate, IdentityReply, TimedActionReply} from "@mercatum/shared";
import type {Connection} from "../hooks/useMercatumRoom";
import type {WorkspaceView} from "./WorkspaceNavigation";

interface ExpeditionStatusProps {
  identity:IdentityReply|null;
  position?:HexCoordinate;
  creatures:readonly CreatureSighting[];
  time:string;
  connection:Connection;
  action:TimedActionReply|null;
  onNavigate:(view:WorkspaceView)=>void;
}

export function ExpeditionStatus({
  identity,position,creatures,time,connection,action,onNavigate,
}:ExpeditionStatusProps){
  const phase=identity?.phase;
  const health=identity?.health??0;
  const danger=phase==="inside"&&creatures.length>0;
  return (
    <div className={"expedition-quickbar"+(danger?" expedition-quickbar--danger":"")}
      aria-label="Resumen de la incursión">
      <button type="button" className="expedition-quickbar__identity"
        onClick={()=>onNavigate("character")}
        title="Abrir ficha de personaje">
        <span>EXPLORADOR / ESTADO</span>
        <strong>{!identity?"SIN IDENTIFICAR":phase==="dead"?"DEFUNCIÓN":
          phase==="outside"?"FUERA DEL MERCADO":"EN EL INTERIOR"}</strong>
      </button>
      <div className="expedition-quickbar__metric" aria-label="Salud">
        <span>SALUD</span><strong>{identity?health+"/100":"—"}</strong>
      </div>
      <div className="expedition-quickbar__metric">
        <span>POSICIÓN</span><strong>{position?"Q "+position.q+" · R "+position.r:"— / —"}</strong>
      </div>
      <div className="expedition-quickbar__metric">
        <span>HORA MERCATUM</span><strong>{time}</strong>
      </div>
      <div className="expedition-quickbar__metric">
        <span>CRÉDITOS</span><strong>{identity?.balance??"—"}</strong>
      </div>
      <div className="expedition-quickbar__warning" role="status">
        {connection!=="online"?"SIN CONEXIÓN":
          action?"ACCIÓN EN CURSO: "+action.kind.toUpperCase():
          danger?creatures.length+" FIGURA"+(creatures.length===1?"":"S")+" A LA VISTA":
          phase==="dead"?"REGISTRO CERRADO":
          phase==="outside"?"DEPÓSITO SEGURO":"SIN AMENAZAS VISIBLES"}
      </div>
    </div>
  );
}
