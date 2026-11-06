import { Room, ServerError, type Client } from "colyseus";
import {
  ATTRIBUTE_POINTS,
  BALANCED_STATS,
  ENTRY,
  getMovementDelayMs,
  parseCharacterStats,
  spentAttributePoints,
  type CharacterStats,
  MercatumPlayer,
  MercatumState,
  hexKey,
  isNeighbor,
  makeDemoMap,
  type HexCoordinate,
  type MoveAccepted,
  type MoveRejected,
  type MoveRequest,
} from "@mercatum/shared";

const MAX_PLAYERS = 20;
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

  private readonly nextMoveAt = new Map<string, number>();

  onCreate(): void {
    this.state.mercatumTime = mercatumClock();
    // The room is kept alive without players. No 60fps world simulation needed.
    this.clock.setInterval(() => {
      const now = mercatumClock();
      if (this.state.mercatumTime !== now) this.state.mercatumTime = now;
    }, 10_000);

    this.onMessage("move", (client, payload: unknown) => this.move(client, payload));
  }

  onJoin(client: Client, options?: unknown): void {
    // Older clients without a character sheet get a balanced build.
    // Explicit builds MUST pass the full validation; client values are untrusted.
    const supplied = options && typeof options === "object" && "stats" in options
      ? (options as { stats: unknown }).stats
      : undefined;
    const stats: CharacterStats = supplied === undefined
      ? { ...BALANCED_STATS }
      : parseCharacterStats(supplied) ?? (() => { throw new ServerError(400, "Distribución de atributos inválida."); })();

    if (spentAttributePoints(stats) !== ATTRIBUTE_POINTS) {
      throw new ServerError(400, "Distribución de atributos inválida.");
    }

    this.state.players.set(client.sessionId, new MercatumPlayer({
      name: `Explorador-${client.sessionId.slice(0, 4).toUpperCase()}`,
      q: ENTRY.q,
      r: ENTRY.r,
      ...stats,
    }));
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.nextMoveAt.delete(client.sessionId);
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
    const nextAllowed = this.nextMoveAt.get(client.sessionId) ?? 0;
    if (now < nextAllowed) {
      const reply: MoveRejected = {
        reason: "Aún no puedes dar el siguiente paso.",
        retryAfterMs: nextAllowed - now,
      };
      client.send("move_rejected", reply);
      return;
    }

    // One accepted adjacent tile per cooldown, using server-owned Destreza.
    const cooldownMs = getMovementDelayMs(player.dexterity);
    this.nextMoveAt.set(client.sessionId, now + cooldownMs);
    player.q = destination.q;
    player.r = destination.r;

    const accepted: MoveAccepted = { to: destination, cooldownMs };
    client.send("move_accepted", accepted);
    // Colyseus pushes the Schema patch to everyone. No manual broadcast.
  }
}
