"use client";

import { hexDistance, hexKey, type CharacterStats, type HexCoordinate,
  type CreatureSighting, type HexTile, type MarketItem, type PlayerSnapshot } from "@mercatum/shared";
import { getTileName, hexCenter, hexPoints } from "../lib/hexMapView";

export interface MarketMapProps {
  map: readonly HexTile[];
  currentPosition?: HexCoordinate;
  walkable: ReadonlySet<string>;
  requestMove: (tile: HexTile) => void;
  players: readonly PlayerSnapshot[];
  playerId: string | null;
  hasBuild: boolean;
  characterStats: CharacterStats;
  cooldownRemaining: number;
  recoveryPercentage: number;
  notice: string;
  doorOpen: boolean;
  groundItems: readonly MarketItem[];
  sightings: readonly CreatureSighting[];
}

export function MarketMap(props: MarketMapProps) {
  const { map, currentPosition, walkable, requestMove, players, playerId,
    hasBuild, characterStats, cooldownRemaining, recoveryPercentage, notice, doorOpen, groundItems, sightings } = props;
  const canWalk=players.some(p=>p.id===playerId&&p.inside);
  return (
        <section className="map-panel" aria-label="Plano interactivo del Mercado">
          <div className="map-header">
            <div className="piece-meta"><span>LEVANTAMIENTO ENCONTRADO</span><span>SECTOR 01 / NIVEL 00</span></div>
            <div className="map-title-line">
              <h2>Plano <span>incompleto.</span></h2>
              <div className="map-stamp" aria-hidden="true">NO VERIFICADO</div>
            </div>
            <p className="map-description">Papel recuperado junto a una entrada de servicio. Algunas marcas no coinciden con las observaciones.</p>
          </div>
          <div className="map-stage">
            <div className="map-grit" aria-hidden="true" />
            <div className="map-tape map-tape--top" aria-hidden="true" />
            <div className="map-tape map-tape--bottom" aria-hidden="true" />
            <span className="map-edge-note map-edge-note--left" aria-hidden="true">← NO BAJAR SOLO</span>
            <span className="map-edge-note map-edge-note--right" aria-hidden="true">FIG. 00</span>
            <svg
              viewBox="-280 -254 560 508"
              className="hex-map"
              role="group"
              aria-label="Cuadrícula hexagonal. Usa clic o Enter en una casilla contigua."
            >
              <defs>
                <pattern id="wallPattern" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)">
                  <path d="M 0 0 L 0 7" className="wall-hatch" />
                </pattern>
                <pattern id="photocopy" patternUnits="userSpaceOnUse" width="34" height="34">
                  <path d="M 2 7 l 4 1 M 24 5 l 2 1 M 9 21 l 3 -1 M 26 29 l 5 0" className="photocopy-dust" />
                </pattern>
                <filter id="playerGlow" x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur stdDeviation="2" />
                </filter>
              </defs>

              <g className="map-underwriting" aria-hidden="true">
                <path d="M-265,-194 L-219,-198 L-202,-193 M192,197 L242,194 L261,199 M-240,193 L-210,183 M204,-181 L257,-187" />
                <text x="-249" y="-211">A / 00</text>
                <text x="182" y="221">? ? ?</text>
                <text x="-245" y="222">NO FIARSE DEL CROQUIS</text>
              </g>
              {map.map((tile) => {
                const key = hexKey(tile);
                const center = hexCenter(tile);
                const available = canWalk && !!currentPosition && hexDistance(currentPosition, tile) === 1 && walkable.has(key);
                const occupied = !!currentPosition && hexKey(currentPosition) === key;
                return (
                  <g key={key}>
                    <polygon
                      points={hexPoints(tile)}
                      className={`hex-tile tile-${tile.kind}${available ? " tile-available" : ""}${occupied ? " tile-occupied" : ""}`}
                      onClick={() => requestMove(tile)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          requestMove(tile);
                        }
                      }}
                      tabIndex={available ? 0 : -1}
                      role="button"
                      aria-label={`${getTileName(tile.kind)}, ${tile.q}, ${tile.r}${available ? ", accesible" : ""}`}
                    />
                    {tile.kind === "wall" && <polygon points={hexPoints(tile)} className="hex-wall-fill" />}
                    {tile.kind === "shop" && (
                      <g className="map-icon" transform={`translate(${center.x} ${center.y})`}>
                        <text textAnchor="middle" dominantBaseline="middle" className="shop-glyph">◇</text>
                        <text y="23" textAnchor="middle" className="tile-caption">PUESTO</text>
                      </g>
                    )}
                    {tile.kind === "door" && (
                      <text className="entry-label" x={center.x} y={center.y + 8} textAnchor="middle">
                        {doorOpen ? "ABIERTO" : "CERRADO"}
                      </text>
                    )}
                    {tile.kind === "entry" && (
                      <text className="entry-label" x={center.x} y={center.y + 23} textAnchor="middle">ACCESO</text>
                    )}
                  </g>
                );
              })}

              {groundItems.map((item) => {
                if (item.q===undefined||item.r===undefined) return null;
                const center=hexCenter({q:item.q,r:item.r});
                return <g className="loot-marker" key={item.id} transform={`translate(${center.x} ${center.y-14})`}>
                  <rect x="-7" y="-7" width="14" height="14" />
                  <text textAnchor="middle" dominantBaseline="central">!</text>
                </g>;
              })}
              {sightings.map((creature)=>{
                const position=hexCenter({q:creature.q,r:creature.r});
                return (
                  <g className="hostile-marker" key={creature.id}
                    transform={`translate(${position.x} ${position.y})`}>
                    <path d="M0 -18 L13 -6 L10 10 L0 17 L-11 9 L-13 -5 Z" />
                    <text y="3" textAnchor="middle" className="hostile-glyph">?</text>
                    <text y="27" textAnchor="middle" className="hostile-name">{creature.name.toUpperCase()}</text>
                  </g>
                );
              })}
              {players.filter(p=>p.inside).map((player, index, visiblePlayers) => {
                const center = hexCenter(player.position);
                const sameCellIndex = visiblePlayers.slice(0, index).filter((other) => hexKey(other.position) === hexKey(player.position)).length;
                const x = center.x + (sameCellIndex % 3 - 1) * 13;
                const y = center.y - Math.floor(sameCellIndex / 3) * 13;
                const isMe = player.id === playerId;
                return (
                  <g key={player.id} className={isMe ? "player-marker player-me" : "player-marker player-other"} transform={`translate(${x} ${y})`}>
                    <path d="M-12 -12 L12 12 M12 -12 L-12 12" className="player-scratch" />
                    <circle r="10" className="player-ring" />
                    <circle r="3.5" className="player-core" />
                    <text textAnchor="middle" y="-20" className="player-caption">
                      {isMe ? "TÚ" : player.name.replace("Explorador-", "")}
                    </text>
                  </g>
                );
              })}
            </svg>
            <span className="map-compass" aria-hidden="true">N ↑</span>
            <span className="map-foot-mark" aria-hidden="true">CUADRÍCULA / NO A ESCALA</span>
          </div>
          <div className="map-bottom">
            <div className="map-legend">
              <span><i className="legend-icon legend-available" /> Paso posible</span>
              <span><i className="legend-icon legend-shop" /> Puesto</span>
              <span><i className="legend-icon legend-wall" /> Sin paso</span>
              <span><i className="legend-icon legend-player" /> Explorador</span>
            </div>
            {hasBuild && (
              <div className="footstep-meter" aria-label="Tiempo hasta el próximo movimiento">
                <div className="footstep-top">
                  <span>INTERVALO / DES {characterStats.dexterity}</span>
                  <strong>{cooldownRemaining > 0 ? (cooldownRemaining / 1000).toFixed(1) + " s" : "PASO DISPONIBLE"}</strong>
                </div>
                <div className="footstep-track"><span style={{ width: recoveryPercentage + "%" }} /></div>
              </div>
            )}
            <div className="movement-notice" role="status">{!hasBuild ? "Primero debe firmar el registro de atributos." : notice}</div>
          </div>
        </section>


  );
}
