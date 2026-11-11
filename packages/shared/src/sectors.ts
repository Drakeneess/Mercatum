import type { HexCoordinate } from "./hex.js";

/** Data describing sectors, independent of SVG and network state. */
export interface SectorDefinition {
  readonly id: string;
  readonly title: string;
  readonly floor: number;
  readonly radius: number;
  readonly entry: HexCoordinate;
  readonly shop: HexCoordinate;
  readonly door: HexCoordinate;
  readonly walls: readonly HexCoordinate[];
}

/** The prototype's first floor; future sectors can be registered by ID. */
export const SECTOR_01: SectorDefinition = {
  id: "sector-01",
  title: "Primer nivel",
  floor: 0,
  radius: 4,
  entry: { q: 0, r: 0 },
  door: { q: 1, r: 0 },
  shop: { q: 2, r: 0 },
  walls: [
    {q:-2,r:0}, {q:-2,r:1}, {q:-1,r:2}, {q:0,r:-3},
    {q:1,r:-2}, {q:2,r:-2}, {q:3,r:1},
  ],
};
