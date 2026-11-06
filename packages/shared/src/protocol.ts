import type { HexCoordinate } from "./hex.js";
import type { CharacterStats } from "./stats.js";

/** Canonical room name; the server precreates exactly one instance. */
export const MERCATUM_ROOM_NAME = "mercatum";

export interface PlayerSnapshot {
  readonly id: string;
  readonly name: string;
  readonly position: HexCoordinate;
  readonly stats: CharacterStats;
}

/** One-shot commands are Colyseus messages, not synchronized Schema fields. */
export interface MoveRequest {
  readonly to: HexCoordinate;
}

export interface MoveAccepted extends MoveRequest {
  readonly cooldownMs: number;
}

export interface MoveRejected {
  readonly retryAfterMs?: number;
  readonly reason: string;
}
