"use client";

import type { CharacterStats, HexCoordinate, PlayerSnapshot, StatKey } from "@mercatum/shared";
import type { Connection } from "../hooks/useMercatumRoom";
import { CharacterSheet } from "./CharacterSheet";

export interface ExplorerColumnProps {
  me?: PlayerSnapshot;
  currentPosition?: HexCoordinate;
  connection: Connection;
  committedBuild: CharacterStats | null;
  draftStats: CharacterStats;
  characterStats: CharacterStats;
  pointsLeft: number;
  adjustStat: (stat: StatKey, change: -1 | 1) => void;
  setDraftStats: (stats: CharacterStats) => void;
  enterMarket: () => void;
  movementDelayMs: number;
  marketTime: string;
}

export function ExplorerColumn(props: ExplorerColumnProps) {
  const {
    me, currentPosition, connection, committedBuild, draftStats,
    characterStats, pointsLeft, adjustStat, setDraftStats, enterMarket,
    movementDelayMs, marketTime,
  } = props;
  return (
        <aside className="side-column side-column--entry" aria-label="Registro del explorador">
          <section className="paper-piece entry-ticket">
            <div className="piece-meta"><span>COMPROBANTE DE INGRESO</span><span>FORMA / 17-C</span></div>
            <div className="section-number" aria-hidden="true">01</div>
            <h1>{committedBuild ? <>Está<br />usted <em>dentro.</em></> : <>Aún está<br /><em>afuera.</em></>}</h1>
            <p className="smudged-copy">{committedBuild ? "No se garantiza que el edificio recuerde por dónde entró." : "Complete el registro antes de atravesar la puerta."}</p>
            <div className="torn-rule" aria-hidden="true" />
            <div className="field">
              <span className="field-label">NOMBRE ANOTADO</span>
              <strong>{me?.name ?? "SIN IDENTIFICAR"}</strong>
            </div>
            <div className="field">
              <span className="field-label">ÚLTIMA LOCALIZACIÓN</span>
              <strong className="mono">{currentPosition ? "Q " + (currentPosition.q >= 0 ? "+" : "") + currentPosition.q + " / R " + (currentPosition.r >= 0 ? "+" : "") + currentPosition.r : "— / —"}</strong>
            </div>
            <div className="field">
              <span className="field-label">SITUACIÓN ACTUAL</span>
              <strong>{connection === "online" ? "DENTRO DEL PERÍMETRO" : "NO VERIFICADA"}</strong>
            </div>
            <div className="entry-stamp" aria-hidden="true">{committedBuild ? <>ACEPTADO<br />BAJO RIESGO</> : <>PENDIENTE<br />DE FIRMA</>}</div>
            <div className="ticket-bottom" aria-hidden="true"><span>NO ES UN SEGURO DE VIDA</span><span>///////</span></div>
          </section>

          <CharacterSheet
            committedBuild={committedBuild} draftStats={draftStats}
            characterStats={characterStats} pointsLeft={pointsLeft}
            adjustStat={adjustStat} setDraftStats={setDraftStats}
            enterMarket={enterMarket} movementDelayMs={movementDelayMs}
          />
          <section className="paper-piece clock-ticket">
            <div className="piece-meta">HORA DE REFERENCIA / MERCATUM</div>
            <div className="market-time mono">{marketTime}</div>
            <div className="clock-offset">UTC − 06:00 / TIEMPO FIJO</div>
            <p>Su reloj no tiene autoridad dentro de este lugar.</p>
          </section>

          <section className="hand-note">
            <div className="hand-note-icon" aria-hidden="true">!</div>
            <div>
              <strong>UNA OBSERVACIÓN</strong>
              <p>Algo puede estar al otro lado de la puerta. O puede no haber nada. No tenemos forma de prometerlo.</p>
            </div>
          </section>
        </aside>


  );
}
