// Entrada para execução LOCAL (desenvolvimento).
// No Vercel, a entrada é api/index.js (serverless) e este arquivo não é usado.
require('dotenv').config();

const app = require('./src/app');
const db = require('./src/db');

const PORT = process.env.PORT || 3000;

async function start() {
  await db.ensureSchema();

  app.listen(PORT, () => {
    console.log('Rifa com Causa rodando em http://localhost:' + PORT);
  });

  // Loop de expiração de reservas (apenas no ambiente local; no Vercel usamos Cron).
  setInterval(async () => {
    try {
      const n = await app.expireReservations();
      if (n) console.log(`[expire] ${n} reserva(s) expirada(s)`);
    } catch (e) {
      console.error('[expire] erro:', e.message);
    }
  }, 15000);
}

start().catch((e) => {
  console.error('Falha ao iniciar o servidor:', e);
  process.exit(1);
});
