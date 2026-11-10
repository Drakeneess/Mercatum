"use client";

import { useState } from "react";
import { ATTRIBUTE_POINTS, BALANCED_STATS, CREATION_MAX_STAT, parseCharacterStats, spentAttributePoints, STARTING_STAT, type CharacterStats, type StatKey } from "@mercatum/shared";

/** Keep an unsigned character sheet local; never trust it as server authority. */
export function useCharacterBuild() {
  const [draftStats, setDraftStats] = useState<CharacterStats>({ ...BALANCED_STATS });
  const [committedBuild, setCommittedBuild] = useState<CharacterStats | null>(null);
  return { draftStats, committedBuild, pointsLeft, adjustStat, enterMarket, setDraftStats };
}
