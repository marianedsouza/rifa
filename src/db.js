const { createClient } = require('@libsql/client');

// Suporta tanto os nomes usados no .env (rifa_TURSO_*) quanto os padrões TURSO_*
const URL =
  process.env.TURSO_DATABASE_URL ||
  process.env.rifa_TURSO_DATABASE_URL ||
  '';
const AUTH_TOKEN =
  process.env.TURSO_AUTH_TOKEN ||
  process.env.rifa_TURSO_AUTH_TOKEN ||
  '';

if (!URL) {
  throw new Error(
    'TURSO_DATABASE_URL não configurada. Defina TURSO_DATABASE_URL (ou rifa_TURSO_DATABASE_URL) nas variáveis de ambiente.'
  );
}

const client = createClient({
  url: URL,
  authToken: AUTH_TOKEN || undefined,
});

/*
 * Camada de compatibilidade.
 *
 * O código legado usava a API síncrona do node:sqlite:
 *   db.prepare(sql).get(...args)   -> uma linha
 *   db.prepare(sql).all(...args)   -> várias linhas
 *   db.prepare(sql).run(...args)   -> { lastInsertRowid, changes }
 *   db.exec(sqlOuComando)          -> executa SQL cru
 *
 * O libSQL/Turso é sempre assíncrono, então get/all/run/exec agora
 * retornam Promises e devem ser usados com await.
 */

function normalizeArgs(args) {
  // Aceita tanto .get(a, b, c) quanto .get([a, b, c])
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  return args;
}

function prepare(sql) {
  return {
    async get(...args) {
      const rs = await client.execute({ sql, args: normalizeArgs(args) });
      return rs.rows.length ? rowToObject(rs.rows[0]) : undefined;
    },
    async all(...args) {
      const rs = await client.execute({ sql, args: normalizeArgs(args) });
      return rs.rows.map(rowToObject);
    },
    async run(...args) {
      const rs = await client.execute({ sql, args: normalizeArgs(args) });
      return {
        lastInsertRowid:
          rs.lastInsertRowid != null ? Number(rs.lastInsertRowid) : undefined,
        changes: rs.rowsAffected,
      };
    },
  };
}

// As rows do libSQL são objetos "array-like" com getters por coluna.
// Convertendo para objeto simples para o resto do código funcionar igual.
function rowToObject(row) {
  const obj = {};
  for (const key of Object.keys(row)) obj[key] = row[key];
  return obj;
}

// Executa SQL cru. Aceita múltiplos statements separados por ';'.
async function exec(sql) {
  const statements = splitStatements(sql);
  if (statements.length <= 1) {
    await client.execute(sql);
    return;
  }
  // batch em modo sequencial mantém a ordem sem transação implícita agressiva
  await client.batch(statements, 'write');
}

function splitStatements(sql) {
  return String(sql)
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

/*
 * Transações: no libSQL serverless não usamos BEGIN/COMMIT interativos.
 * Em vez disso, agrupamos os comandos numa lista e chamamos runBatch(),
 * que executa tudo atomicamente (equivalente a uma transação).
 *
 * Uso:
 *   await runBatch([
 *     { sql: '...', args: [...] },
 *     { sql: '...', args: [...] },
 *   ]);
 */
async function runBatch(statements) {
  const stmts = statements.map((s) =>
    typeof s === 'string' ? { sql: s, args: [] } : { sql: s.sql, args: s.args || [] }
  );
  return client.batch(stmts, 'write');
}

let schemaReady = null;
async function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const statements = splitStatements(SCHEMA_SQL);
    await client.batch(statements, 'write');
  })();
  return schemaReady;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rifas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS visual_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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

CREATE TABLE IF NOT EXISTS rifa_numeros (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rifa_id INTEGER NOT NULL,
  number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  order_id INTEGER,
  participant_id INTEGER,
  sold_at TEXT,
  UNIQUE(rifa_id, number)
);

CREATE TABLE IF NOT EXISTS participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rifa_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  cpf TEXT NOT NULL,
  whatsapp TEXT DEFAULT '',
  email TEXT DEFAULT '',
  city TEXT DEFAULT '',
  state TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rifa_id INTEGER NOT NULL,
  participant_id INTEGER NOT NULL,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  qty INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  discount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_numbers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  numero_id INTEGER NOT NULL,
  rifa_id INTEGER NOT NULL,
  number INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  method TEXT NOT NULL DEFAULT 'pix',
  status TEXT NOT NULL DEFAULT 'pending',
  amount REAL NOT NULL,
  pix_brcode TEXT DEFAULT '',
  pix_qr TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  paid_at TEXT,
  admin_confirm INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS draws (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rifa_id INTEGER NOT NULL,
  numero_id INTEGER NOT NULL,
  number INTEGER NOT NULL,
  participant_name TEXT NOT NULL,
  participant_cpf_masked TEXT DEFAULT '',
  draw_code TEXT NOT NULL UNIQUE,
  admin_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT DEFAULT 'info',
  title TEXT DEFAULT '',
  message TEXT DEFAULT '',
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT DEFAULT '',
  details TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS art_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rifa_id INTEGER NOT NULL,
  name TEXT DEFAULT '',
  type TEXT DEFAULT 'square',
  config TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

module.exports = { client, prepare, exec, runBatch, ensureSchema };
