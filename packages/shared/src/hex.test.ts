import assert from "node:assert/strict";
import test from "node:test";
import { hexDistance, hexKey, hexNeighbors, isNeighbor } from "./hex.js";
import { ENTRY, makeDemoMap, SHOP } from "./world.js";

test("hex coordinates have six unique neighbors", () => {
  const neighbors = hexNeighbors(ENTRY);
  assert.equal(neighbors.length, 6);
  assert.equal(new Set(neighbors.map(hexKey)).size, 6);
  assert.ok(neighbors.every((neighbor) => isNeighbor(ENTRY, neighbor)));
});

test("movement is restricted to an adjacent tile", () => {
  assert.equal(hexDistance(ENTRY, { q: 1, r: 0 }), 1);
  assert.ok(!isNeighbor(ENTRY, { q: 2, r: 0 }));
  assert.ok(!isNeighbor(ENTRY, ENTRY));
});

test("radius four demo map has 61 tiles and unique coordinates", () => {
  const tiles = makeDemoMap();
  assert.equal(tiles.length, 61);
  assert.equal(new Set(tiles.map(hexKey)).size, tiles.length);
  assert.equal(tiles.find((tile) => hexKey(tile) === hexKey(ENTRY))?.kind, "entry");
  assert.equal(tiles.find((tile) => hexKey(tile) === hexKey(SHOP))?.kind, "shop");
  assert.equal(tiles.find((tile) => hexKey(tile) === "-2,0")?.kind, "wall");
});
