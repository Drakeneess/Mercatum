import assert from "node:assert/strict";
import test from "node:test";
import { MercatumPlayer, hexNeighbors, makeDemoMap } from "@mercatum/shared";
import { resolveMovement } from "./movement.js";
import { mercatumClock } from "./clock.js";

const explorer = () => new MercatumPlayer({ name: "Test", q: 0, r: 0, dexterity: 3 });

test("accepts one adjacent step and applies server Destreza", () => {
  const decision = resolveMovement(explorer(), { to: { q: 1, r: 0 } }, 1000, 0);
  assert.equal(decision.ok, true);
  if (decision.ok) {
    assert.equal(decision.response.cooldownMs, 900);
    assert.equal(decision.nextMoveAt, 1900);
  }
});

test("rejects invalid coordinates, non-adjacent moves, and premature steps", () => {
  const player = explorer();
  const invalid = resolveMovement(player, { to: { q: 1.3, r: 0 } }, 1000, 0);
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.match(invalid.response.reason, /inválidas/);

  const teleport = resolveMovement(player, { to: { q: 8, r: 7 } }, 1000, 0);
  assert.equal(teleport.ok, false);
  if (!teleport.ok) assert.match(teleport.response.reason, /vecino/);

  const cooldown = resolveMovement(player, { to: { q: 1, r: 0 } }, 1100, 1900);
  assert.equal(cooldown.ok, false);
  if (!cooldown.ok) assert.equal(cooldown.response.retryAfterMs, 800);
});

test("cannot enter a blocked hex even with enough time", () => {
  const wall = makeDemoMap().find(tile => tile.kind === "wall");
  assert.ok(wall);
  const near = hexNeighbors(wall)[0];
  const player = new MercatumPlayer({ name: "Test", q: near.q, r: near.r });
  const decision = resolveMovement(player, { to: { q: wall.q, r: wall.r } }, 1000, 0);
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.match(decision.response.reason, /bloqueada/);
});

test("Mercatum's clock uses fixed UTC−06:00", () => {
  assert.equal(mercatumClock(new Date("2026-01-01T12:00:00Z")), "06:00");
});
