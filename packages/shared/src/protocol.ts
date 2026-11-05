import type { HexCoordinate } from "./hex.js";

/** Fixed canonical world: never create a fresh room for a new player. */
export const MERCATUM_ROOM_NAME = "mercatum";
export const MERCATUM_ROOM_ID = "mercatum-world";

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
