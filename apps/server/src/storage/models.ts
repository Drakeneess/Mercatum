import type { CharacterStats, ExpeditionPhase, MarketItem } from "@mercatum/shared";

export interface CharacterRecord {
  id: string;
  displayName: string;
  stats: CharacterStats;
  q: number;
  r: number;
  phase: ExpeditionPhase;
  nextMoveAt: number;
  health: number;
  wounds: number;
}
export interface Admission {
  token: string;
  character: CharacterRecord;
}

export interface StoredObject extends MarketItem {
  state: "ground" | "carried" | "stash";
  ownerCharacterId: string | null;
}
