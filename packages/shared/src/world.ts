import { hexKey, type HexCoordinate } from "./hex.js";
import { SECTOR_01 } from "./sectors.js";

export type TileKind = "floor" | "wall" | "entry" | "shop" | "door";

export interface HexTile extends HexCoordinate {
  readonly kind: TileKind;
}

export const ENTRY: HexCoordinate = SECTOR_01.entry;
export const SHOP: HexCoordinate = SECTOR_01.shop;
export const SERVICE_DOOR: HexCoordinate = SECTOR_01.door;

/** Static demo layout. The authoritative server validates against these tiles. */
const WALLS = new Set(SECTOR_01.walls.map(hexKey));

export function makeDemoMap(radius = SECTOR_01.radius): HexTile[] {
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
