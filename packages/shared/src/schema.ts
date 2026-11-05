import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * This is the publicly synchronized data. Hidden entities must NOT be added here
 * without per-client StateView filtering, or their positions would leak.
 */
export const MercatumPlayer = schema({
  name: t.string().default("Explorador"),
  q: t.int16().default(0),
  r: t.int16().default(0),
}, "MercatumPlayer");
export type MercatumPlayer = SchemaType<typeof MercatumPlayer>;

export const MercatumState = schema({
  players: t.map(MercatumPlayer),
  mercatumTime: t.string().default("--:--"),
}, "MercatumState");
export type MercatumState = SchemaType<typeof MercatumState>;
