import type { CreatureSighting, HexTile, IdentityReply, PlayerSnapshot } from "@mercatum/shared";
import { ThreatReport } from "./ThreatReport";
import { MarketActions, type MarketActionsProps } from "./MarketActions";

interface SectorNotesProps {
  map: readonly HexTile[];
  players: readonly PlayerSnapshot[];
  events: readonly string[];
  actions: MarketActionsProps;
  identity: IdentityReply | null;
  sightings: readonly CreatureSighting[];
}

/** Everything shown here comes from the current shared world snapshot. */
export function SectorNotes({ map, players, events, actions, identity, sightings }: SectorNotesProps) {
  return (
        <aside className="side-column side-column--notes" aria-label="Notas del sector">
          <ThreatReport identity={identity} sightings={sightings} />
          <MarketActions {...actions} />
          <section className="paper-piece evidence-sheet">
            <div className="piece-meta"><span>EXTRACTO DE INCIDENCIAS</span><span>02 / 04</span></div>
            <h3>Se ha<br /><em>observado.</em></h3>
            <div className="observation-list">
              <div><span>PERSONAS EN EL INTERIOR</span><strong className="mono">{players.filter(player => player.inside).length.toString().padStart(2, "0")} / 20</strong></div>
              <div><span>ESPACIOS ANOTADOS</span><strong className="mono">{map.length}</strong></div>
              <div><span>PUESTOS IDENTIFICADOS</span><strong className="mono">{map.filter((tile) => tile.kind === "shop").length}</strong></div>
              <div><span>FIGURAS OBSERVABLES</span><strong className="mono">{sightings.length.toString().padStart(2, "0")} / VISTA</strong></div>
            </div>
            <p className="margin-note">El registro de avistamientos es parcial. Lo que permanece fuera de la vista no se muestra.</p>
            <div className="sheet-scratch" aria-hidden="true">?????????????</div>
          </section>
          <section className="paper-piece log-sheet">
            <div className="piece-meta"><span>REGISTRO DE CONTACTO</span><span>03 / 04</span></div>
            <h3>Lo último<br />que quedó.</h3>
            <ol className="event-list" aria-live="polite">
              {events.map((event, index) => <li key={index + "-" + event}><span className="event-number">{String(index + 1).padStart(2, "0")}</span>{event}</li>)}
            </ol>
          </section>
          <div className="closing-note">
            <span aria-hidden="true">✱</span>
            <div><strong>EL MERCADO NO CIERRA.</strong><p>Los exploradores sí desaparecen de los registros.</p></div>
          </div>
        </aside>

  );
}
