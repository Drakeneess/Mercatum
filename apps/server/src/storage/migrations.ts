import type { PoolClient } from "pg";

/** Migrations run under an advisory transaction lock across processes. */
const migrations: ReadonlyArray<string> = [
  `
  CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS characters (
    id UUID PRIMARY KEY,
    account_id UUID NOT NULL UNIQUE REFERENCES accounts(id),
    display_name TEXT NOT NULL,
    stats JSONB NOT NULL,
    q INTEGER NOT NULL DEFAULT 0,
    r INTEGER NOT NULL DEFAULT 0,
    phase TEXT NOT NULL DEFAULT 'inside' CHECK (phase IN ('inside','outside')),
    next_move_at BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS world_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    door_open BOOLEAN NOT NULL DEFAULT FALSE
  );
  INSERT INTO world_state(id, door_open) VALUES (1, false) ON CONFLICT DO NOTHING;
  CREATE TABLE IF NOT EXISTS market_objects (
    id UUID PRIMARY KEY,
    label TEXT NOT NULL,
    weight INTEGER NOT NULL CHECK (weight > 0),
    condition INTEGER NOT NULL CHECK (condition BETWEEN 0 AND 100),
    state TEXT NOT NULL CHECK (state IN ('ground','carried','stash')),
    owner_character_id UUID REFERENCES characters(id),
    q INTEGER,
    r INTEGER,
    CONSTRAINT object_location CHECK (
      (state = 'ground' AND owner_character_id IS NULL AND q IS NOT NULL AND r IS NOT NULL)
      OR
      (state IN ('carried','stash') AND owner_character_id IS NOT NULL AND q IS NULL AND r IS NULL)
    )
  );
  CREATE INDEX IF NOT EXISTS idx_market_object_owner ON market_objects(owner_character_id,state);
  CREATE TABLE IF NOT EXISTS event_log (
    id BIGSERIAL PRIMARY KEY,
    kind TEXT NOT NULL,
    character_id UUID REFERENCES characters(id),
    object_id UUID REFERENCES market_objects(id),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  INSERT INTO market_objects(id,label,weight,condition,state,q,r)
    VALUES ('00000000-0000-4000-8000-000000000001',
      'Navaja oxidada',2,34,'ground',2,0)
    ON CONFLICT DO NOTHING;
  `,
  `
  -- Multiple dead characters may belong to one account; only one living character.
  ALTER TABLE characters DROP CONSTRAINT IF EXISTS characters_account_id_key;
  CREATE UNIQUE INDEX IF NOT EXISTS active_character_per_account
    ON characters(account_id) WHERE phase <> 'dead';
  ALTER TABLE characters DROP CONSTRAINT IF EXISTS characters_phase_check;
  ALTER TABLE characters ADD CONSTRAINT characters_phase_check
    CHECK (phase IN ('inside','outside','dead'));
  ALTER TABLE characters ADD COLUMN IF NOT EXISTS health INTEGER NOT NULL DEFAULT 100
    CHECK (health BETWEEN 0 AND 100);
  ALTER TABLE characters ADD COLUMN IF NOT EXISTS wounds INTEGER NOT NULL DEFAULT 0
    CHECK (wounds BETWEEN 0 AND 5);
  CREATE TABLE IF NOT EXISTS creatures (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('stalker','scavenger')),
    name TEXT NOT NULL,
    q INTEGER NOT NULL,
    r INTEGER NOT NULL,
    next_action_at BIGINT NOT NULL DEFAULT 0,
    steps INTEGER NOT NULL DEFAULT 0,
    last_known_q INTEGER,
    last_known_r INTEGER,
    search_left INTEGER NOT NULL DEFAULT 0
  );
  INSERT INTO creatures(id,kind,name,q,r,next_action_at,steps)
    VALUES ('stalker-01','stalker','El Rastrero',4,-3,0,0),
           ('scavenger-01','scavenger','El Rebuscador',-4,1,0,0)
  ON CONFLICT DO NOTHING;
  `,
];

/** Run once per process startup. A failed migration rolls back completely. */
export async function migrate(client: PoolClient): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(7072026)");
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations(
    version INTEGER PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const { rows } = await client.query<{version:number}>("SELECT version FROM schema_migrations");
  const done = new Set(rows.map(x => x.version));
  for(let i=0;i<migrations.length;i++){
    if(done.has(i+1)) continue;
    await client.query(migrations[i]);
    await client.query("INSERT INTO schema_migrations(version) VALUES($1)",[i+1]);
  }
}
