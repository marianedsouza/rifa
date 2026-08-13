const db = require('../src/db');
const { hashPassword, buildPix, genCode } = require('../src/util');

const qrcode = require('qrcode');

function seed() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) {
    console.log('Banco já possui dados. Seed ignorado.');
    return;
  }

  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)').run(
    'Administrador',
    'admin@rifa.com',
    hashPassword('admin123'),
    'super_admin'
  );
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)').run(
    'Operador',
    'operador@rifa.com',
    hashPassword('operador123'),
    'operator'
  );

  const now = new Date();
  const drawDate = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);

  const camp = db.prepare('INSERT INTO campaigns (name, description) VALUES (?,?)').run(
    'Instituto Novo Horizonte',
    'Programa Horizonte Mulher'
  );

  const rifa = db.prepare(`
    INSERT INTO rifas (
      campaign_id, name, slug, cause_name, cause_title, cause_subtitle, cause_short, cause_long,
      cause_objective, cause_benefited, cause_use_of_resources,
      org_name, org_instagram, org_whatsapp, org_email,
      prize_name, prize_desc, price, qty, packages,
      start_date, end_date, draw_date, draw_location, rules, responsible, contact,
      status, reserve_minutes
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    camp.lastInsertRowid,
    'Rifa do Bem',
    'rifa-do-bem',
    'Programa Horizonte Mulher',
    'Ajude o Instituto Novo Horizonte a ampliar o Programa Horizonte Mulher',
    'Sua participação pode transformar vidas',
    'O Instituto Novo Horizonte atua há 10 anos apoiando mulheres em situação de vulnerabilidade. Esta rifa vai ampliar o programa que oferece capacitação profissional e acolhimento.',
    'O Instituto Novo Horizonte é uma organização sem fins lucrativos que há mais de uma década desenvolve projetos de acolhimento, capacitação e autonomia para mulheres em situação de vulnerabilidade social. O Programa Horizonte Mulher atende gratuitamente mais de 200 mulheres por ano com cursos profissionalizantes, apoio psicológico e encaminhamento para o mercado de trabalho. Com a arrecadação desta rifa, vamos ampliar o programa para atender 100 novas mulheres no próximo ano.',
    'Ampliar o Programa Horizonte Mulher para atender 100 novas mulheres.',
    'Mulheres em situação de vulnerabilidade social.',
    'Os recursos serão utilizados na aquisição de materiais didáticos, estrutura para novos cursos e apoio financeiro para as participantes.',
    'Instituto Novo Horizonte',
    '@institutonovohorizonte',
    '5511999999999',
    'contato@institutonovohorizonte.org',
    'TV 50 polegadas 4K',
    'Televisão Smart TV 50" 4K com acesso aos principais apps de streaming. Entrega garantida.',
    10,
    300,
    JSON.stringify([{ qty: 1, price: 10 }, { qty: 5, price: 45 }, { qty: 10, price: 80 }, { qty: 20, price: 150 }]),
    now.toISOString().slice(0, 10),
    drawDate,
    drawDate,
    'Auditório do Instituto Novo Horizonte - São Paulo/SP',
    '1. O sorteio será realizado na data e local informados. 2. Somente números com pagamento confirmado participam. 3. O resultado será divulgado na página da rifa. 4. A organização se reserva o direito de adiar o sorteio por motivo de força maior.',
    'Maria Santos',
    '5511999999999',
    'active',
    10
  );

  const rifaId = rifa.lastInsertRowid;
  db.prepare('INSERT INTO visual_settings (rifa_id) VALUES (?)').run(rifaId);

  const qty = 300;
  const insertNum = db.prepare('INSERT INTO rifa_numeros (rifa_id, number) VALUES (?,?)');
  for (let i = 1; i <= qty; i++) insertNum.run(rifaId, i);

  const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const sold = 201;
  const participants = [];
  const names = ['Ana Paula Ribeiro', 'Carlos Eduardo Souza', 'Fernanda Lima', 'João Pedro Alves', 'Mariana Costa', 'Rafael Oliveira', 'Juliana Martins', 'Bruno Carvalho', 'Patrícia Gomes', 'Lucas Ferreira'];
  for (let i = 0; i < 40; i++) {
    const p = db.prepare('INSERT INTO participants (rifa_id, name, cpf, whatsapp, email, city, state) VALUES (?,?,?,?,?,?,?)').run(
      rifaId, names[rnd(0, names.length - 1)] + (i > 9 ? ' ' + i : ''),
      String(rnd(100, 999)) + String(rnd(100, 999)) + String(rnd(100, 999)) + String(rnd(10, 99)),
      '11' + String(rnd(10000000, 99999999)),
      'participante' + i + '@email.com',
      'São Paulo', 'SP'
    );
    participants.push(p.lastInsertRowid);
  }

  const updateNum = db.prepare('UPDATE rifa_numeros SET status=?, order_id=?, participant_id=?, sold_at=? WHERE id=?');
  const createOrder = db.prepare('INSERT INTO orders (rifa_id, participant_id, code, status, qty, unit_price, discount, total, updated_at) VALUES (?,?,?,?,?,?,?,?,datetime(\'now\'))');
  const createPay = db.prepare('INSERT INTO payments (order_id, method, status, amount, pix_brcode, pix_qr, paid_at) VALUES (?,?,?,?,?,?,datetime(\'now\'))');

  const paidNums = db.prepare('SELECT id, number FROM rifa_numeros WHERE rifa_id=? AND id <= ?').all(rifaId, sold);

  for (let i = 0; i < paidNums.length; i++) {
    const n = paidNums[i];
    const pid = participants[rnd(0, participants.length - 1)];
    const code = genCode('P', 6);
    const oid = createOrder.run(rifaId, pid, code, 'approved', 1, 10, 0, 10).lastInsertRowid;
    db.prepare('INSERT INTO order_numbers (order_id, numero_id, rifa_id, number) VALUES (?,?,?,?)').run(oid, n.id, rifaId, n.number);
    updateNum.run('paid', oid, pid, new Date(Date.now() - rnd(1, 20) * 86400000).toISOString(), n.id);
    createPay.run(oid, 'pix', 'approved', 10, '', '', );
  }

  const resNums = db.prepare('SELECT id, number FROM rifa_numeros WHERE rifa_id=? AND id > ? AND id <= ?').all(rifaId, sold, sold + 5);
  for (let i = 0; i < resNums.length; i++) {
    const n = resNums[i];
    const pid = participants[0];
    const resCode = genCode('R', 6);
    const oid = createOrder.run(rifaId, pid, resCode, 'pending', 1, 10, 0, 10, ).lastInsertRowid;
    db.prepare('INSERT INTO order_numbers (order_id, numero_id, rifa_id, number) VALUES (?,?,?,?)').run(oid, n.id, rifaId, n.number);
    updateNum.run('reserved', oid, pid, new Date(Date.now() - 2 * 60000).toISOString(), n.id);
    db.prepare('UPDATE orders SET expires_at=datetime(\'now\', \'+8 minutes\') WHERE id=?').run(oid);
  }

  db.prepare('INSERT INTO settings (key, value) VALUES (?,?)').run('platform_name', 'Rifa com Causa');
  db.prepare('INSERT INTO settings (key, value) VALUES (?,?)').run('pix_key', 'contato@institutonovohorizonte.org');
  db.prepare('INSERT INTO settings (key, value) VALUES (?,?)').run('org_name', 'Instituto Novo Horizonte');
  db.prepare('INSERT INTO settings (key, value) VALUES (?,?)').run('whatsapp_default', '5511999999999');

  console.log('Seed concluído!');
  console.log('  Admin:    admin@rifa.com / admin123');
  console.log('  Operador: operador@rifa.com / operador123');
  console.log('  Rifa demo: http://localhost:3000/r/rifa-do-bem');
}

seed();
