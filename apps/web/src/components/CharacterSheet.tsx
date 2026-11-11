"use client";

import {
  ATTRIBUTE_POINTS, BALANCED_STATS, CREATION_MAX_STAT,
  STARTING_STAT, STAT_INFO, type CharacterStats, type StatKey,
} from "@mercatum/shared";

export interface CharacterSheetProps {
  committedBuild: CharacterStats | null;
  draftStats: CharacterStats;
  characterStats: CharacterStats;
  pointsLeft: number;
  adjustStat: (stat: StatKey, change: -1 | 1) => void;
  setDraftStats: (stats: CharacterStats) => void;
  enterMarket: () => void;
  movementDelayMs: number;
}

/** Human aptitudes are printed on a damaged intake form. */
export function CharacterSheet(props: CharacterSheetProps) {
  const { committedBuild, draftStats, characterStats, pointsLeft,
    adjustStat, setDraftStats, enterMarket, movementDelayMs } = props;
  return (
          <section className="paper-piece character-sheet" aria-label="Atributos de personaje">
            <div className="piece-meta"><span>ANEXO / APTITUDES HUMANAS</span><span>07 RASGOS</span></div>
            <h3>{committedBuild ? "Lo que puede hacer." : "¿Quién entra?"}</h3>
            <p className="attribute-explanation">
              {committedBuild
                ? "Estas aptitudes fueron registradas al ingresar. No pueden modificarse durante esta incursión."
                : "Todos comienzan con una aptitud ordinaria. Redistribuya siete puntos; puede restar de un rasgo para elevar otro."}
            </p>
            {!committedBuild && (
              <div className="build-presets" aria-label="Distribuciones recomendadas">
                <button type="button" onClick={() => setDraftStats({ ...BALANCED_STATS })}>EQUILIBRADO</button>
                <button type="button" onClick={() => setDraftStats({ ...BALANCED_STATS, dexterity: 3, strength: 1 })}>CORREDOR</button>
                <button type="button" onClick={() => setDraftStats({ ...BALANCED_STATS, perception: 3, social: 1 })}>RASTREADOR</button>
              </div>
            )}
            <div className="stat-list">
              {STAT_INFO.map((stat) => (
                <div key={stat.key} className={"attribute-row" + (stat.active ? " attribute-row--active" : "")}>
                  <div className="attribute-name">
                    <span className="attribute-abbr">{stat.short}</span>
                    <span><strong>{stat.name}</strong><small>{stat.description}</small></span>
                  </div>
                  <div className="attribute-controls">
                    {!committedBuild && (
                      <button type="button" aria-label={"Reducir " + stat.name}
                        disabled={draftStats[stat.key] <= STARTING_STAT}
                        onClick={() => adjustStat(stat.key, -1)}>−</button>
                    )}
                    <strong className="attribute-number">{characterStats[stat.key]}</strong>
                    {!committedBuild && (
                      <button type="button" aria-label={"Aumentar " + stat.name}
                        disabled={draftStats[stat.key] >= CREATION_MAX_STAT || pointsLeft <= 0}
                        onClick={() => adjustStat(stat.key, 1)}>+</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="attribute-foot">
              {committedBuild ? (
                <>
                  <div className="attribute-seal">FICHA FIRMADA / SIN ENMIENDAS</div>
                  <p>DES {characterStats.dexterity}: <strong>{movementDelayMs} ms por hexágono.</strong> FUE limita la carga y permite forzar; INT permite analizar puertas. RES, PER y TEM participan en la supervivencia.</p>
                </>
              ) : (
                <>
                  <div className="point-budget">PUNTOS SIN ASIGNAR <strong>{pointsLeft.toString().padStart(2, "0")} / {ATTRIBUTE_POINTS}</strong></div>
                  <p>DES controla el intervalo real entre pasos: <strong>{movementDelayMs} ms</strong> con esta build.</p>
                  <button className="enter-button" type="button"
                    disabled={pointsLeft !== 0}
                    onClick={enterMarket}>
                    FIRMAR REGISTRO / ENTRAR →
                  </button>
                </>
              )}
            </div>
          </section>


  );
}
