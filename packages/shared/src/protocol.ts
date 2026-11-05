import type { HexCoordinate } from "./hex.js";

/** Canonical room name; the server precreates exactly one instance. */
export const MERCATUM_ROOM_NAME = "mercatum";

export interface PlayerSnapshot {
  readonly id: string;
  readonly name: string;
  readonly position: HexCoordinate;
}

/** One-shot commands are Colyseus messages, not synchronized Schema fields. */
export interface MoveRequest {
  readonly to: HexCoordinate;
}

export interface MoveRejected {
  readonly reason: string;
}
