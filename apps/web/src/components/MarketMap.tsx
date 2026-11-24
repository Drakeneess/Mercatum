"use client";

import { hexDistance, hexKey, WALL_EDGES, withinReach, type CharacterStats, type HexCoordinate,
  type CreatureClash, type CreatureSighting, type HexTile, type MarketItem, type PlayerSnapshot } from "@mercatum/shared";
import { getTileName, hexCenter, hexPoints, hexEdge } from "../lib/hexMapView";

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
  latestClash?:CreatureClash|null;
  onOpenShop: () => void;
}

export function MarketMap(props: MarketMapProps) {
  const { map, currentPosition, walkable, requestMove, players, playerId,
    hasBuild, characterStats, cooldownRemaining, recoveryPercentage, notice, doorOpen, groundItems, sightings, latestClash, onOpenShop } = props;
  const canWalk=players.some(p=>p.id===playerId&&p.inside);
  return (
        <section className="map-panel" aria-label="Plano interactivo del Mercado">
          <div className="map-header"><div className="map-title-line"><h2>Sector 01 <span>/ Nivel 00</span></h2><span className="map-stamp">PLANO ACTIVO</span></div></div>
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
                      onClick={() => {if(available)requestMove(tile);}}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          if(available)requestMove(tile);
                        }
                      }}
                      tabIndex={available ? 0 : -1}
                      role="button" aria-disabled={!available}
                      aria-label={`${getTileName(tile.kind)}, ${tile.q}, ${tile.r}${available ? ", accesible" : ""}`}
                    />
                    {tile.kind === "wall" && <g className="obstacle-marker" transform={`translate(${center.x} ${center.y})`}><rect x="-17" y="-15" width="34" height="30" rx="1"/><path d="M-13 -7 H13 M-13 0 H13 M-13 7 H13"/></g>}
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

              <g className="architecture-walls" aria-hidden="true">
                {WALL_EDGES.map(({a,b})=><g key={hexKey(a)+"/"+hexKey(b)}>
                  <line {...hexEdge(a,b)} className="architecture-wall-shadow"/>
                  <line {...hexEdge(a,b)} className="architecture-wall"/>
                </g>)}
              </g>
              {/* This button exists on the floor plan only while the explorer
                  stands directly in front of a mapped storefront. */}
              {canWalk && currentPosition && map.filter(tile=>
                tile.kind==="shop" && withinReach(tile,currentPosition)
              ).map(shop=>{
                const center=hexCenter(shop);
                const activate=()=>onOpenShop();
                return (
                  <g key={"visit-"+hexKey(shop)} className="shop-interaction"
                    transform={`translate(${center.x} ${center.y-46})`}
                    role="button" tabIndex={0} aria-label="Comerciar en el puesto"
                    onClick={event=>{event.stopPropagation();activate();}}
                    onKeyDown={event=>{
                      if(event.key==="Enter"||event.key===" "){
                        event.preventDefault();event.stopPropagation();activate();
                      }
                    }}>
                    <rect x="-50" y="-13" width="100" height="26" rx="3"/>
                    <text textAnchor="middle" dominantBaseline="central">COMERCIAR</text>
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
                    style={{transform:`translate(${position.x}px, ${position.y}px)`}}>
                    <path d="M0 -14 L15 12 H-15 Z" />
                    <text y="8" textAnchor="middle" className="hostile-glyph">!</text>
                    <text y="27" textAnchor="middle" className="hostile-name">{creature.name.toUpperCase()}</text>
                    <rect x="-15" y="31" width="30" height="4" className="hostile-health-base"/>
                    <rect x="-15" y="31" height="4" className="hostile-health-fill"
                      width={30*Math.max(0,Math.min(1,creature.health/creature.maxHealth))}/>
                    <title>{creature.name}: {creature.health}/{creature.maxHealth} de salud</title>
                  </g>
                );
              })}
              {latestClash&&(()=>{
                const point=hexCenter({q:latestClash.q,r:latestClash.r});
                return <g key={"clash-"+latestClash.q+"-"+latestClash.r}
                  transform={`translate(${point.x} ${point.y-42})`}
                  className="creature-clash-marker">
                  <rect x="-55" y="-14" width="110" height="29" rx="2"/>
                  <text textAnchor="middle" y="-2">COMBATE ENTRE CRIATURAS</text>
                  <text textAnchor="middle" y="10">
                    {latestClash.defeated?"DERROTA":`−${latestClash.damage} SALUD`}
                  </text>
                </g>;
              })()}
              {players.filter(p=>p.inside).map((player, index, visiblePlayers) => {
                const center = hexCenter(player.position);
                const sameCellIndex = visiblePlayers.slice(0, index).filter((other) => hexKey(other.position) === hexKey(player.position)).length;
                const x = center.x + (sameCellIndex===0?0:((sameCellIndex-1)%3-1)*13);
                const y = center.y - Math.floor(sameCellIndex / 3) * 13;
                const isMe = player.id === playerId;
                return (
                  <g key={player.id} className={isMe ? "player-marker player-me" : "player-marker player-other"} style={{transform:`translate(${x}px, ${y}px)`}}>
                    <circle r="10" className="player-ring" />
                    <path d="M0 -7 L6 6 L0 3 L-6 6 Z" className="player-core" />
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
              <span><i className="legend-icon legend-wall" /> Pared</span>
              <span><i className="legend-icon legend-obstacle" /> Obstáculo</span>
              <span><i className="legend-icon legend-hostile" /> Criatura</span>
              <span><i className="legend-icon legend-loot" /> Mercancía</span>
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
