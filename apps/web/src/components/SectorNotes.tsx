import type { HexTile, PlayerSnapshot } from "@mercatum/shared";

interface SectorNotesProps {
  map: readonly HexTile[];
  players: readonly PlayerSnapshot[];
  events: readonly string[];
}

/** Everything shown here comes from the current shared world snapshot. */
export function SectorNotes({ map, players, events }: SectorNotesProps) {
  return (
        <aside className="side-column side-column--notes" aria-label="Notas del sector">
          <section className="paper-piece evidence-sheet">
            <div className="piece-meta"><span>EXTRACTO DE INCIDENCIAS</span><span>02 / 04</span></div>
            <h3>Se ha<br /><em>observado.</em></h3>
            <div className="observation-list">
              <div><span>PERSONAS EN EL INTERIOR</span><strong className="mono">{players.length.toString().padStart(2, "0")} / 20</strong></div>
              <div><span>ESPACIOS ANOTADOS</span><strong className="mono">{map.length}</strong></div>
              <div><span>PUESTOS IDENTIFICADOS</span><strong className="mono">{map.filter((tile) => tile.kind === "shop").length}</strong></div>
              <div><span>CRIATURAS COMPROBADAS</span><strong className="mono">SIN DATOS</strong></div>
            </div>
            <p className="margin-note">Las cifras son parciales. Este prototipo aún no simula criaturas.</p>
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
