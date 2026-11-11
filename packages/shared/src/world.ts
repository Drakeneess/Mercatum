import { hexKey, type HexCoordinate } from "./hex.js";

export type TileKind = "floor" | "wall" | "entry" | "shop" | "door";

export interface HexTile extends HexCoordinate {
  readonly kind: TileKind;
}

export const ENTRY: HexCoordinate = { q: 0, r: 0 };
export const SHOP: HexCoordinate = { q: 2, r: 0 };
export const SERVICE_DOOR: HexCoordinate = { q: 1, r: 0 };

/** Static demo layout. The authoritative server validates against these tiles. */
const WALLS = new Set(["-2,0", "-2,1", "-1,2", "0,-3", "1,-2", "2,-2", "3,1"]);

export function makeDemoMap(radius = 4): HexTile[] {
  if (!Number.isInteger(radius) || radius < 2 || radius > 12) {
    throw new RangeError("Map radius must be an integer between 2 and 12");
  }

  const tiles: HexTile[] = [];
  for (let q = -radius; q <= radius; q++) {
    const minR = Math.max(-radius, -q - radius);
    const maxR = Math.min(radius, -q + radius);
    for (let r = minR; r <= maxR; r++) {
      const position = { q, r };
      const key = hexKey(position);
      const kind: TileKind =
        key === hexKey(ENTRY) ? "entry"
        : key === hexKey(SHOP) ? "shop"
        : key === hexKey(SERVICE_DOOR) ? "door"
        : WALLS.has(key) ? "wall"
        : "floor";
      tiles.push({ ...position, kind });
    }
  }
  return tiles;
}
