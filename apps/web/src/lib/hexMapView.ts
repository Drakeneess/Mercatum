import type { HexCoordinate, HexTile } from "@mercatum/shared";

const HEX_SIZE = 33;

export function hexCenter(position: HexCoordinate): { x: number; y: number } {
  return {
    x: HEX_SIZE * Math.sqrt(3) * (position.q + position.r / 2),
    y: HEX_SIZE * 1.5 * position.r,
  };
}

export function hexPoints(position: HexCoordinate): string {
  const center = hexCenter(position);
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 180) * (60 * index - 30);
    return `${(center.x + (HEX_SIZE - 1) * Math.cos(angle)).toFixed(2)},${(
      center.y + (HEX_SIZE - 1) * Math.sin(angle)
    ).toFixed(2)}`;
  }).join(" ");
}

export function getTileName(kind: HexTile["kind"]): string {
  switch (kind) {
    case "entry": return "Punto de entrada";
    case "shop": return "Puesto comercial";
    case "wall": return "Obstáculo físico";
    case "door": return "Puerta de mantenimiento";
    default: return "Pasillo";
  }
}

/** Exact shared edge of two pointy-top axial hexes. */
export function hexEdge(a:HexCoordinate,b:HexCoordinate){
  const p=hexCenter(a),q=hexCenter(b);
  const dx=q.x-p.x,dy=q.y-p.y,len=Math.hypot(dx,dy);
  const x=(p.x+q.x)/2,y=(p.y+q.y)/2;
  const nx=-dy/len*HEX_SIZE/2,ny=dx/len*HEX_SIZE/2;
  return {x1:x-nx,y1:y-ny,x2:x+nx,y2:y+ny};
}
