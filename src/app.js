const express = require('express');
const path = require('path');
const api = require('./routes/api');
const db = require('./db');
const { seedDatabase } = require('./seed');

const app = express();

app.use(express.json({ limit: '25mb' }));

// Arquivos estáticos do front-end
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR));

// Garante que o schema exista antes de qualquer rota da API (idempotente).
let schemaPromise = null;
app.use(async (req, res, next) => {
  try {
    if (!schemaPromise) schemaPromise = db.ensureSchema();
    await schemaPromise;
    next();
  } catch (e) {
    schemaPromise = null;
    console.error('[schema] erro ao inicializar:', e.message);
    res.status(500).json({ error: 'Erro ao inicializar o banco de dados' });
  }
});

app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));
app.get('/r/:slug', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'rifa.html')));
app.get('/resultado/:slug', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'resultado.html')));

app.use('/api', api);

// Endpoint de inicialização/seed do banco (usar uma vez após o deploy).
// Protegido por SEED_TOKEN: chame /api/seed?token=SEU_TOKEN
app.get('/api/seed', async (req, res) => {
  try {
    const expected = process.env.SEED_TOKEN;
    if (!expected) return res.status(403).json({ error: 'SEED_TOKEN não configurado no ambiente' });
    if (req.query.token !== expected) return res.status(401).json({ error: 'Token inválido' });
    await db.ensureSchema();
    const result = await seedDatabase();
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[seed] erro:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Endpoint chamado pelo Vercel Cron para expirar reservas vencidas.
app.get('/api/cron/expire', async (req, res) => {
  try {
    const n = await expireReservations();
    res.json({ ok: true, expired: n });
  } catch (e) {
    console.error('[cron/expire] erro:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.use((req, res) => res.status(404).json({ error: 'Não encontrado' }));

// Handler de erros: garante resposta JSON em vez de crash da função.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[erro]', err && err.stack ? err.stack : err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Erro interno do servidor' });
});

async function expireReservations() {
  const nowIso = new Date().toISOString();
  const rows = await db.prepare(`
    SELECT o.id FROM orders o
    WHERE o.status='pending' AND o.expires_at IS NOT NULL AND o.expires_at < ?
  `).all(nowIso);
  for (const r of rows) {
    await db.runBatch([
      { sql: "UPDATE rifa_numeros SET status='available', order_id=NULL, participant_id=NULL, sold_at=NULL WHERE order_id=?", args: [r.id] },
      { sql: "UPDATE orders SET status='expired', updated_at=datetime('now') WHERE id=?", args: [r.id] },
      { sql: "UPDATE payments SET status='expired' WHERE order_id=? AND status='pending'", args: [r.id] },
    ]);
  }
  return rows.length;
}

module.exports = app;
module.exports.expireReservations = expireReservations;
