import { type CharacterStats, type MercatumState, type PlayerSnapshot } from "@mercatum/shared";

/** Keep Schema-to-UI projection independent of networking and rendering. */
export function snapshotPlayers(state: MercatumState): PlayerSnapshot[] {
  const snapshot: PlayerSnapshot[] = [];
  state.players.forEach((player, id) => {
    const stats: CharacterStats = {
      strength: player.strength,
      dexterity: player.dexterity,
      endurance: player.endurance,
      perception: player.perception,
      intellect: player.intellect,
      social: player.social,
      composure: player.composure,
    };
    snapshot.push({ id, name: player.name, position: { q: player.q, r: player.r }, inside: player.inside, health: player.health, wounds: player.wounds, stats });
  });
  return snapshot;
}

export function connectionErrorMessage(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error
    ? Number(error.code) : null;
  const detail = error instanceof Error ? error.message : String(error);
  const codeLabel = Number.isFinite(code) ? ` (código ${code})` : "";
  return code === 521 || code === 522
    ? `Matchmaking rechazado${codeLabel}: ${detail}. Revisa el campo worldJoinable de http://localhost:3001/health.`
    : `Error de conexión${codeLabel}: ${detail}`;
}
