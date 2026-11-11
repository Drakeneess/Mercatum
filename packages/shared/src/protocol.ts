import type { HexCoordinate } from "./hex.js";
import type { CharacterStats } from "./stats.js";

/** Canonical room name; the server precreates exactly one instance. */
export const MERCATUM_ROOM_NAME = "mercatum";

export interface PlayerSnapshot {
  readonly id: string;
  readonly name: string;
  readonly position: HexCoordinate;
  readonly inside: boolean;
  readonly stats: CharacterStats;
  readonly health: number;
  readonly wounds: number;
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

/** V1's inventory and ground objects use private or explicitly public room messages. */
export type ExpeditionPhase = "inside" | "outside" | "dead";

export interface MarketItem {
  readonly id: string;
  readonly label: string;
  readonly weight: number;
  readonly condition: number;
  readonly q?: number;
  readonly r?: number;
}

export interface IdentityReply {
  readonly token: string;
  readonly characterId: string;
  readonly phase: ExpeditionPhase;
  readonly inventory: readonly MarketItem[];
  readonly stash: readonly MarketItem[];
  readonly nextMoveAt: number;
  readonly health: number;
  readonly wounds: number;
}

export interface WorldItemsReply {
  readonly items: readonly MarketItem[];
  readonly doorOpen: boolean;
}

export type ActionKind = "open" | "inspect" | "take" | "extract";

export type ActionRequest =
  | { readonly kind: "open"; readonly method: "force" | "intellect" }
  | { readonly kind: "inspect" | "take"; readonly itemId: string }
  | { readonly kind: "extract" };

export interface TimedActionReply {
  readonly id: string;
  readonly kind: ActionKind;
  readonly finishesAt: number;
}

export interface ActionResult {
  readonly kind: ActionKind;
  readonly message: string;
}

/** Deliberately private: no hostile coordinates are put in the public Schema. */
export type CreatureKind = "stalker" | "scavenger";
export interface CreatureSighting {
  readonly id: string;
  readonly kind: CreatureKind;
  readonly name: string;
  readonly q: number;
  readonly r: number;
}
export interface SightingsReply {
  readonly creatures: readonly CreatureSighting[];
}
export interface HarmReport {
  readonly damage: number;
  readonly health: number;
  readonly wounds: number;
  readonly message: string;
  readonly dead: boolean;
  readonly stolenItem?: string;
}
