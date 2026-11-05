import { Room, type Client } from "colyseus";
import {
  ENTRY,
  MercatumPlayer,
  MercatumState,
  hexKey,
  isNeighbor,
  makeDemoMap,
  type HexCoordinate,
  type MoveRejected,
  type MoveRequest,
} from "@mercatum/shared";

const MAX_PLAYERS = 20;
const MIN_MOVE_INTERVAL_MS = 250;
const walkableTiles = new Set(
  makeDemoMap().filter((tile) => tile.kind !== "wall").map(hexKey),
);

/** Uses fixed UTC−06:00 year-round (Etc/GMT+6 uses POSIX-inverted sign). */
function mercatumClock(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Etc/GMT+6",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

function isCoordinate(value: unknown): value is HexCoordinate {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { q?: unknown; r?: unknown };
  return Number.isSafeInteger(candidate.q) && Number.isSafeInteger(candidate.r);
}

function reject(client: Client, reason: string): void {
  const reply: MoveRejected = { reason };
  client.send("move_rejected", reply);
}

/**
 * A single authoritative world. Do not add autonomous entities here until
 * visibility is filtered for each player (otherwise their locations leak).
 */
export class MercatumRoom extends Room<{ state: MercatumState }> {
  maxClients = MAX_PLAYERS;
  autoDispose = false;
  patchRate = 200;
  maxMessagesPerSecond = 30;
  state = new MercatumState();

  private readonly lastMoveAt = new Map<string, number>();

  onCreate(): void {
    this.state.mercatumTime = mercatumClock();
    // The room is kept alive without players. No 60fps world simulation needed.
    this.clock.setInterval(() => {
      const now = mercatumClock();
      if (this.state.mercatumTime !== now) this.state.mercatumTime = now;
    }, 10_000);

    this.onMessage("move", (client, payload: unknown) => this.move(client, payload));
  }

  onJoin(client: Client): void {
    this.state.players.set(client.sessionId, new MercatumPlayer({
      name: `Explorador-${client.sessionId.slice(0, 4).toUpperCase()}`,
      q: ENTRY.q,
      r: ENTRY.r,
    }));
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.lastMoveAt.delete(client.sessionId);
  }

  private move(client: Client, payload: unknown): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    if (typeof payload !== "object" || payload === null || !("to" in payload) || !isCoordinate(payload.to)) {
      reject(client, "Coordenadas inválidas.");
      return;
    }

    const destination = payload.to;
    if (!isNeighbor({ q: player.q, r: player.r }, destination)) {
      reject(client, "Solo puedes desplazarte a un hexágono vecino.");
      return;
    }
    if (!walkableTiles.has(hexKey(destination))) {
      reject(client, "Esta casilla está bloqueada.");
      return;
    }

    const now = Date.now();
    if (now - (this.lastMoveAt.get(client.sessionId) ?? 0) < MIN_MOVE_INTERVAL_MS) {
      reject(client, "Movimiento demasiado rápido.");
      return;
    }

    this.lastMoveAt.set(client.sessionId, now);
    player.q = destination.q;
    player.r = destination.r;

    const accepted: MoveRequest = { to: destination };
    client.send("move_accepted", accepted);
    // Colyseus pushes the Schema patch to everyone. No manual broadcast.
  }
}
