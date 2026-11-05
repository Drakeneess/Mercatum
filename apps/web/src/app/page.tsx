"use client";

import { Client, type Room } from "@colyseus/sdk";
import {
  hexDistance,
  hexKey,
  makeDemoMap,
  MERCATUM_ROOM_NAME,
  type HexCoordinate,
  type HexTile,
  type MercatumState,
  type MoveRejected,
  type MoveRequest,
  type PlayerSnapshot,
} from "@mercatum/shared";
import { useEffect, useMemo, useRef, useState } from "react";

const HEX_SIZE = 33;
const COLYSEUS_URL = process.env.NEXT_PUBLIC_COLYSEUS_URL || "http://localhost:3001";
type Connection = "connecting" | "online" | "offline";

function hexCenter(position: HexCoordinate): { x: number; y: number } {
  return {
    x: HEX_SIZE * Math.sqrt(3) * (position.q + position.r / 2),
    y: HEX_SIZE * 1.5 * position.r,
  };
}

function hexPoints(position: HexCoordinate): string {
  const center = hexCenter(position);
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 180) * (60 * index - 30);
    return `${(center.x + (HEX_SIZE - 1) * Math.cos(angle)).toFixed(2)},${(
      center.y + (HEX_SIZE - 1) * Math.sin(angle)
    ).toFixed(2)}`;
  }).join(" ");
}

function getTileName(kind: HexTile["kind"]): string {
  switch (kind) {
    case "entry": return "Punto de entrada";
    case "shop": return "Puesto comercial";
    case "wall": return "Zona bloqueada";
    default: return "Pasillo";
  }
}

export default function Home() {
  const [connection, setConnection] = useState<Connection>("connecting");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [players, setPlayers] = useState<readonly PlayerSnapshot[]>([]);
  const map = useMemo(() => makeDemoMap(), []);
  const [marketTime, setMarketTime] = useState("--:--");
  const [notice, setNotice] = useState("Selecciona un hexágono vecino para desplazarte.");
  const [events, setEvents] = useState<string[]>([
    "Terminal de exploración iniciada.",
    "Esperando respuesta del servidor...",
  ]);
  const roomRef = useRef<Room<MercatumState> | null>(null);
  const failedAttemptsRef = useRef(0);

  useEffect(() => {
    let mounted = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    const client = new Client(COLYSEUS_URL);

    function record(message: string) {
      if (mounted) setEvents((previous) => [message, ...previous].slice(0, 6));
    }

    function retry() {
      if (!mounted) return;
      failedAttemptsRef.current += 1;
      const delay = Math.min(30_000, 2_000 * 2 ** Math.min(failedAttemptsRef.current - 1, 4));
      reconnectTimer = setTimeout(() => void connect(), delay);
    }

    async function connect() {
      if (!mounted) return;
      setConnection("connecting");

      try {
        // join() selects an existing world without creating another.
        const room = await client.join<MercatumState>(MERCATUM_ROOM_NAME);
        if (!mounted) {
          void room.leave();
          return;
        }

        roomRef.current = room;
        setPlayerId(room.sessionId);

        // A successful join does not guarantee that the first full Schema
        // snapshot has arrived. In particular state.players may be undefined.
        let knownPlayers: Set<string> | null = null;
        let receivedInitialState = false;
        function publishState(state: MercatumState | undefined) {
          if (!mounted || roomRef.current !== room || !state?.players) return;

          const snapshot: PlayerSnapshot[] = [];
          state.players.forEach((player, id) => {
            snapshot.push({
              id,
              name: player.name,
              position: { q: player.q, r: player.r },
            });
          });

          const nextIds = new Set(snapshot.map((player) => player.id));
          if (knownPlayers !== null) {
            for (const explorer of snapshot) {
              if (!knownPlayers.has(explorer.id) && explorer.id !== room.sessionId) {
                record(`${explorer.name} ha ingresado.`);
              }
            }
            for (const id of knownPlayers) {
              if (!nextIds.has(id) && id !== room.sessionId) {
                record("Un explorador ha abandonado el Mercado.");
              }
            }
          }

          knownPlayers = nextIds;
          setPlayers(snapshot);
          setMarketTime(state.mercatumTime);

          if (!receivedInitialState) {
            receivedInitialState = true;
            failedAttemptsRef.current = 0;
            setConnection("online");
            setNotice("Selecciona un hexágono vecino para desplazarte.");
            record("Acceso concedido. Has ingresado al Mercado.");
          }
        }

        // Subscribe first: a state update could arrive during connection.
        room.onStateChange(publishState);
        publishState(room.state);
        room.onMessage("move_accepted", (_message: MoveRequest) => {
          if (mounted) setNotice("Movimiento confirmado por el servidor.");
        });
        room.onMessage("move_rejected", (message: MoveRejected) => {
          if (!mounted) return;
          setNotice(message.reason);
          record(`Movimiento rechazado: ${message.reason}`);
        });
        room.onError((_code, message) => {
          record(`Error de comunicación: ${message}`);
        });
        room.onLeave(() => {
          if (!mounted) return;
          if (roomRef.current === room) roomRef.current = null;
          setConnection("offline");
          setPlayerId(null);
          setPlayers([]);
          record("Conexión interrumpida. Se intentará reconectar.");
          retry();
        });

      } catch (error) {
        if (!mounted) return;
        setConnection("offline");
        setPlayerId(null);
        setPlayers([]);
        const code = typeof error === "object" && error !== null && "code" in error
          ? Number(error.code) : null;
        const detail = error instanceof Error ? error.message : String(error);
        const codeLabel = Number.isFinite(code) ? ` (código ${code})` : "";
        const reason = code === 521 || code === 522
          ? `Matchmaking rechazado${codeLabel}: ${detail}. Revisa el campo worldJoinable de http://localhost:3001/health.`
          : `Error de conexión${codeLabel}: ${detail}`;
        setNotice(reason);
        record(reason);
        retry();
      }
    }

    void connect();
    return () => {
      mounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      const room = roomRef.current;
      roomRef.current = null;
      if (room) void room.leave();
    };
  }, []);

  const me = useMemo(() => players.find((p) => p.id === playerId), [players, playerId]);
  const walkable = useMemo(
    () => new Set(map.filter((tile) => tile.kind !== "wall").map(hexKey)),
    [map],
  );
  const currentPosition = me?.position;

  function requestMove(tile: HexTile) {
    const room = roomRef.current;
    if (!currentPosition || connection !== "online" || !room) {
      setNotice("Necesitas una conexión activa para desplazarte.");
      return;
    }
    if (!walkable.has(hexKey(tile))) {
      setNotice("Esta zona es inaccesible.");
      return;
    }
    if (hexDistance(currentPosition, tile) !== 1) {
      setNotice("Solo puedes moverte a uno de los seis hexágonos adyacentes.");
      return;
    }

    const message: MoveRequest = { to: { q: tile.q, r: tile.r } };
    room.send("move", message);
    setNotice("Esperando confirmación de movimiento...");
  }

  return (
    <div className="app-shell">
      <header className="main-header">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">M<span>.</span></div>
          <div>
            <div className="brand-name">MERCATUM</div>
            <div className="brand-subtitle">DEPARTAMENTO DE EXPLORACIÓN Y REGISTRO</div>
          </div>
        </div>
        <div className="header-right">
          <span className="header-edition">PROTOTIPO / EXPEDIENTE 001</span>
          <div className={`connection-chip connection-chip--${connection}`}>
            <span className="status-dot" />
            {connection === "online" ? "ENLACE ACTIVO" : connection === "connecting" ? "CONECTANDO" : "SIN CONEXIÓN"}
          </div>
        </div>
      </header>

      <main className="game-layout">
        <aside className="side-column">
          <section className="surface-panel identity-panel">
            <div className="section-label"><span className="red-line" /> IDENTIFICACIÓN</div>
            <h1>Registro de<br /><em>incursión.</em></h1>
            <p className="subdued">Credencial temporal de acceso al Mercado. Todos los movimientos son supervisados.</p>
            <div className="identity-divider" />
            <div className="meta-label">OPERADOR</div>
            <div className="meta-value">{me?.name ?? "Sin identificar"}</div>
            <div className="meta-label">COORDENADAS</div>
            <div className="meta-value mono">{currentPosition ? `Q ${currentPosition.q >= 0 ? "+" : ""}${currentPosition.q} · R ${currentPosition.r >= 0 ? "+" : ""}${currentPosition.r}` : "— / —"}</div>
            <div className="meta-label">ESTADO</div>
            <div className="meta-value">{connection === "online" ? "Dentro del Mercado" : "Fuera de servicio"}</div>
          </section>

          <section className="surface-panel clock-panel">
            <div className="section-label">RELOJ OFICIAL</div>
            <div className="market-time mono">{marketTime}</div>
            <div className="clock-footnote">UTC−06:00 <span>·</span> HORA FIJA</div>
            <p>La hora oficial del Mercado no depende de la zona horaria del explorador.</p>
          </section>

          <section className="info-note">
            <span className="info-sign">!</span>
            <div>
              <strong>PROTOCOLO DE ACCESO</strong>
              <p>Retirarse es siempre una opción válida. La supervivencia no garantiza beneficios.</p>
            </div>
          </section>
        </aside>

        <section className="map-panel" aria-label="Mapa interactivo del Mercado">
          <div className="map-panel-head">
            <div>
              <div className="section-label"><span className="red-line" /> CARTOGRAFÍA EN VIVO</div>
              <h2>Planta baja <span>/ Sector 01</span></h2>
            </div>
            <div className="map-coordinates mono">MAPA / 00-A</div>
          </div>

          <div className="map-stage">
            <div className="map-stage-grid" aria-hidden="true" />
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
                <filter id="playerGlow" x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur stdDeviation="5" />
                </filter>
              </defs>

              {map.map((tile) => {
                const key = hexKey(tile);
                const center = hexCenter(tile);
                const available = !!currentPosition && hexDistance(currentPosition, tile) === 1 && walkable.has(key);
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
                    {tile.kind === "entry" && (
                      <text className="entry-label" x={center.x} y={center.y + 23} textAnchor="middle">ACCESO</text>
                    )}
                  </g>
                );
              })}

              {players.map((player, index) => {
                const center = hexCenter(player.position);
                const sameCellIndex = players.slice(0, index).filter((other) => hexKey(other.position) === hexKey(player.position)).length;
                const x = center.x + (sameCellIndex % 3 - 1) * 13;
                const y = center.y - Math.floor(sameCellIndex / 3) * 13;
                const isMe = player.id === playerId;
                return (
                  <g key={player.id} className={isMe ? "player-marker player-me" : "player-marker player-other"} transform={`translate(${x} ${y})`}>
                    <circle r="16" className="player-aura" filter="url(#playerGlow)" />
                    <circle r="12" className="player-ring" />
                    <circle r="5" className="player-core" />
                    <text textAnchor="middle" y="-20" className="player-caption">
                      {isMe ? "TÚ" : player.name.replace("Explorador-", "")}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="map-north mono">N <span>↑</span></div>
            <div className="map-scale mono">ESCALA / HEX 01</div>
          </div>

          <div className="map-panel-footer">
            <div className="map-legend">
              <span><i className="legend-icon legend-available" /> Adyacente</span>
              <span><i className="legend-icon legend-shop" /> Comercio</span>
              <span><i className="legend-icon legend-wall" /> Bloqueado</span>
              <span><i className="legend-icon legend-player" /> Explorador</span>
            </div>
            <div className="movement-notice" role="status">{notice}</div>
          </div>
        </section>

        <aside className="side-column">
          <section className="surface-panel">
            <div className="section-label"><span className="red-line" /> OPERACIONES</div>
            <h3>Estado del sector</h3>
            <div className="stat-row"><span>Exploradores conectados</span><strong className="mono">{players.length.toString().padStart(2, "0")} / 20</strong></div>
            <div className="stat-row"><span>Casillas registradas</span><strong className="mono">{map.length}</strong></div>
            <div className="stat-row"><span>Comercios conocidos</span><strong className="mono">{map.filter((tile) => tile.kind === "shop").length}</strong></div>
            <div className="stat-row"><span>Entidades activas</span><strong className="mono">—</strong></div>
            <p className="panel-caption">El prototipo todavía no simula criaturas ni inventarios.</p>
          </section>

          <section className="surface-panel events-panel">
            <div className="section-label">BITÁCORA / SISTEMA</div>
            <h3>Registro reciente</h3>
            <ol className="event-list" aria-live="polite">
              {events.map((event, index) => <li key={`${index}-${event}`}>{event}</li>)}
            </ol>
          </section>

          <section className="notice-panel">
            <div className="notice-symbol">✳</div>
            <div>
              <strong>EL MERCADO PERMANECE.</strong>
              <p>Los exploradores son temporales. Los registros, no necesariamente.</p>
            </div>
          </section>
        </aside>
      </main>

      <footer className="main-footer">
        <span>LA ORGANIZACIÓN <span className="footer-separator">/</span> SISTEMA DE REGISTRO EXPERIMENTAL</span>
        <span className="mono">MERCATUM · EST. 001</span>
      </footer>
    </div>
  );
}
