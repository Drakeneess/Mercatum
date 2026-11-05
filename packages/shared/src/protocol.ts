import type { HexCoordinate } from "./hex.js";
import type { HexTile } from "./world.js";

export interface PlayerSnapshot {
  readonly id: string;
  readonly name: string;
  readonly position: HexCoordinate;
}

export type ClientMessage =
  | { readonly type: "move"; readonly to: HexCoordinate };

export type ServerMessage =
  | {
      readonly type: "welcome";
      readonly playerId: string;
      readonly map: readonly HexTile[];
      readonly players: readonly PlayerSnapshot[];
      readonly mercatumTime: string;
    }
  | { readonly type: "player_joined"; readonly player: PlayerSnapshot }
  | { readonly type: "player_left"; readonly playerId: string }
  | { readonly type: "player_moved"; readonly playerId: string; readonly to: HexCoordinate }
  | { readonly type: "move_rejected"; readonly reason: string }
  | { readonly type: "clock"; readonly mercatumTime: string };
