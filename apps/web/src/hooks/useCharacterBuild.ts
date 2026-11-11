"use client";

import { useEffect, useState } from "react";
import { ATTRIBUTE_POINTS, BALANCED_STATS, CREATION_MAX_STAT, parseCharacterStats, spentAttributePoints, STARTING_STAT, type CharacterStats, type StatKey } from "@mercatum/shared";

/** An unsigned build is local. The server validates every submitted value. */
export function useCharacterBuild() {
  const [draftStats, setDraftStats] = useState<CharacterStats>({ ...BALANCED_STATS });
  const [committedBuild, setCommittedBuild] = useState<CharacterStats | null>(null);
  const pointsLeft = ATTRIBUTE_POINTS - spentAttributePoints(draftStats);
  // A resumed registration must not automatically resurrect a deceased explorer.
  const [createSuccessor, setCreateSuccessor] = useState(false);

  // A returning browser keeps the same account/character. The server restores
  // the original stats; this placeholder never overrides a saved character.
  useEffect(() => {
    try {
      if (window.localStorage.getItem("mercatum.session.token")) {
        setCommittedBuild({ ...BALANCED_STATS });
      }
    } catch {
      // Storage disabled: user must begin a fresh temporary registration.
    }
  }, []);

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
    if (validated && !committedBuild) {
      setCreateSuccessor(true);
      setCommittedBuild(validated);
    }
  }

  function prepareSuccessor() {
    setDraftStats({ ...BALANCED_STATS });
    setCommittedBuild(null);
    setCreateSuccessor(false);
  }
  return {
    draftStats, committedBuild, pointsLeft, adjustStat, enterMarket,
    setDraftStats, createSuccessor, prepareSuccessor,
  };
}
