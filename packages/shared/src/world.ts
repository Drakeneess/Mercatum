import { hexDistance, hexKey, type HexCoordinate } from "./hex.js";
import { SECTOR_01 } from "./sectors.js";

export type TileKind = "floor" | "wall" | "entry" | "shop" | "door";

export interface HexTile extends HexCoordinate {
  readonly kind: TileKind;
}

export const ENTRY: HexCoordinate = SECTOR_01.entry;
export const SHOP: HexCoordinate = SECTOR_01.shop;
export const SERVICE_DOOR: HexCoordinate = SECTOR_01.door;

/** Static demo layout. The authoritative server validates against these tiles. */
// Legacy tile kind "wall" is kept for physical obstacles.
const OBSTACLES = new Set(SECTOR_01.obstacles.map(hexKey));
export const WALL_EDGES = SECTOR_01.walls;
function edgeKey(a: HexCoordinate,b: HexCoordinate): string {
  return [hexKey(a),hexKey(b)].sort().join("|");
}
const EDGE_KEYS = new Set(WALL_EDGES.map(({a,b})=>edgeKey(a,b)));
export function isWallBetween(a: HexCoordinate,b: HexCoordinate): boolean {
  return EDGE_KEYS.has(edgeKey(a,b));
}
/** Same tile or adjacent without a solid partition. Door rules remain separate. */
export function withinReach(a: HexCoordinate,b: HexCoordinate): boolean {
  return hexDistance(a,b)<=1 && !isWallBetween(a,b);
}

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
        : OBSTACLES.has(key) ? "wall"
        : "floor";
      tiles.push({ ...position, kind });
    }
  }
  return tiles;
}
