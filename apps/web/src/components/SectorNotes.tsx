import type {
  ChatMessage, ChatPeer, ChatPreference, ChatPreferenceMode, ChatReportReason,
  CreatureSighting, HexTile, IdentityReply, PlayerSnapshot,
} from "@mercatum/shared";
import { ThreatReport } from "./ThreatReport";
import { NearbyChat } from "./NearbyChat";
import type { MarketActionsProps } from "./MarketActions";

interface SectorNotesProps {
  map: readonly HexTile[];
  players: readonly PlayerSnapshot[];
  events: readonly string[];
  actions: MarketActionsProps;
  identity: IdentityReply|null;
  sightings: readonly CreatureSighting[];
  chatMessages:readonly ChatMessage[];
  chatPeers:readonly ChatPeer[];
  chatPreferences:readonly ChatPreference[];
  chatNotice:string|null;
  sendChat:(text:string)=>void;
  chatPreference:(characterId:string,mode:ChatPreferenceMode|"none")=>void;
  reportChat:(messageId:string,reason:ChatReportReason)=>void;
}

/** Context actions remain next to the map. Other records are deliberately collapsed. */
export function SectorNotes({
  map,players,events,actions,identity,sightings,chatMessages,chatPeers,
  chatPreferences,chatNotice,sendChat,chatPreference,reportChat,
}:SectorNotesProps){
  return (
    <aside className="expedition-sidebar" aria-label="Acciones y observaciones de exploración">
      <NearbyChat identity={identity} connected={actions.connection==="online"}
        peers={chatPeers} messages={chatMessages} preferences={chatPreferences}
        notice={chatNotice} onSend={sendChat}
        onPreference={chatPreference} onReport={reportChat}/>
      <details className="expedition-drawer">
        <summary>INFORME MÉDICO Y ENTIDADES ACTIVAS
          <span>{identity?.wounds??0} HERIDAS / {sightings.length} FIGURAS</span>
        </summary>
        <ThreatReport identity={identity} sightings={sightings}
          position={actions.position} clock={actions.clock}/>
      </details>
      <details className="expedition-drawer">
        <summary>INCIDENCIAS RECIENTES
          <span>{events.length} ANOTACIONES</span>
        </summary>
        <div className="expedition-drawer__body">
          <div className="expedition-observations">
            <span>EXPLORADORES DENTRO <strong>{players.filter(p=>p.inside).length}</strong></span>
            <span>CASILLAS REGISTRADAS <strong>{map.length}</strong></span>
          </div>
          <ol className="expedition-drawer__log" aria-live="polite">
            {events.map((event,index)=><li key={index+"-"+event}>{event}</li>)}
          </ol>
        </div>
      </details>
    </aside>
  );
}
