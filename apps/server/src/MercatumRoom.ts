import { Room, type Client } from "colyseus";
import { MercatumState } from "@mercatum/shared";
import { createExplorer } from "./domain/character.js";
import { mercatumClock } from "./domain/clock.js";
import { resolveMovement } from "./domain/movement.js";

const MAX_PLAYERS = 20;

/**
 * A single authoritative world. Keep transport and lifecycle here;
 * game rules belong in domain modules, UI never directly mutates state.
 *
 * Hidden entities must not be synced without per-client visibility filtering.
 */
export class MercatumRoom extends Room<{ state: MercatumState }> {
  maxClients = MAX_PLAYERS;
  autoDispose = false;
  patchRate = 200;
  maxMessagesPerSecond = 30;
  state = new MercatumState();

  private readonly nextMoveAt = new Map<string, number>();

  onCreate(): void {
    this.state.mercatumTime = mercatumClock();
    // One slow clock check, no 60fps world loop.
    this.clock.setInterval(() => {
      const now = mercatumClock();
      if (this.state.mercatumTime !== now) this.state.mercatumTime = now;
    }, 10_000);
    this.onMessage("move", (client, payload: unknown) => this.move(client, payload));
  }

  onJoin(client: Client, options?: unknown): void {
    this.state.players.set(client.sessionId, createExplorer(client.sessionId, options));
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.nextMoveAt.delete(client.sessionId);
  }

  private move(client: Client, payload: unknown): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const decision = resolveMovement(
      player, payload, Date.now(), this.nextMoveAt.get(client.sessionId) ?? 0,
    );
    if (!decision.ok) {
      client.send("move_rejected", decision.response);
      return;
    }
    // Only the authoritative room commits a movement decision.
    this.nextMoveAt.set(client.sessionId, decision.nextMoveAt);
    player.q = decision.response.to.q;
    player.r = decision.response.to.r;
    client.send("move_accepted", decision.response);
    // Colyseus broadcasts the Schema patch; no manual broadcast necessary.
  }
}
