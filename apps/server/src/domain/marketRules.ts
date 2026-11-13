import { SHOP, hexDistance, type HexCoordinate } from "@mercatum/shared";

/** All prices are integral fictional credits. Condition directly affects appraisal.
 * Trade is deliberately free-price: players can overpay for a convincing story. */
export function purchasePrice(base: number, condition: number, trato = 2): number {
  if (!Number.isFinite(base) || !Number.isFinite(condition)) throw new Error("Precio inválido");
  const conditionFactor = Math.max(0, Math.min(100, condition))/100;
  return Math.max(1, Math.ceil(base * conditionFactor * (1.15 - .025 * trato)));
}
export function salePrice(base: number, condition: number, trato = 2): number {
  const factor = Math.max(0, Math.min(100, condition))/100;
  return Math.max(1, Math.floor(base * factor * (.48 + .025 * trato)));
}

export type TradeParticipant = {
  phase: "inside" | "outside" | "dead";
  health: number;
  q: number;
  r: number;
};
export function tradeAllowed(a: TradeParticipant, b: TradeParticipant): boolean {
  if (a.health<=0 || b.health<=0 || a.phase!==b.phase || a.phase==="dead") return false;
  if (a.phase==="outside") return true;
  return hexDistance({q:a.q,r:a.r} as HexCoordinate, {q:b.q,r:b.r})<=1;
}
/** A merchant can be visited from the exterior or by standing in front of a
 * mapped storefront. All buy/sell calls must recheck this on the server. */
export function canVisitMerchant(actor: TradeParticipant): boolean {
  return actor.health > 0 && (
    actor.phase === "outside" ||
    (actor.phase === "inside" && hexDistance(actor, SHOP) <= 1)
  );
}
export function safeAmount(input: unknown): number | null {
  return Number.isInteger(input) && typeof input==="number" && input>=0 && input<=100_000
    ? input : null;
}
export function isUuid(input: unknown): input is string {
  return typeof input==="string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input);
}
