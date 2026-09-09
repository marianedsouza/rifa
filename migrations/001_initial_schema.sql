-- Migration: Criação do schema inicial
-- Rode este SQL no Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql/new
-- NOTA: Usuários são gerenciados pelo Supabase Auth (auth.users)

-- Campanhas de arrecadação
CREATE TABLE IF NOT EXISTS public.campaigns (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')::text
);

-- Rifas
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

-- Configurações visuais por rifa
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

-- Números de cada rifa
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

-- Participantes (quem compra números)
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

-- Pedidos
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

-- Números vinculados a cada pedido
CREATE TABLE IF NOT EXISTS public.order_numbers (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL,
  numero_id INTEGER NOT NULL,
  rifa_id INTEGER NOT NULL,
  number INTEGER NOT NULL
);

-- Pagamentos
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

-- Sorteios realizados
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

-- Notificações
CREATE TABLE IF NOT EXISTS public.notifications (
  id SERIAL PRIMARY KEY,
  type TEXT DEFAULT 'info',
  title TEXT DEFAULT '',
  message TEXT DEFAULT '',
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')::text
);

-- Logs de ações
CREATE TABLE IF NOT EXISTS public.logs (
  id SERIAL PRIMARY KEY,
  user_id TEXT,
  action TEXT DEFAULT '',
  details TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')::text
);

-- Configurações gerais da plataforma
CREATE TABLE IF NOT EXISTS public.settings (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT ''
);

-- Templates de arte para rifas
CREATE TABLE IF NOT EXISTS public.art_templates (
  id SERIAL PRIMARY KEY,
  rifa_id INTEGER NOT NULL,
  name TEXT DEFAULT '',
  type TEXT DEFAULT 'square',
  config TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')::text
);
