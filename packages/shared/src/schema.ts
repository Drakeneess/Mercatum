import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * This is the publicly synchronized data. Hidden entities must NOT be added here
 * without per-client StateView filtering, or their positions would leak.
 */
export const MercatumPlayer = schema({
  name: t.string().default("Explorador"),
  q: t.int16().default(0),
  r: t.int16().default(0),
  inside: t.boolean().default(true),
  health: t.int16().default(100),
  wounds: t.int16().default(0),
  strength: t.int16().default(2),
  dexterity: t.int16().default(2),
  endurance: t.int16().default(2),
  perception: t.int16().default(2),
  intellect: t.int16().default(2),
  social: t.int16().default(2),
  composure: t.int16().default(2),
}, "MercatumPlayer");
export type MercatumPlayer = SchemaType<typeof MercatumPlayer>;

export const MercatumState = schema({
  players: t.map(MercatumPlayer),
  mercatumTime: t.string().default("--:--"),
  doorOpen: t.boolean().default(false),
}, "MercatumState");
export type MercatumState = SchemaType<typeof MercatumState>;
