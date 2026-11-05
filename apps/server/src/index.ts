import "dotenv/config";
import { createEndpoint, createRouter, defineRoom, defineServer, matchMaker } from "colyseus";
import { MERCATUM_ROOM_ID, MERCATUM_ROOM_NAME } from "@mercatum/shared";
import { MercatumRoom } from "./MercatumRoom.js";

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

// Clients must NOT be able to create more worlds via create/joinOrCreate.
matchMaker.controller.exposedMethods = ["join", "reconnect"];

const server = defineServer({
  rooms: {
    [MERCATUM_ROOM_NAME]: defineRoom(MercatumRoom),
  },
  routes: createRouter({
    health: createEndpoint("/health", { method: "GET" }, async () => {
      const rooms = await matchMaker.query({ name: MERCATUM_ROOM_NAME });
      const ready = rooms.some((room) => room.roomId === MERCATUM_ROOM_ID);
      return {
        status: ready ? "ok" : "world-not-ready",
        worldReady: ready,
        roomName: MERCATUM_ROOM_NAME,
        roomId: MERCATUM_ROOM_ID,
        activeRoomIds: rooms.map((room) => room.roomId),
        connectedPlayers: matchMaker.stats.local.ccu,
      };
    }),
  }),
});

await server.listen(port);
const world = await matchMaker.createRoom(MERCATUM_ROOM_NAME, {});
if (world.roomId !== MERCATUM_ROOM_ID) {
  throw new Error(`Unexpected world ID: ${world.roomId}; expected ${MERCATUM_ROOM_ID}`);
}

console.log(`[Mercatum] Colyseus listening on http://localhost:${port}`);
console.log(`[Mercatum] Canonical room: ${MERCATUM_ROOM_ID}`);
