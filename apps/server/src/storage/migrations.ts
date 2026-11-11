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
  `
  -- A scavenger may temporarily hold an item; it can drop the item later.
  ALTER TABLE market_objects ADD COLUMN IF NOT EXISTS creature_id TEXT
    REFERENCES creatures(id);
  ALTER TABLE market_objects DROP CONSTRAINT IF EXISTS market_objects_state_check;
  ALTER TABLE market_objects ADD CONSTRAINT market_objects_state_check
    CHECK (state IN ('ground','carried','stash','stolen'));
  ALTER TABLE market_objects DROP CONSTRAINT IF EXISTS object_location;
  ALTER TABLE market_objects ADD CONSTRAINT object_location CHECK (
    (state='ground' AND owner_character_id IS NULL AND creature_id IS NULL
      AND q IS NOT NULL AND r IS NOT NULL)
    OR
    (state IN ('carried','stash') AND owner_character_id IS NOT NULL
      AND creature_id IS NULL AND q IS NULL AND r IS NULL)
    OR
    (state='stolen' AND creature_id IS NOT NULL AND owner_character_id IS NULL
      AND q IS NULL AND r IS NULL)
  );
  CREATE INDEX IF NOT EXISTS idx_creature_held_objects ON market_objects(creature_id);
  `,
  `
  -- V3: an integer-only closed currency. Balances belong to accounts and
  -- survive permadeath; tradeable goods remain individually identifiable.
  ALTER TABLE accounts ADD COLUMN IF NOT EXISTS credits INTEGER NOT NULL DEFAULT 100
    CHECK(credits >= 0);
  ALTER TABLE market_objects ADD COLUMN IF NOT EXISTS base_price INTEGER NOT NULL DEFAULT 30
    CHECK(base_price > 0);
  ALTER TABLE market_objects ADD COLUMN IF NOT EXISTS listed BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE market_objects DROP CONSTRAINT object_location;
  ALTER TABLE market_objects DROP CONSTRAINT market_objects_state_check;
  ALTER TABLE market_objects ADD CONSTRAINT market_objects_state_check
    CHECK(state IN ('ground','carried','stash','stolen','merchant'));
  ALTER TABLE market_objects ADD CONSTRAINT object_location CHECK(
    (state='ground' AND owner_character_id IS NULL AND creature_id IS NULL AND q IS NOT NULL AND r IS NOT NULL)
    OR (state IN ('carried','stash') AND owner_character_id IS NOT NULL AND creature_id IS NULL AND q IS NULL AND r IS NULL)
    OR (state='stolen' AND creature_id IS NOT NULL AND owner_character_id IS NULL AND q IS NULL AND r IS NULL)
    OR (state='merchant' AND owner_character_id IS NULL AND creature_id IS NULL AND q IS NULL AND r IS NULL)
  );
  CREATE TABLE IF NOT EXISTS operation_receipts(
    account_id UUID NOT NULL REFERENCES accounts(id),
    request_id UUID NOT NULL,
    kind TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(account_id,request_id)
  );
  CREATE TABLE IF NOT EXISTS wallet_ledger(
    id BIGSERIAL PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES accounts(id),
    delta INTEGER NOT NULL,
    balance_after INTEGER NOT NULL CHECK(balance_after>=0),
    reason TEXT NOT NULL,
    operation_id UUID,
    item_id UUID REFERENCES market_objects(id),
    at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  INSERT INTO wallet_ledger(account_id,delta,balance_after,reason)
    SELECT id,100,100,'v3_initial_credit' FROM accounts;
  CREATE TABLE IF NOT EXISTS trade_offers(
    id UUID PRIMARY KEY,
    buyer_id UUID NOT NULL REFERENCES characters(id),
    seller_id UUID NOT NULL REFERENCES characters(id),
    item_id UUID NOT NULL REFERENCES market_objects(id),
    barter_item_id UUID REFERENCES market_objects(id),
    credits INTEGER NOT NULL CHECK(credits>=0 AND credits<=100000),
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK(status IN ('pending','accepted','cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    CHECK(buyer_id<>seller_id),
    CHECK(barter_item_id IS NULL OR barter_item_id <> item_id)
  );
  CREATE INDEX IF NOT EXISTS trade_offers_pending ON trade_offers(buyer_id,seller_id,status);
  CREATE TABLE IF NOT EXISTS object_events(
    id BIGSERIAL PRIMARY KEY,
    item_id UUID NOT NULL REFERENCES market_objects(id),
    kind TEXT NOT NULL CHECK(kind IN ('fact','claim')),
    event_type TEXT NOT NULL,
    author_account_id UUID REFERENCES accounts(id),
    statement TEXT,
    detail JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((kind='fact' AND statement IS NULL AND author_account_id IS NULL)
        OR (kind='claim' AND statement IS NOT NULL AND author_account_id IS NOT NULL))
  );
  CREATE INDEX IF NOT EXISTS object_events_item ON object_events(item_id,id);
  CREATE OR REPLACE FUNCTION forbid_object_event_change() RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
  BEGIN
    RAISE EXCEPTION 'The public provenance ledger is append-only';
  END $fn$;
  CREATE TRIGGER object_events_immutable BEFORE UPDATE OR DELETE ON object_events
    FOR EACH ROW EXECUTE FUNCTION forbid_object_event_change();
  CREATE OR REPLACE FUNCTION record_object_fact() RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
  BEGIN
    IF TG_OP='INSERT' THEN
      INSERT INTO object_events(item_id,kind,event_type,detail)
      VALUES(NEW.id,'fact','registered',
        jsonb_build_object('state',NEW.state,'owner_character_id',NEW.owner_character_id,
          'condition',NEW.condition,'q',NEW.q,'r',NEW.r));
    ELSIF OLD.state IS DISTINCT FROM NEW.state
      OR OLD.owner_character_id IS DISTINCT FROM NEW.owner_character_id
      OR OLD.creature_id IS DISTINCT FROM NEW.creature_id
      OR OLD.condition IS DISTINCT FROM NEW.condition THEN
      INSERT INTO object_events(item_id,kind,event_type,detail)
      VALUES(NEW.id,'fact','state_changed',
        jsonb_build_object('from',OLD.state,'to',NEW.state,
          'from_owner',OLD.owner_character_id,'to_owner',NEW.owner_character_id,
          'from_condition',OLD.condition,'to_condition',NEW.condition));
    END IF;
    RETURN NULL;
  END $fn$;
  CREATE TRIGGER market_objects_public_record
    AFTER INSERT OR UPDATE ON market_objects
    FOR EACH ROW EXECUTE FUNCTION record_object_fact();
  -- Existing V1/V2 items get only an honest snapshot, never fabricated history.
  INSERT INTO object_events(item_id,kind,event_type,detail)
    SELECT id,'fact','initial_snapshot',
      jsonb_build_object('state',state,'owner_character_id',owner_character_id,
        'condition',condition,'q',q,'r',r)
    FROM market_objects;
  INSERT INTO market_objects(id,label,weight,condition,state,base_price)
  VALUES
    ('00000000-0000-4000-8000-000000000101','Linterna de emergencia',2,89,'merchant',45),
    ('00000000-0000-4000-8000-000000000102','Llave sin cerradura',1,62,'merchant',60),
    ('00000000-0000-4000-8000-000000000103','Guantes de cuero viejo',2,73,'merchant',38)
  ON CONFLICT DO NOTHING;
  `,
  `
  -- An object must never stay advertised when it changes location or owner.
  -- Prevent stale public listings after death, theft, extraction or pickup.
  CREATE OR REPLACE FUNCTION reset_listing_on_transfer() RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
  BEGIN
    IF OLD.owner_character_id IS DISTINCT FROM NEW.owner_character_id
       OR OLD.state IS DISTINCT FROM NEW.state THEN
      NEW.listed=FALSE;
    END IF;
    RETURN NEW;
  END $fn$;
  CREATE TRIGGER object_transfer_unlists
    BEFORE UPDATE ON market_objects
    FOR EACH ROW EXECUTE FUNCTION reset_listing_on_transfer();
  UPDATE market_objects SET listed=FALSE WHERE state NOT IN ('carried','stash');
  -- Monetary audit records are append-only as well as public object facts.
  CREATE OR REPLACE FUNCTION forbid_ledger_edits() RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
  BEGIN
    RAISE EXCEPTION 'Ledger entries are append-only';
  END $fn$;
  CREATE TRIGGER wallet_ledger_immutable
    BEFORE UPDATE OR DELETE ON wallet_ledger
    FOR EACH ROW EXECUTE FUNCTION forbid_ledger_edits();
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
