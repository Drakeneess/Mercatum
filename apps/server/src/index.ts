import "dotenv/config";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { createEndpoint, createRouter, defineRoom, defineServer, matchMaker } from "colyseus";
import { MERCATUM_ROOM_NAME } from "@mercatum/shared";
import { MercatumRoom } from "./MercatumRoom.js";
import { initializeDatabase } from "./storage/db.js";

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
      const world = rooms[0];
      const joinable = Boolean(world && !world.locked && !world.private);
      return {
        status: !world ? "world-not-ready" : joinable ? "ok" : "world-unavailable",
        worldReady: Boolean(world),
        worldJoinable: joinable,
        roomName: MERCATUM_ROOM_NAME,
        roomId: world?.roomId ?? null,
        roomLocked: world?.locked ?? null,
        roomPrivate: world?.private ?? null,
        roomClients: world?.clients ?? 0,
        roomMaxClients: world?.maxClients ?? null,
        activeRoomIds: rooms.map((room) => room.roomId),
        connectedPlayers: matchMaker.stats.local.ccu,
      };
    }),
  }),
});

await initializeDatabase();
await server.listen(port);
const world = await matchMaker.createRoom(MERCATUM_ROOM_NAME, {});
if (!world.roomId) {
  throw new Error("World initialization failed: missing Colyseus room ID.");
}

console.log(`[Mercatum] Colyseus listening on http://localhost:${port}`);
console.log(`[Mercatum] Canonical room: ${world.roomId}`);

/**
 * Opt-in diagnostics for local load testing ONLY. They are written to stdout,
 * never served by a public health endpoint, and disabled in production.
 * CPU percentage is per process (100% = one CPU core fully occupied).
 */
if(process.env.MERCATUM_LOAD_METRICS==="1" && process.env.NODE_ENV!=="production"){
  const lag=monitorEventLoopDelay({resolution:20});
  lag.enable();
  let previousCpu=process.cpuUsage();
  let previousNs=process.hrtime.bigint();
  const sampler=setInterval(()=>{
    const now=process.hrtime.bigint();
    const elapsedMs=Number(now-previousNs)/1e6;
    const cpu=process.cpuUsage(previousCpu);
    const memory=process.memoryUsage();
    const cpuPercent=elapsedMs>0
      ? ((cpu.user+cpu.system)/1000/elapsedMs)*100 : 0;
    console.log("[MercatumLoad] "+JSON.stringify({
      at:Date.now(),
      rssMB:Math.round(memory.rss/1048576*100)/100,
      heapMB:Math.round(memory.heapUsed/1048576*100)/100,
      cpuPercent:Math.round(cpuPercent*100)/100,
      eventLoopP95Ms:Math.round(lag.percentile(95)/1e6*100)/100,
      eventLoopMaxMs:Math.round(lag.max/1e6*100)/100,
    }));
    previousCpu=process.cpuUsage();
    previousNs=now;
    lag.reset();
  },1000);
  sampler.unref();
}
