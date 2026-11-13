import type { CreatureSighting, HexTile, IdentityReply, PlayerSnapshot } from "@mercatum/shared";
import { ThreatReport } from "./ThreatReport";
import { MarketActions, type MarketActionsProps } from "./MarketActions";

interface SectorNotesProps {
  map: readonly HexTile[];
  players: readonly PlayerSnapshot[];
  events: readonly string[];
  actions: MarketActionsProps;
  identity: IdentityReply|null;
  sightings: readonly CreatureSighting[];
}

/** Context actions remain next to the map. Other records are deliberately collapsed. */
export function SectorNotes({map,players,events,actions,identity,sightings}:SectorNotesProps){
  return (
    <aside className="expedition-sidebar" aria-label="Acciones y observaciones de exploración">
      <MarketActions {...actions} />
      <details className="expedition-drawer">
        <summary>INFORME MÉDICO Y AVISTAMIENTOS
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
