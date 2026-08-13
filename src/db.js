const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'rifa.db');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
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
`);

module.exports = db;
