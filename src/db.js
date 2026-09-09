const { Pool } = require('pg');

/*
 * Camada de compatibilidade.
 *
 * O código legado usava a API síncrona do node:sqlite:
 *   db.prepare(sql).get(...args)   -> uma linha
 *   db.prepare(sql).all(...args)   -> várias linhas
 *   db.prepare(sql).run(...args)   -> { lastInsertRowid, changes }
 *   db.exec(sqlOuComando)          -> executa SQL cru
 *
 * Agora usamos PostgreSQL (pg) com placeholders $1, $2, etc.
 * Esta camada converte automaticamente ? -> $1, $2, ... e mantém a mesma API.
 */

let _pool = null;
function getPool() {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL || '';
  if (!url || url.includes('COLE_AQUI') || url.includes('[YOUR-PASSWORD]')) {
    throw new Error(
      'DATABASE_URL não configurada corretamente no ambiente. Defina a connection string do Supabase PostgreSQL (formato: postgresql://postgres.[ref]:[senha]@aws-0-...pooler.supabase.com:6543/postgres)'
    );
  }
  _pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 5,
    connectionTimeoutMillis: 8000,
    statement_timeout: 20000,
    query_timeout: 20000,
    idleTimeoutMillis: 30000,
  });
  _pool.on('error', (err) => {
    console.error('[db] pool error:', err.message);
  });
  return _pool;
}

function convertPlaceholders(sql) {
  let idx = 0;
  return sql.replace(/\?/g, () => '$' + (++idx));
}

function normalizeArgs(args) {
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  return args;
}

function prepare(sql) {
  const pgSql = convertPlaceholders(sql);
  return {
    async get(...args) {
      const params = normalizeArgs(args);
      const rs = await getPool().query(pgSql, params);
      return rs.rows.length ? rs.rows[0] : undefined;
    },
    async all(...args) {
      const params = normalizeArgs(args);
      const rs = await getPool().query(pgSql, params);
      return rs.rows;
    },
    async run(...args) {
      const params = normalizeArgs(args);
      const isInsert = /^\s*INSERT\s+/i.test(sql);
      let execSql = pgSql;
      if (isInsert && !/\bRETURNING\b/i.test(sql)) {
        execSql = pgSql + ' RETURNING id';
      }
      const rs = await getPool().query(execSql, params);
      let lastInsertRowid = undefined;
      if (rs.rows.length && rs.rows[0].id != null) {
        lastInsertRowid = Number(rs.rows[0].id);
      }
      return {
        lastInsertRowid,
        changes: rs.rowCount,
      };
    },
  };
}

async function exec(sql) {
  await getPool().query(sql);
}

async function runBatch(statements) {
  const client = await getPool().connect();
  const results = [];
  try {
    await client.query('BEGIN');
    for (const s of statements) {
      const stmt = typeof s === 'string' ? { sql: s, args: [] } : { sql: s.sql, args: s.args || [] };
      const pgSql = convertPlaceholders(stmt.sql);
      const rs = await client.query(pgSql, stmt.args);
      results.push({ rowsAffected: rs.rowCount, rows: rs.rows });
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return results;
}

let schemaReady = null;
async function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const statements = splitStatements(SCHEMA_SQL).concat(splitStatements(SCHEMA_ALTERS));
    const client = await getPool().connect();
    try {
      for (const s of statements) {
        await client.query(s);
      }
    } catch (e) {
      console.error('[db] schema error:', e.message);
      schemaReady = null;
      throw e;
    } finally {
      client.release();
    }
  })();
  return schemaReady;
}

function splitStatements(sql) {
  return String(sql)
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS public.campaigns (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')::text
);

CREATE TABLE IF NOT EXISTS public.rifas (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  cause_name TEXT DEFAULT '',
  cause_title TEXT DEFAULT '',
  cause_subtitle TEXT DEFAULT '',
  cause_short TEXT DEFAULT '',
  cause_long TEXT DEFAULT '',
  cause_objective TEXT DEFAULT '',
  cause_benefited TEXT DEFAULT '',
  cause_use_of_resources TEXT DEFAULT '',
  org_name TEXT DEFAULT '',
  org_site TEXT DEFAULT '',
  org_instagram TEXT DEFAULT '',
  org_whatsapp TEXT DEFAULT '',
  org_email TEXT DEFAULT '',
  prize_name TEXT DEFAULT '',
  prize_image TEXT DEFAULT '',
  prize_desc TEXT DEFAULT '',
  price REAL NOT NULL DEFAULT 10,
  qty INTEGER NOT NULL DEFAULT 100,
  packages TEXT DEFAULT '[]',
  start_date TEXT DEFAULT '',
  end_date TEXT DEFAULT '',
  draw_date TEXT DEFAULT '',
  draw_location TEXT DEFAULT '',
  rules TEXT DEFAULT '',
  responsible TEXT DEFAULT '',
  contact TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  reserve_minutes INTEGER NOT NULL DEFAULT 10,
  draw_id TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')::text
);

CREATE TABLE IF NOT EXISTS public.visual_settings (
  id SERIAL PRIMARY KEY,
  rifa_id INTEGER NOT NULL UNIQUE,
  primary_color TEXT DEFAULT '#6A1E2C',
  secondary_color TEXT DEFAULT '#F7F6F3',
  accent_color TEXT DEFAULT '#C6A86B',
  bg_color TEXT DEFAULT '#FFFFFF',
  text_color TEXT DEFAULT '#1F2933',
  logo_main TEXT DEFAULT '',
  logo_secondary TEXT DEFAULT '',
  logo_org TEXT DEFAULT '',
  logo_campaign TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.rifa_numeros (
  id SERIAL PRIMARY KEY,
  rifa_id INTEGER NOT NULL,
  number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  order_id INTEGER,
  participant_id INTEGER,
  sold_at TEXT,
  UNIQUE(rifa_id, number)
);

CREATE TABLE IF NOT EXISTS public.participants (
  id SERIAL PRIMARY KEY,
  rifa_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  cpf TEXT NOT NULL,
  whatsapp TEXT DEFAULT '',
  email TEXT DEFAULT '',
  city TEXT DEFAULT '',
  state TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')::text
);

CREATE TABLE IF NOT EXISTS public.orders (
  id SERIAL PRIMARY KEY,
  rifa_id INTEGER NOT NULL,
  participant_id INTEGER NOT NULL,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  qty INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  discount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')::text,
  updated_at TEXT NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')::text
);

CREATE TABLE IF NOT EXISTS public.order_numbers (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL,
  numero_id INTEGER NOT NULL,
  rifa_id INTEGER NOT NULL,
  number INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS public.payments (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL,
  method TEXT NOT NULL DEFAULT 'pix',
  status TEXT NOT NULL DEFAULT 'pending',
  amount REAL NOT NULL,
  pix_brcode TEXT DEFAULT '',
  pix_qr TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')::text,
  expires_at TEXT,
  paid_at TEXT,
  admin_confirm INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.draws (
  id SERIAL PRIMARY KEY,
  rifa_id INTEGER NOT NULL,
  numero_id INTEGER NOT NULL,
  number INTEGER NOT NULL,
  participant_name TEXT NOT NULL,
  participant_cpf_masked TEXT DEFAULT '',
  draw_code TEXT NOT NULL UNIQUE,
  admin_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')::text
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id SERIAL PRIMARY KEY,
  type TEXT DEFAULT 'info',
  title TEXT DEFAULT '',
  message TEXT DEFAULT '',
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')::text
);

CREATE TABLE IF NOT EXISTS public.logs (
  id SERIAL PRIMARY KEY,
  user_id TEXT,
  action TEXT DEFAULT '',
  details TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')::text
);

CREATE TABLE IF NOT EXISTS public.settings (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.art_templates (
  id SERIAL PRIMARY KEY,
  rifa_id INTEGER NOT NULL,
  name TEXT DEFAULT '',
  type TEXT DEFAULT 'square',
  config TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')::text
);
`;

// Ajustes idempotentes de colunas já existentes (mudanças de tipo).
const SCHEMA_ALTERS = `
ALTER TABLE public.logs ALTER COLUMN user_id TYPE TEXT;
ALTER TABLE public.draws ALTER COLUMN admin_id TYPE TEXT;
`;

module.exports = { getPool, prepare, exec, runBatch, ensureSchema };
