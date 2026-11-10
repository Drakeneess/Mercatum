"use client";

import { Client, type Room } from "@colyseus/sdk";
import {
  hexDistance, hexKey, makeDemoMap, MERCATUM_ROOM_NAME, getMovementDelayMs,
  type CharacterStats, type HexTile, type MercatumState, type MoveAccepted,
  type MoveRejected, type MoveRequest, type PlayerSnapshot,
} from "@mercatum/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { connectionErrorMessage, snapshotPlayers } from "../lib/roomSnapshots";

const COLYSEUS_URL = process.env.NEXT_PUBLIC_COLYSEUS_URL || "http://localhost:3001";
export type Connection = "connecting" | "online" | "offline";

/** One owner for the room lifecycle, snapshots, movement and reconnect attempts. */
export function useMercatumRoom(committedBuild: CharacterStats | null, draftStats: CharacterStats) {
  const [connection, setConnection] = useState<Connection>("connecting");
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownClock, setCooldownClock] = useState(0);
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

          const snapshot = snapshotPlayers(state);
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
        const reason = connectionErrorMessage(error);
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

  return {
    connection, playerId, players, map, marketTime, notice, events, me,
    currentPosition, characterStats, movementDelayMs, cooldownRemaining,
    recoveryPercentage, walkable, requestMove,
  };
}
