import { ServerError } from "colyseus";
import {
  BALANCED_STATS, ENTRY, MercatumPlayer, parseCharacterStats,
  type CharacterStats,
} from "@mercatum/shared";

/** Old clients without a sheet are assigned a balanced temporary build.
 * Explicit client builds are always validated and never trusted. */
export function createExplorer(sessionId: string, options: unknown): MercatumPlayer {
  const supplied = options && typeof options === "object" && "stats" in options
    ? (options as { stats: unknown }).stats
    : undefined;

  const stats: CharacterStats | null = supplied === undefined
    ? { ...BALANCED_STATS }
    : parseCharacterStats(supplied);
  if (!stats) throw new ServerError(400, "Distribución de atributos inválida.");

  return new MercatumPlayer({
    name: `Explorador-${sessionId.slice(0, 4).toUpperCase()}`,
    q: ENTRY.q,
    r: ENTRY.r,
    ...stats,
  });
}
