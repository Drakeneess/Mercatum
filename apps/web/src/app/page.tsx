"use client";

import { Client, type Room } from "@colyseus/sdk";
import {
  ATTRIBUTE_POINTS,
  BALANCED_STATS,
  CREATION_MAX_STAT,
  getMovementDelayMs,
  parseCharacterStats,
  spentAttributePoints,
  STARTING_STAT,
  STAT_INFO,
  hexDistance,
  hexKey,
  makeDemoMap,
  MERCATUM_ROOM_NAME,
  type CharacterStats,
  type HexCoordinate,
  type StatKey,
  type HexTile,
  type MercatumState,
  type MoveAccepted,
  type MoveRejected,
  type MoveRequest,
  type PlayerSnapshot,
} from "@mercatum/shared";
import { useEffect, useMemo, useRef, useState } from "react";

const HEX_SIZE = 33;
const COLYSEUS_URL = process.env.NEXT_PUBLIC_COLYSEUS_URL || "http://localhost:3001";
type Connection = "connecting" | "online" | "offline";
type ThemeId = "oxide" | "phosphor" | "vigil";

const THEME_STORAGE_KEY = "mercatum.ui.theme";
const THEMES: ReadonlyArray<{ id: ThemeId; name: string; description: string; tag: string }> = [
  { id: "oxide", name: "Libro de incidencias", description: "Fotocopias, humedad y tinta roja.", tag: "PAPEL" },
  { id: "phosphor", name: "Cinta de vigilancia", description: "Monitor viejo, imagen dañada.", tag: "VIDEO" },
  { id: "vigil", name: "Turno de cierre", description: "Recibos, fluorescentes y pasillos vacíos.", tag: "RECIBO" },
];

function isThemeId(value: string | null): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

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
  const [theme, setTheme] = useState<ThemeId>("oxide");
  const themeMenuRef = useRef<HTMLDetailsElement | null>(null);
  const activeTheme = THEMES.find((option) => option.id === theme)!;

  useEffect(() => {
    try {
      const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (isThemeId(storedTheme)) setTheme(storedTheme);
    } catch {
      // Private browsing can disable local storage; theme selection still works.
    }
  }, []);

  function selectTheme(nextTheme: ThemeId) {
    setTheme(nextTheme);
    if (themeMenuRef.current) themeMenuRef.current.open = false;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // The chosen theme remains active for the current page.
    }
  }
  const [draftStats, setDraftStats] = useState<CharacterStats>({ ...BALANCED_STATS });
  const [committedBuild, setCommittedBuild] = useState<CharacterStats | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownClock, setCooldownClock] = useState(0);
  const pointsLeft = ATTRIBUTE_POINTS - spentAttributePoints(draftStats);

  function adjustStat(stat: StatKey, change: -1 | 1) {
    if (committedBuild) return;
    setDraftStats((current) => {
      const next = current[stat] + change;
      const available = ATTRIBUTE_POINTS - spentAttributePoints(current);
      if (next < STARTING_STAT || next > CREATION_MAX_STAT || (change > 0 && available <= 0)) {
        return current;
      }
      return { ...current, [stat]: next };
    });
  }

  function enterMarket() {
    const validated = parseCharacterStats(draftStats);
    if (validated && !committedBuild) setCommittedBuild(validated);
  }

  useEffect(() => {
    if (!cooldownUntil) return;
    setCooldownClock(Date.now());
    const timer = window.setInterval(() => {
      const current = Date.now();
      setCooldownClock(current);
      if (current >= cooldownUntil) setCooldownUntil(0);
    }, 100);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

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
    // Character creation is a local draft. Do not reserve a server seat until
    // the player signs a valid sheet. Reconnect retries retain that same build.
    if (!committedBuild) return;

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
        const room = await client.join<MercatumState>(MERCATUM_ROOM_NAME, { stats: committedBuild });
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
              stats: {
                strength: player.strength,
                dexterity: player.dexterity,
                endurance: player.endurance,
                perception: player.perception,
                intellect: player.intellect,
                social: player.social,
                composure: player.composure,
              },
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
        room.onMessage("move_accepted", (message: MoveAccepted) => {
          if (!mounted) return;
          setCooldownUntil(Date.now() + message.cooldownMs);
          setNotice("Movimiento confirmado. Espera antes del siguiente paso.");
        });
        room.onMessage("move_rejected", (message: MoveRejected) => {
          if (!mounted) return;
          if (message.retryAfterMs) setCooldownUntil(Date.now() + message.retryAfterMs);
          setNotice(message.reason);
          if (!message.retryAfterMs) record(`Movimiento rechazado: ${message.reason}`);
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
          setCooldownUntil(0);
          record("Conexión interrumpida. Se intentará reconectar.");
          retry();
        });

      } catch (error) {
        if (!mounted) return;
        setConnection("offline");
        setPlayerId(null);
        setPlayers([]);
        setCooldownUntil(0);
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
  }, [committedBuild]);

  const me = useMemo(() => players.find((p) => p.id === playerId), [players, playerId]);
  const walkable = useMemo(
    () => new Set(map.filter((tile) => tile.kind !== "wall").map(hexKey)),
    [map],
  );
  const currentPosition = me?.position;
  const characterStats = me?.stats ?? committedBuild ?? draftStats;
  const movementDelayMs = getMovementDelayMs(characterStats.dexterity);
  const cooldownRemaining = Math.max(0, cooldownUntil - cooldownClock);
  const recoveryPercentage = Math.max(0, Math.min(100, 100 * (1 - cooldownRemaining / movementDelayMs)));

  function requestMove(tile: HexTile) {
    const room = roomRef.current;
    if (!currentPosition || connection !== "online" || !room) {
      setNotice("Necesitas una conexión activa para desplazarte.");
      return;
    }
    if (Date.now() < cooldownUntil) {
      setNotice("Aún estás recuperando el paso.");
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
    <div className="app-shell" data-theme={theme}>
      <div className="filth" aria-hidden="true" />
      <div className="screen-damage" aria-hidden="true" />

      <header className="masthead">
        <div className="masthead-serial">
          <span>AVISO Nº 001 / DOCUMENTO EN MAL ESTADO</span>
          <span>SE DESCONOCE EL ORIGEN DEL EDIFICIO</span>
        </div>
        <div className="masthead-main">
          <div className="title-block">
            <span className="title-overline">ESTO NO ES UN DESTINO TURÍSTICO.</span>
            <div className="brand-name" aria-label="Mercatum">MERCATUM<span className="brand-slash" aria-hidden="true">/</span></div>
            <span className="title-under">EL MERCADO ESTÁ ABIERTO. <b>NO SABEMOS POR QUÉ.</b></span>
          </div>
          <div className="masthead-controls">
            <details className="theme-picker" ref={themeMenuRef}>
              <summary className="theme-trigger" aria-label={"Elegir tema visual, actual: " + activeTheme.name}>
                <span className="theme-trigger-number">[ 03 ]</span>
                <span className="theme-trigger-label">CAMBIAR SOPORTE</span>
                <strong>{activeTheme.name}</strong>
                <span className="theme-trigger-arrow" aria-hidden="true">▼</span>
              </summary>
              <div className="theme-dropdown">
                <div className="theme-dropdown-heading">TRES VERSIONES DEL MISMO EXPEDIENTE</div>
                <div className="theme-options" role="group" aria-label="Temas visuales">
                  {THEMES.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => selectTheme(option.id)}
                      aria-pressed={theme === option.id}
                      className={"theme-option" + (theme === option.id ? " theme-option--active" : "")}
                    >
                      <span className={"theme-swatch theme-swatch--" + option.id} aria-hidden="true">{option.tag}</span>
                      <span className="theme-option-copy"><strong>{option.name}</strong><small>{option.description}</small></span>
                      <span className="theme-option-mark" aria-hidden="true">{theme === option.id ? "✕" : "—"}</span>
                    </button>
                  ))}
                </div>
                <div className="theme-dropdown-foot">LA ELECCIÓN SE CONSERVA EN ESTE NAVEGADOR.</div>
              </div>
            </details>
            <div className={"connection-chip connection-chip--" + connection} aria-live="polite">
              <span className="status-dot" aria-hidden="true" />
              <span>{!committedBuild ? "SIN REGISTRO DE ENTRADA" : connection === "online" ? "CONEXIÓN ESTABLECIDA" : connection === "connecting" ? "INTENTANDO CONTACTO" : "SEÑAL PERDIDA"}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="warning-banner" aria-label="Advertencia">
        <span className="warning-cross" aria-hidden="true">✕</span>
        <strong>NO ENTRE SIN TENER UNA RAZÓN.</strong>
        <span>LAS OFERTAS NO COMPENSAN TODAS LAS PÉRDIDAS.</span>
        <span className="warning-count">01 // 01</span>
      </div>

      <main className="game-layout">
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
                  <p>DES {characterStats.dexterity}: <strong>{movementDelayMs} ms por hexágono.</strong> Los demás atributos se guardan para futuras acciones del Mercado.</p>
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
            {committedBuild && (
              <div className="footstep-meter" aria-label="Tiempo hasta el próximo movimiento">
                <div className="footstep-top">
                  <span>INTERVALO / DES {characterStats.dexterity}</span>
                  <strong>{cooldownRemaining > 0 ? (cooldownRemaining / 1000).toFixed(1) + " s" : "PASO DISPONIBLE"}</strong>
                </div>
                <div className="footstep-track"><span style={{ width: recoveryPercentage + "%" }} /></div>
              </div>
            )}
            <div className="movement-notice" role="status">{!committedBuild ? "Primero debe firmar el registro de atributos." : notice}</div>
          </div>
        </section>

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
      </main>

      <footer className="main-footer">
        <span>LA ORGANIZACIÓN / DOCUMENTO SIN GARANTÍAS</span>
        <span>MERCATUM — NO DEJAR EN EL INTERIOR DEL EDIFICIO</span>
      </footer>
    </div>
  );
}
