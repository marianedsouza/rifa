const express = require('express');
const path = require('path');
const fs = require('fs');
const api = require('./src/routes/api');
const db = require('./src/db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '25mb' }));

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/r/:slug', (req, res) => res.sendFile(path.join(__dirname, 'public', 'rifa.html')));
app.get('/resultado/:slug', (req, res) => res.sendFile(path.join(__dirname, 'public', 'resultado.html')));

app.use('/api', api);

app.use((req, res) => res.status(404).json({ error: 'Não encontrado' }));

app.listen(PORT, () => {
  console.log('Rifa com Causa rodando em http://localhost:' + PORT);
});

function expireLoop() {
  try {
    const n = db.prepare(`
      SELECT o.id FROM orders o
      WHERE o.status='pending' AND o.expires_at IS NOT NULL AND o.expires_at < ?
    `).all(new Date().toISOString());
    n.forEach(r => {
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare(`
          UPDATE rifa_numeros SET status='available', order_id=NULL, participant_id=NULL, sold_at=NULL
          WHERE order_id=?
        `).run(r.id);
        db.prepare("UPDATE orders SET status='expired', updated_at=datetime('now') WHERE id=?").run(r.id);
        db.prepare("UPDATE payments SET status='expired' WHERE order_id=? AND status='pending'").run(r.id);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); }
    });
    if (n.length) console.log(`[expire] ${n.length} reserva(s) expirada(s)`);
  } catch (e) {
    console.error('[expire] erro:', e.message);
  }
}
setInterval(expireLoop, 15000);
