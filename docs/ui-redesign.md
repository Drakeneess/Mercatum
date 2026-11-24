# UI redesign — first integrated pass

All three supports remain: Oxide, Phosphor and Vigil. A compact HUD, full-height map on sufficiently tall desktop screens, bottom navigation, contextual action strip, separate backpack dialog and two-column NPC commerce preserve the existing connection and server contracts. Generic creature and item markers are intentional placeholders; personalized creature dossiers, icons and anatomy are deferred.

## Architecture
The prototype has five solid wall edges in the north of Sector 01 and four remaining full-cell obstacles (shelving/debris). The legacy tile kind `wall` now means a physical obstacle for compatibility. Wall edges are static shared data and block player movement, creature pathfinding, rival contact, acoustic sight and adjacent object/trade interaction. The maintenance door retains its persisted tile-gate semantics; no migration or reset is required. Existing objects, characters and creature positions are not moved. Three previously blocked tiles are now floor. Glass, grilles and individual edge doors are deferred.

## Verification
Run `pnpm build`, `pnpm typecheck`, `pnpm test`, existing smoke tests (especially V1, V2, V3, V4 and ecology), and load:20 with PostgreSQL active. Verify all three supports at 375, 768 and 1440px, keyboard navigation, theme persistence, movement through newly accessible cells, wall collisions from both sides, nearby chat, merchant proximity, item pickup, death and extraction. No new gameplay abilities or production auth are included.
