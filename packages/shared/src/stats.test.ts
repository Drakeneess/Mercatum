import assert from "node:assert/strict";
import test from "node:test";
import {
  ATTRIBUTE_POINTS, BALANCED_STATS, getMovementDelayMs, parseCharacterStats,
  spentAttributePoints, STAT_KEYS,
} from "./stats.js";

test("seven independent aptitudes total seven spendable points", () => {
  assert.equal(STAT_KEYS.length, 7);
  assert.equal(spentAttributePoints({ ...BALANCED_STATS }), ATTRIBUTE_POINTS);
  assert.deepEqual(parseCharacterStats(BALANCED_STATS), BALANCED_STATS);
});

test("server rejects tampered, partial and over-budget builds", () => {
  const good = { ...BALANCED_STATS, strength: 3, social: 1 };
  assert.deepEqual(parseCharacterStats(good), good);
  assert.equal(parseCharacterStats({ ...BALANCED_STATS, dexterity: 5, strength: 1, social: 1, composure: 1 }), null);
  assert.equal(parseCharacterStats({ ...BALANCED_STATS, strength: 3 }), null);
  assert.equal(parseCharacterStats({ ...BALANCED_STATS, strength: 1.5, intellect: 2.5 }), null);
  assert.equal(parseCharacterStats({ ...BALANCED_STATS, unknown: 2 }), null);
  assert.equal(parseCharacterStats({ strength: 2 }), null);
  assert.equal(parseCharacterStats(null), null);
});

test("higher dexterity always reduces the server-authoritative move delay", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(getMovementDelayMs), [1400, 1200, 1050, 900, 800, 700]);
  assert.equal(getMovementDelayMs(-5), 1400);
  assert.equal(getMovementDelayMs(99), 700);
  assert.equal(getMovementDelayMs(Number.NaN), 1200);
});
