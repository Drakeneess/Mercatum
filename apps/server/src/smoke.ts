/** End-to-end Colyseus smoke test: one canonical room and authoritative movement. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { Client } from "@colyseus/sdk";
import {
  BALANCED_STATS, getMovementDelayMs, MERCATUM_ROOM_NAME,
} from "@mercatum/shared";

const PORT = 31237;
const url = `http://127.0.0.1:${PORT}`;
const server = spawn(process.execPath, ["dist/index.js"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(PORT) },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout?.on("data", (chunk: Buffer) => { serverLog += chunk.toString(); });
server.stderr?.on("data", (chunk: Buffer) => { serverLog += chunk.toString(); });

async function eventually(predicate: () => boolean | Promise<boolean>, description: string, timeout = 8_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${description}. Server log:\n${serverLog}`);
}

async function run() {
  await eventually(async () => {
    if (server.exitCode !== null) throw new Error(`Server exited: ${serverLog}`);
    try {
      const response = await fetch(`${url}/health`);
      if (!response.ok) return false;
      const health = await response.json() as { worldReady?: boolean; worldJoinable?: boolean; roomId?: string };
      return health.worldReady === true && health.worldJoinable === true && Boolean(health.roomId);
    } catch {
      return false;
    }
  }, "Colyseus server health");

  const health = await (await fetch(`${url}/health`)).json() as {
    roomId: string; worldJoinable: boolean; roomLocked: boolean; activeRoomIds: string[];
  };
  assert.equal(health.worldJoinable, true);
  assert.equal(health.roomLocked, false);
  assert.deepEqual(health.activeRoomIds, [health.roomId]);

  const client = new Client(url);
  const agileBuild = { ...BALANCED_STATS, dexterity: 3, strength: 1 };
  const explorerA = await client.join(MERCATUM_ROOM_NAME, { stats: agileBuild });
  const explorerB = await client.join(MERCATUM_ROOM_NAME);

  try {
    assert.equal(explorerA.roomId, health.roomId);
    assert.equal(explorerA.roomId, explorerB.roomId);
    await eventually(
      () => explorerA.state?.players?.size === 2 && explorerB.state?.players?.size === 2,
      "both players to be synchronized",
    );

    assert.equal(explorerA.state.players.get(explorerA.sessionId)?.dexterity, 3);
    assert.equal(explorerA.state.players.get(explorerA.sessionId)?.strength, 1);
    assert.equal(explorerB.state.players.get(explorerB.sessionId)?.dexterity, 2);
    await assert.rejects(
      client.join(MERCATUM_ROOM_NAME, { stats: { ...BALANCED_STATS, dexterity: 5 } }),
      /atributos|invalid|error|400/i,
    );

    // A malicious client must not be able to instantiate an alternate market.
    await assert.rejects(client.create(MERCATUM_ROOM_NAME));
    await assert.rejects(client.joinOrCreate(MERCATUM_ROOM_NAME));

    explorerA.send("move", { to: { q: 0, r: 1 } });
    await eventually(
      () => explorerB.state?.players?.get(explorerA.sessionId)?.r === 1,
      "movement to synchronize to explorer B",
    );

    const refusal = new Promise<string>((resolve) => {
      explorerA.onMessage("move_rejected", (payload: { reason: string }) => resolve(payload.reason));
    });
    explorerA.send("move", { to: { q: 99, r: 99 } });
    const reason = await Promise.race([
      refusal,
      sleep(3_000).then(() => { throw new Error("Missing rejection of invalid movement"); }),
    ]);
    assert.match(reason, /vecino/);

    // The server rejects a second adjacent move until Destreza cooldown ends.
    const tooSoon = new Promise<{ reason: string; retryAfterMs?: number }>((resolve) => {
      explorerA.onMessage("move_rejected", (payload: { reason: string; retryAfterMs?: number }) => {
        if (payload.retryAfterMs !== undefined) resolve(payload);
      });
    });
    explorerA.send("move", { to: { q: 0, r: 0 } });
    const cooldown = await Promise.race([
      tooSoon,
      sleep(2_000).then(() => { throw new Error("Missing movement cooldown rejection"); }),
    ]);
    assert.ok((cooldown.retryAfterMs ?? 0) > 0);
    assert.match(cooldown.reason, /paso/);

    await sleep(getMovementDelayMs(3) + 90);
    explorerA.send("move", { to: { q: 0, r: 0 } });
    await eventually(
      () => explorerB.state?.players?.get(explorerA.sessionId)?.r === 0,
      "agile player to move after its own cooldown",
    );
  } finally {
    await explorerA.leave();
    await explorerB.leave();
  }

  // autoDispose=false: the world remains available even with zero clients.
  const explorerC = await client.join(MERCATUM_ROOM_NAME);
  try {
    assert.equal(explorerC.roomId, health.roomId);
  } finally {
    await explorerC.leave();
  }

  console.log("Colyseus smoke test passed: canonical room, sync, validation, empty-room survival.");
}

try {
  await run();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  server.kill("SIGTERM");
}
