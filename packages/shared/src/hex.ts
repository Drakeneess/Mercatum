/** Coordinates use the axial q,r convention (pointy-top hexes). */
export interface HexCoordinate {
  readonly q: number;
  readonly r: number;
}

export const HEX_DIRECTIONS: readonly HexCoordinate[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function hexKey({ q, r }: HexCoordinate): string {
  return `${q},${r}`;
}

export function hexDistance(a: HexCoordinate, b: HexCoordinate): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function isNeighbor(a: HexCoordinate, b: HexCoordinate): boolean {
  return hexDistance(a, b) === 1;
}

export function hexNeighbors({ q, r }: HexCoordinate): HexCoordinate[] {
  return HEX_DIRECTIONS.map((direction) => ({
    q: q + direction.q,
    r: r + direction.r,
  }));
}
