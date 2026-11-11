import {
  getMovementDelayMs, hexKey, isNeighbor, makeDemoMap, SERVICE_DOOR,
  type HexCoordinate, type MercatumPlayer,
  type MoveAccepted, type MoveRejected,
} from "@mercatum/shared";

const walkableTiles = new Set(
  makeDemoMap().filter((tile) => tile.kind !== "wall").map(hexKey),
);

type Accepted = { ok: true; response: MoveAccepted; nextMoveAt: number };
type Denied = { ok: false; response: MoveRejected };
export type MovementDecision = Accepted | Denied;

function isCoordinate(value: unknown): value is HexCoordinate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { q?: unknown; r?: unknown };
  return Number.isSafeInteger(candidate.q) && Number.isSafeInteger(candidate.r);
}

/** Deterministic, testable decision without mutating Colyseus room state. */
export function resolveMovement(
  player: MercatumPlayer,
  payload: unknown,
  now: number,
  nextAllowedAt: number,
  doorOpen = true,
): MovementDecision {
  if (typeof payload !== "object" || payload === null || !("to" in payload) || !isCoordinate(payload.to)) {
    return { ok: false, response: { reason: "Coordenadas inválidas." } };
  }
  const to = payload.to;
  if (!isNeighbor({ q: player.q, r: player.r }, to)) {
    return { ok: false, response: { reason: "Solo puedes desplazarte a un hexágono vecino." } };
  }
  if (!player.inside) return { ok: false, response: { reason: "Debes reingresar al Mercado." } };
  if (!doorOpen && hexKey(to) === hexKey(SERVICE_DOOR)) {
    return { ok: false, response: { reason: "La puerta de mantenimiento sigue cerrada." } };
  }
  if (!walkableTiles.has(hexKey(to))) {
    return { ok: false, response: { reason: "Esta casilla está bloqueada." } };
  }
  if (now < nextAllowedAt) {
    return { ok: false, response: { reason: "Aún no puedes dar el siguiente paso.", retryAfterMs: nextAllowedAt - now } };
  }

  const cooldownMs = getMovementDelayMs(player.dexterity);
  return { ok: true, response: { to, cooldownMs }, nextMoveAt: now + cooldownMs };
}
