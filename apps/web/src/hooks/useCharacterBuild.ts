"use client";

import { useState } from "react";
import { ATTRIBUTE_POINTS, BALANCED_STATS, CREATION_MAX_STAT, parseCharacterStats, spentAttributePoints, STARTING_STAT, type CharacterStats, type StatKey } from "@mercatum/shared";

/** An unsigned build is local. The server validates every submitted value. */
export function useCharacterBuild() {
  const [draftStats, setDraftStats] = useState<CharacterStats>({ ...BALANCED_STATS });
  const [committedBuild, setCommittedBuild] = useState<CharacterStats | null>(null);
  const pointsLeft = ATTRIBUTE_POINTS - spentAttributePoints(draftStats);

  function adjustStat(stat: StatKey, change: -1 | 1) {
    if (committedBuild) return;
    setDraftStats((current) => {
      const next = current[stat] + change;
      const available = ATTRIBUTE_POINTS - spentAttributePoints(current);
      if (next < STARTING_STAT || next > CREATION_MAX_STAT || (change > 0 && available <= 0)) {
        return current;
      }
      return { ...current, [stat]: next };
    });
  }

  function enterMarket() {
    const validated = parseCharacterStats(draftStats);
    if (validated && !committedBuild) setCommittedBuild(validated);
  }

  return { draftStats, committedBuild, pointsLeft, adjustStat, enterMarket, setDraftStats };
}
