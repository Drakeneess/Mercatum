import { createHash, randomBytes, randomUUID } from "node:crypto";
import { ServerError } from "colyseus";
import {
  parseCharacterStats, type CharacterStats, type ExpeditionPhase, type HexCoordinate,
} from "@mercatum/shared";
import { pool, transaction } from "./db.js";
import { ENTRY_GRACE_MS } from "../domain/creatureLogic.js";
import type { Admission, CharacterRecord } from "./models.js";

type CharacterRow = {
  id: string;
  display_name: string;
  stats: CharacterStats;
  q: number;
  r: number;
  phase: ExpeditionPhase;
  next_move_at: string;
  health: number;
  wounds: number;
};

function fromRow(row: CharacterRow): CharacterRecord {
  const stats = parseCharacterStats(row.stats);
  if (!stats) throw new Error("Personaje corrupto: atributos inválidos.");
  return {
    id: row.id, displayName: row.display_name, stats,
    q: row.q, r: row.r, phase: row.phase,
    nextMoveAt: Number(row.next_move_at),
    health: row.health, wounds: row.wounds,
  };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function createCharacter(
  client: import("pg").PoolClient,
  accountId: string,
  stats: CharacterStats,
  predecessorId?: string,
): Promise<CharacterRecord> {
  const id = randomUUID();
  const displayName = `Explorador-${id.slice(0, 4).toUpperCase()}`;
  const rows = await client.query<CharacterRow>(`
    INSERT INTO characters(id, account_id, display_name, stats, q, r, phase, next_move_at, protected_until)
    VALUES ($1, $2, $3, $4, 0, 0, 'inside', 0, $5)
    RETURNING *
  `, [id, accountId, displayName, JSON.stringify(stats), Date.now()+ENTRY_GRACE_MS]);
  if (predecessorId) {
    // The exterior deposit belongs to the account, not the dead explorer's
    // body. Only objects already extracted are inherited.
    const transferred = await client.query(`
      UPDATE market_objects SET owner_character_id=$2
      WHERE owner_character_id=$1 AND state='stash'
    `, [predecessorId, id]);
    await client.query(`
      INSERT INTO event_log(kind,character_id,payload)
      VALUES ('inherit_stash',$1,$2)
    `, [id, JSON.stringify({from: predecessorId, count: transferred.rowCount})]);
  }
  await client.query(
    "INSERT INTO event_log(kind,character_id) VALUES('character_created',$1)", [id],
  );
  return fromRow(rows.rows[0]);
}

/** Closed-prototype bearer credential, hashed in DB. Never treat client stats as authority. */
export async function admit(options: unknown): Promise<Admission> {
  const props = options && typeof options === "object"
    ? options as Record<string, unknown> : {};
  const suppliedToken = props.token;
  if (suppliedToken !== undefined) {
    if (typeof suppliedToken !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(suppliedToken)) {
      throw new ServerError(401, "Credencial de registro inválida.");
    }
    return transaction(async (client) => {
      // Serializes simultaneous attempts to reuse a token or create successors.
      const account = await client.query<{id: string}>(`
        SELECT id FROM accounts WHERE token_hash=$1 FOR UPDATE
      `, [hashToken(suppliedToken)]);
      const accountId = account.rows[0]?.id;
      if (!accountId) throw new ServerError(401, "Credencial desconocida; no se creó otro personaje.");

      const living = await client.query<CharacterRow>(`
        SELECT * FROM characters WHERE account_id=$1 AND phase <> 'dead'
        LIMIT 1 FOR UPDATE
      `, [accountId]);
      if (living.rows[0]) return {token: suppliedToken, character: fromRow(living.rows[0])};

      const previous = await client.query<CharacterRow>(`
        SELECT * FROM characters WHERE account_id=$1
        ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE
      `, [accountId]);
      const stats = parseCharacterStats(props.stats);
      if (stats) {
        const next = await createCharacter(client, accountId, stats, previous.rows[0]?.id);
        return {token: suppliedToken, character: next};
      }
      if (previous.rows[0]) {
        // Rejoin as a dead character to view the death record. Never respawn
        // automatically when reconnecting with only the saved credential.
        return {token: suppliedToken, character: fromRow(previous.rows[0])};
      }
      throw new ServerError(400, "No existe un personaje ni una nueva ficha válida.");
    });
  }

  const stats = parseCharacterStats(props.stats);
  if (!stats) throw new ServerError(400, "Distribución de atributos inválida.");
  const token = randomBytes(32).toString("base64url");
  const accountId = randomUUID();
  const character = await transaction(async (client) => {
    await client.query("INSERT INTO accounts(id,token_hash) VALUES($1,$2)", [accountId, hashToken(token)]);
    await client.query(`
      INSERT INTO wallet_ledger(account_id,delta,balance_after,reason)
      VALUES($1,100,100,'new_account_credit')
    `,[accountId]);
    return createCharacter(client, accountId, stats);
  });
  return {token, character};
}

/** Conditional update protects against duplicate/reordered movement requests. */
export async function saveStep(
  characterId: string, from: HexCoordinate, to: HexCoordinate, now: number, nextMoveAt: number,
): Promise<boolean> {
  const r = await pool.query(`
    UPDATE characters SET q=$2,r=$3,next_move_at=$4
    WHERE id=$1 AND phase='inside' AND health>0
      AND q=$5 AND r=$6 AND next_move_at<=$7
  `, [characterId,to.q,to.r,nextMoveAt,from.q,from.r,now]);
  return r.rowCount === 1;
}

export async function reenter(characterId: string): Promise<boolean> {
  return transaction(async client => {
    const r = await client.query(`
      UPDATE characters SET phase='inside', q=0, r=0, health=100, wounds=0,
        protected_until=$2, next_harm_at=0
      WHERE id=$1 AND phase='outside'
    `, [characterId,Date.now()+ENTRY_GRACE_MS]);
    if (r.rowCount !== 1) return false;
    await client.query("INSERT INTO event_log(kind,character_id) VALUES('entered',$1)", [characterId]);
    return true;
  });
}

/** Extraction commits the entire carried inventory as a single operation. */
export async function extract(characterId: string): Promise<boolean> {
  return transaction(async client => {
    const found = await client.query(`
      SELECT id FROM characters
      WHERE id=$1 AND phase='inside' AND health>0 AND q=0 AND r=0 FOR UPDATE
    `, [characterId]);
    if (!found.rows[0]) return false;
    await client.query(`
      UPDATE market_objects SET state='stash'
      WHERE owner_character_id=$1 AND state='carried'
    `, [characterId]);
    await client.query("UPDATE characters SET phase='outside' WHERE id=$1", [characterId]);
    await client.query("INSERT INTO event_log(kind,character_id) VALUES('extracted',$1)", [characterId]);
    return true;
  });
}
