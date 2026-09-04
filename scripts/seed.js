require('dotenv').config();

const db = require('../src/db');
const { seedDatabase } = require('../src/seed');

async function main() {
  await db.ensureSchema();
  const result = await seedDatabase();
  if (result.skipped) {
    console.log('Banco já possui dados. Seed ignorado.');
  } else {
    console.log('Seed concluído!');
    console.log('  Admin:    admin@rifa.com / admin123');
    console.log('  Operador: operador@rifa.com / operador123');
    console.log('  Rifa demo: /r/rifa-do-bem');
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('Falha no seed:', e);
  process.exit(1);
});
