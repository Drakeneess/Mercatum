"use client";

import { useState, type FormEvent } from "react";
import type {
  ChatMessage, ChatPeer, ChatPreference, ChatPreferenceMode, ChatReportReason,
  IdentityReply,
} from "@mercatum/shared";

export interface NearbyChatProps {
  identity:IdentityReply|null;
  connected:boolean;
  peers:readonly ChatPeer[];
  messages:readonly ChatMessage[];
  preferences:readonly ChatPreference[];
  notice:string|null;
  onSend:(text:string)=>void;
  onPreference:(characterId:string,mode:ChatPreferenceMode|"none")=>void;
  onReport:(id:string,reason:ChatReportReason)=>void;
}

/** A folded communication slip: the world never exposes a global channel. */
export function NearbyChat({
  identity,connected,peers,messages,preferences,notice,onSend,onPreference,onReport,
}:NearbyChatProps){
  const [text,setText]=useState("");
  const [reporting,setReporting]=useState<string|null>(null);
  const [reason,setReason]=useState<ChatReportReason>("harassment");
  if(identity?.phase!=="inside"||identity.health<=0)return null;
  const near=peers.length;
  const canSend=connected&&near>0&&text.trim().length>0&&[...text.trim()].length<=160;
  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!canSend)return;
    onSend(text.trim());setText("");
  }
  return (
    <details className="expedition-drawer voice-drawer" aria-label="Conversación de proximidad">
      <summary>
        VOCES CERCANAS
        <span>{near?near+" EXPLORADOR"+(near===1?"":"ES")+" AL ALCANCE":"SIN VOCES"} / ABRIR</span>
      </summary>
      <div className="voice-drawer__body">
        <p className="voice-drawer__explainer">
          No hay chat global: solo te escuchan los exploradores a dos hexágonos o menos,
          sin paredes ni puertas cerradas entre ustedes.
        </p>
        <div className="voice-drawer__peers">
          <strong>AL ALCANCE</strong>
          <p>{near?peers.map(p=>p.name).join(" · "):"No hay otro explorador lo bastante cerca."}</p>
        </div>
        <ol className="voice-drawer__messages" aria-label="Voces escuchadas" aria-live="polite">
          {messages.length===0?
            <li className="voice-drawer__empty">Ninguna conversación registrada en esta sesión.</li>:
            messages.map(m=>(
              <li key={m.id} className={"voice-drawer__message"+(m.self?" voice-drawer__message--self":"")}>
                <div className="voice-drawer__message-head">
                  <strong>{m.self?"TÚ":m.senderName}</strong>
                  <time dateTime={new Date(m.at).toISOString()}>
                    {new Date(m.at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}
                  </time>
                </div>
                <p>{m.text}</p>
                {!m.self&&(
                  <details className="voice-drawer__tools">
                    <summary>CONTROLAR MENSAJE</summary>
                    <div className="voice-drawer__tool-actions">
                      <button type="button" onClick={()=>onPreference(m.senderCharacterId,"mute")}>
                        SILENCIAR
                      </button>
                      <button type="button" onClick={()=>onPreference(m.senderCharacterId,"block")}>
                        BLOQUEAR
                      </button>
                      <button type="button" onClick={()=>{setReporting(m.id);setReason("harassment");}}>
                        REPORTAR
                      </button>
                    </div>
                    {reporting===m.id&&(
                      <div className="voice-drawer__report">
                        <label htmlFor={"chat-reason-"+m.id}>MOTIVO DEL REPORTE</label>
                        <select id={"chat-reason-"+m.id} value={reason}
                          onChange={e=>setReason(e.target.value as ChatReportReason)}>
                          <option value="harassment">Acoso</option>
                          <option value="threat">Amenazas</option>
                          <option value="spam">Spam</option>
                          <option value="other">Otro</option>
                        </select>
                        <button type="button" onClick={()=>{onReport(m.id,reason);setReporting(null);}}>
                          ENVIAR REPORTE
                        </button>
                        <button type="button" onClick={()=>setReporting(null)}>CANCELAR</button>
                      </div>
                    )}
                  </details>
                )}
              </li>
            ))}
        </ol>
        <form className="voice-drawer__composer" onSubmit={submit}>
          <label htmlFor="chat-nearby-input">HABLAR / MÁXIMO 160 CARACTERES</label>
          <textarea id="chat-nearby-input" rows={2} maxLength={160}
            placeholder={near?"Habla con quienes están cerca...":"No hay nadie al alcance de tu voz"}
            disabled={!connected||near===0}
            value={text} onChange={e=>setText(e.target.value)}/>
          <button type="submit" disabled={!canSend}>DECIR EN VOZ ALTA</button>
        </form>
        {notice&&<p className="voice-drawer__notice" role="status">{notice}</p>}
        {preferences.length>0&&(
          <details className="voice-drawer__preferences">
            <summary>PERSONAS SILENCIADAS O BLOQUEADAS ({preferences.length})</summary>
            {preferences.map(pref=>(
              <div key={pref.characterId} className="voice-drawer__preference">
                <span>{pref.name} / {pref.mode==="block"?"BLOQUEADO":"SILENCIADO"}</span>
                <button type="button" onClick={()=>onPreference(pref.characterId,"none")}>
                  QUITAR RESTRICCIÓN
                </button>
              </div>
            ))}
          </details>
        )}
        <p className="voice-drawer__footer">
          Silenciar oculta las palabras de una persona. Bloquear impide escucharse mutuamente.
          Reportar conserva solo el mensaje denunciado para revisión; no sanciona automáticamente.
        </p>
      </div>
    </details>
  );
}
