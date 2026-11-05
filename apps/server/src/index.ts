import "dotenv/config";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import {
  ENTRY,
  hexKey,
  isNeighbor,
  makeDemoMap,
  type HexCoordinate,
  type PlayerSnapshot,
  type ServerMessage,
} from "@mercatum/shared";
import { WebSocket, WebSocketServer } from "ws";

const PORT = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const MAX_PLAYERS = 20;
const MIN_MOVE_INTERVAL_MS = 250;
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000,http://127.0.0.1:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

const map = makeDemoMap();
const walkableTiles = new Set(
  map.filter((tile) => tile.kind !== "wall").map(hexKey),
);

interface Session {
  player: PlayerSnapshot;
  lastMoveAt: number;
}

const sessions = new Map<WebSocket, Session>();

/** Mercatum uses UTC-6 year-round, independent of daylight-saving rules. */
function mercatumTime(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Etc/GMT+6",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function broadcast(message: ServerMessage, except?: WebSocket): void {
  for (const socket of sessions.keys()) {
    if (socket !== except) send(socket, message);
  }
}

function rejectMove(socket: WebSocket, reason: string): void {
  send(socket, { type: "move_rejected", reason });
}

function isCoordinate(value: unknown): value is HexCoordinate {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { q?: unknown; r?: unknown };
  return Number.isSafeInteger(candidate.q) && Number.isSafeInteger(candidate.r);
}

function processMovement(socket: WebSocket, raw: string): void {
  const session = sessions.get(socket);
  if (!session) return;

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    rejectMove(socket, "Mensaje JSON inválido.");
    return;
  }

  if (typeof payload !== "object" || payload === null || !("type" in payload) || payload.type !== "move" || !("to" in payload)) {
    rejectMove(socket, "Acción no admitida.");
    return;
  }

  if (!isCoordinate(payload.to)) {
    rejectMove(socket, "Coordenadas inválidas.");
    return;
  }

  const destination = payload.to;
  if (!isNeighbor(session.player.position, destination)) {
    rejectMove(socket, "Solo puedes desplazarte a un hexágono vecino.");
    return;
  }
  if (!walkableTiles.has(hexKey(destination))) {
    rejectMove(socket, "Esta casilla está bloqueada.");
    return;
  }

  const now = Date.now();
  if (now - session.lastMoveAt < MIN_MOVE_INTERVAL_MS) {
    rejectMove(socket, "Movimiento demasiado rápido.");
    return;
  }

  session.lastMoveAt = now;
  session.player = { ...session.player, position: destination };
  broadcast({ type: "player_moved", playerId: session.player.id, to: destination });
}

const httpServer = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ status: "ok", connectedPlayers: sessions.size }));
    return;
  }
  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not found");
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });

httpServer.on("upgrade", (request, socket, head) => {
  const origin = request.headers.origin;
  if (request.url !== "/ws" || !origin || !allowedOrigins.has(origin)) {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (connection) => {
    wss.emit("connection", connection, request);
  });
});

wss.on("connection", (socket) => {
  if (sessions.size >= MAX_PLAYERS) {
    socket.close(1013, "Aforo completo");
    return;
  }

  const id = randomUUID();
  const player: PlayerSnapshot = {
    id,
    name: `Explorador-${id.slice(0, 4).toUpperCase()}`,
    position: { ...ENTRY },
  };
  sessions.set(socket, { player, lastMoveAt: 0 });

  send(socket, {
    type: "welcome",
    playerId: id,
    players: [...sessions.values()].map((session) => session.player),
    map,
    mercatumTime: mercatumTime(),
  });
  broadcast({ type: "player_joined", player }, socket);

  socket.on("message", (data, isBinary) => {
    if (isBinary) {
      rejectMove(socket, "Solo se admiten mensajes de texto JSON.");
      return;
    }
    processMovement(socket, data.toString());
  });

  socket.on("close", () => {
    if (!sessions.delete(socket)) return;
    broadcast({ type: "player_left", playerId: id });
  });
});

const clockTimer = setInterval(() => {
  broadcast({ type: "clock", mercatumTime: mercatumTime() });
}, 30_000);
clockTimer.unref();

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`[Mercatum] HTTP: http://localhost:${PORT}/health`);
  console.log(`[Mercatum] WebSocket: ws://localhost:${PORT}/ws`);
});
