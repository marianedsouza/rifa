const express = require('express');
const QRCode = require('qrcode');
const db = require('../db');
const { sign, requireAuth, requireRole, logAction, publicUser } = require('../auth');
const util = require('../util');

const router = express.Router();

// Wrapper para handlers async: captura erros e devolve 500 padrão.
function h(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function ok(res, data, code = 200) { return res.status(code).json(data); }

async function getSetting(key, def = '') {
  const r = await db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return r ? r.value : def;
}

async function setSetting(key, value) {
  await db.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
}

async function fullRifa(r) {
  if (!r) return null;
  const vis = await db.prepare('SELECT * FROM visual_settings WHERE rifa_id=?').get(r.id);
  return { ...r, packages: util.parsePackages(r.packages), visual: vis || {} };
}

async function ensureVisual(rifaId) {
  const vis = await db.prepare('SELECT * FROM visual_settings WHERE rifa_id=?').get(rifaId);
  if (!vis) {
    await db.prepare('INSERT INTO visual_settings (rifa_id) VALUES (?)').run(rifaId);
    return db.prepare('SELECT * FROM visual_settings WHERE rifa_id=?').get(rifaId);
  }
  return vis;
}

async function numberStats(rifaId) {
  const rows = await db.prepare(
    'SELECT status, COUNT(*) AS c FROM rifa_numeros WHERE rifa_id=? GROUP BY status'
  ).all(rifaId);
  const stats = { available: 0, selected: 0, reserved: 0, paid: 0, blocked: 0, expired: 0, total: 0 };
  rows.forEach(r => { stats[r.status] = r.c; });
  stats.total = rows.reduce((s, r) => s + r.c, 0);
  return stats;
}

async function drawResult(rifaId) {
  return db.prepare(`
    SELECT d.*, r.name AS rifa_name, r.prize_name, r.draw_location
    FROM draws d JOIN rifas r ON r.id = d.rifa_id
    WHERE d.rifa_id=? ORDER BY d.id DESC LIMIT 1
  `).get(rifaId);
}

async function generateNumbers(rifaId, qty) {
  const stmts = [{ sql: 'DELETE FROM rifa_numeros WHERE rifa_id=?', args: [rifaId] }];
  for (let i = 1; i <= qty; i++) {
    stmts.push({ sql: 'INSERT INTO rifa_numeros (rifa_id, number) VALUES (?,?)', args: [rifaId, i] });
  }
  await db.runBatch(stmts);
}

async function getRifaNumbers(rifaId, filters = {}) {
  let sql = 'SELECT * FROM rifa_numeros WHERE rifa_id=?';
  const params = [rifaId];
  if (filters.status && filters.status !== 'all') {
    if (filters.status === 'sold') {
      sql += " AND status IN ('paid')";
    } else {
      sql += ' AND status=?';
      params.push(filters.status);
    }
  }
  if (filters.q) {
    sql += ' AND CAST(number AS TEXT) LIKE ?';
    params.push('%' + filters.q + '%');
  }
  sql += ' ORDER BY number ASC';
  return db.prepare(sql).all(...params);
}

async function getParticipantInfo(pid) {
  return db.prepare('SELECT * FROM participants WHERE id=?').get(pid);
}

async function orderWithDetails(codeOrId) {
  const order = await db.prepare('SELECT * FROM orders WHERE code=? OR id=?').get(codeOrId, codeOrId);
  if (!order) return null;
  const rifa = await fullRifa(await db.prepare('SELECT * FROM rifas WHERE id=?').get(order.rifa_id));
  const participant = await getParticipantInfo(order.participant_id);
  const numbers = await db.prepare('SELECT n.* FROM order_numbers n WHERE n.order_id=?').all(order.id);
  const payment = await db.prepare('SELECT * FROM payments WHERE order_id=?').get(order.id);
  return { order, rifa, participant, numbers, payment };
}

function calculatePrice(rifa, qty) {
  const packs = util.parsePackages(rifa.packages).sort((a, b) => b.qty - a.qty);
  const standard = rifa.price * qty;
  let remaining = qty;
  let promo = 0;
  for (const p of packs) {
    if (p.qty > 0 && p.price > 0) {
      while (remaining >= p.qty) {
        promo += p.price;
        remaining -= p.qty;
      }
    }
  }
  if (remaining > 0) promo += remaining * rifa.price;
  return { standard, total: promo, discount: standard - promo, packs };
}

/* ============ PÚBLICO ============ */

router.get('/public/rifas', h(async (req, res) => {
  const rifas = await db.prepare("SELECT * FROM rifas WHERE status='active' ORDER BY created_at DESC").all();
  const withVis = [];
  for (const r of rifas) {
    const vis = await ensureVisual(r.id);
    const st = await numberStats(r.id);
    withVis.push({
      id: r.id, name: r.name, slug: r.slug, cause_name: r.cause_name, prize_name: r.prize_name,
      prize_image: r.prize_image, price: r.price, qty: r.qty, draw_date: r.draw_date,
      status: r.status,
      visual: vis,
      sold: st.paid, available: st.available + st.selected,
      total: st.total
    });
  }
  ok(res, withVis);
}));

router.get('/public/rifa/:slug', h(async (req, res) => {
  const r = await db.prepare('SELECT * FROM rifas WHERE slug=?').get(req.params.slug);
  if (!r) return res.status(404).json({ error: 'Rifa não encontrada' });
  const vis = await ensureVisual(r.id);
  const stats = await numberStats(r.id);
  const d = await drawResult(r.id);
  ok(res, {
    ...r,
    packages: util.parsePackages(r.packages),
    visual: vis,
    stats,
    draw: d,
    base_url: req.protocol + '://' + req.get('host'),
    share_url: req.protocol + '://' + req.get('host') + '/r/' + r.slug
  });
}));

router.get('/public/rifa/:slug/numeros', h(async (req, res) => {
  const r = await db.prepare('SELECT * FROM rifas WHERE slug=?').get(req.params.slug);
  if (!r) return res.status(404).json({ error: 'Rifa não encontrada' });
  const nums = await getRifaNumbers(r.id, {
    status: req.query.status || 'all',
    q: req.query.q || ''
  });
  ok(res, { numbers: nums, stats: await numberStats(r.id), rifa: { id: r.id, qty: r.qty } });
}));

router.get('/public/order/:code', h(async (req, res) => {
  const data = await orderWithDetails(req.params.code);
  if (!data) return res.status(404).json({ error: 'Pedido não encontrado' });
  ok(res, {
    order: data.order,
    rifa: data.rifa,
    participant: data.participant,
    numbers: data.numbers,
    payment: data.payment
  });
}));

router.post('/public/rifa/:slug/consulta', h(async (req, res) => {
  const { cpf, code } = req.body || {};
  const r = await db.prepare('SELECT * FROM rifas WHERE slug=?').get(req.params.slug);
  if (!r) return res.status(404).json({ error: 'Rifa não encontrada' });
  let orders = [];
  if (code) {
    orders = await db.prepare('SELECT * FROM orders WHERE code=? AND rifa_id=?').all(String(code).trim(), r.id);
  } else if (cpf) {
    const p = await db.prepare('SELECT id FROM participants WHERE rifa_id=? AND cpf=?').all(r.id, String(cpf).replace(/\D/g, ''));
    const ids = p.map(x => x.id);
    if (ids.length) {
      orders = await db.prepare(`SELECT * FROM orders WHERE participant_id IN (${ids.map(() => '?').join(',')}) AND rifa_id=?`).all(...ids, r.id);
    }
  }
  const result = [];
  for (const o of orders) {
    const nums = await db.prepare('SELECT n.* FROM order_numbers n WHERE n.order_id=?').all(o.id);
    const pay = await db.prepare('SELECT * FROM payments WHERE order_id=?').get(o.id);
    result.push({ order: o, numbers: nums, payment: pay });
  }
  ok(res, { found: result.length > 0, results: result });
}));

router.get('/public/rifa/:slug/resultado', h(async (req, res) => {
  const r = await db.prepare('SELECT * FROM rifas WHERE slug=?').get(req.params.slug);
  if (!r) return res.status(404).json({ error: 'Rifa não encontrada' });
  const d = await drawResult(r.id);
  const vis = await ensureVisual(r.id);
  ok(res, { rifa: { ...r, visual: vis }, draw: d });
}));

router.get('/qr', h(async (req, res) => {
  const text = String(req.query.text || '').slice(0, 500);
  if (!text) return res.status(400).json({ error: 'text obrigatório' });
  const url = await QRCode.toDataURL(text, { margin: 1, width: 512, errorCorrectionLevel: 'M' });
  ok(res, { dataUrl: url });
}));

router.post('/public/rifa/:slug/reserve', h(async (req, res) => {
  const r = await db.prepare('SELECT * FROM rifas WHERE slug=?').get(req.params.slug);
  if (!r) return res.status(404).json({ error: 'Rifa não encontrada' });
  if (r.status !== 'active') return res.status(400).json({ error: 'Esta rifa não está ativa' });
  const body = req.body || {};
  const numbers = Array.isArray(body.numbers) ? [...new Set(body.numbers.map(n => parseInt(n)).filter(n => Number.isInteger(n)))] : [];
  if (!numbers.length) return res.status(400).json({ error: 'Selecione ao menos um número' });

  const p = body.participant || {};
  const name = String(p.name || '').trim();
  const cpf = String(p.cpf || '').replace(/\D/g, '');
  if (!name) return res.status(400).json({ error: 'Informe o nome completo' });
  if (!util.validCPF(cpf)) return res.status(400).json({ error: 'CPF inválido' });
  if (String(p.whatsapp || '').trim().length < 8) return res.status(400).json({ error: 'Informe o WhatsApp com DDD' });
  if (p.email && !util.isValidEmail(p.email)) return res.status(400).json({ error: 'E-mail inválido' });

  const reserveMin = r.reserve_minutes || 10;

  // Verifica disponibilidade
  const existing = await db.prepare(
    'SELECT n.id, n.number, n.status FROM rifa_numeros n WHERE n.rifa_id=? AND n.number IN (' + numbers.map(() => '?').join(',') + ')'
  ).all(r.id, ...numbers);
  if (existing.length !== numbers.length) {
    return res.status(400).json({ error: 'Alguns números não existem nesta rifa' });
  }
  const busy = existing.filter(n => n.status !== 'available');
  if (busy.length) {
    return res.status(409).json({
      error: 'Alguns números já não estão mais disponíveis',
      busy: busy.map(n => n.number),
      message: 'Os números ' + busy.map(n => String(n.number).padStart(String(r.qty).length, '0')).join(', ') + ' acabaram de ser reservados por outro participante. Escolha outros números.'
    });
  }

  // Cria participante
  const pIns = await db.prepare(
    'INSERT INTO participants (rifa_id, name, cpf, whatsapp, email, city, state) VALUES (?,?,?,?,?,?,?)'
  ).run(r.id, name, cpf, String(p.whatsapp || '').trim(), String(p.email || '').trim(), String(p.city || '').trim(), String(p.state || '').trim());
  const pid = pIns.lastInsertRowid;

  const price = calculatePrice(r, numbers.length);
  const code = util.genCode('PED', 6);
  const expires = new Date(Date.now() + reserveMin * 60000).toISOString();
  const oIns = await db.prepare(`
    INSERT INTO orders (rifa_id, participant_id, code, status, qty, unit_price, discount, total, expires_at)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(r.id, pid, code, 'pending', numbers.length, r.price, price.discount, price.total, expires);
  const oid = oIns.lastInsertRowid;

  // Reserva os números atomicamente, garantindo que ainda estão disponíveis.
  // O UPDATE condicional (status='available') evita corrida entre reservas.
  const stmts = [];
  existing.forEach(n => {
    stmts.push({
      sql: 'INSERT INTO order_numbers (order_id, numero_id, rifa_id, number) VALUES (?,?,?,?)',
      args: [oid, n.id, r.id, n.number]
    });
    stmts.push({
      sql: "UPDATE rifa_numeros SET status='reserved', order_id=?, participant_id=?, sold_at=datetime('now') WHERE id=? AND status='available'",
      args: [oid, pid, n.id]
    });
  });
  const batchRes = await db.runBatch(stmts);

  // Confere se todos os UPDATEs de número afetaram 1 linha; se algum falhou,
  // outro participante pegou o número entre a checagem e a reserva -> desfaz.
  const updateResults = batchRes.filter((_, idx) => idx % 2 === 1);
  const allReserved = updateResults.every(rr => rr.rowsAffected === 1);
  if (!allReserved) {
    await db.runBatch([
      { sql: "UPDATE rifa_numeros SET status='available', order_id=NULL, participant_id=NULL, sold_at=NULL WHERE order_id=?", args: [oid] },
      { sql: 'DELETE FROM order_numbers WHERE order_id=?', args: [oid] },
      { sql: "UPDATE orders SET status='cancelled', updated_at=datetime('now') WHERE id=?", args: [oid] },
    ]);
    return res.status(409).json({
      error: 'Alguns números já não estão mais disponíveis',
      message: 'Os números selecionados acabaram de ser reservados por outro participante. Escolha outros números.'
    });
  }

  // Gera pagamento PIX
  const pixKey = await getSetting('pix_key', 'contato@rifacomcausa.com');
  const orgName = r.org_name || (await getSetting('org_name', 'Rifa com Causa'));
  const brcode = util.buildPix(price.total, pixKey, orgName, 'SAO PAULO', 'RIFA' + r.id, r.name);
  let qr = '';
  try {
    qr = await QRCode.toDataURL(brcode, { margin: 1, width: 512, errorCorrectionLevel: 'M' });
  } catch (e) { qr = ''; }
  await db.prepare(`
    INSERT INTO payments (order_id, method, status, amount, pix_brcode, pix_qr, expires_at)
    VALUES (?,?,?,?,?,?,?)
  `).run(oid, 'pix', 'pending', price.total, brcode, qr, expires);

  ok(res, { code, expires_at: expires, qty: numbers.length, total: price.total, discount: price.discount }, 201);
}));

router.post('/public/order/:code/confirm-sim', h(async (req, res) => {
  const data = await orderWithDetails(req.params.code);
  if (!data) return res.status(404).json({ error: 'Pedido não encontrado' });
  const o = data.order;
  if (o.status === 'approved') return ok(res, { status: 'approved', message: 'Pagamento já confirmado' });
  if (o.status === 'expired') return res.status(400).json({ error: 'Pagamento expirado' });

  await db.runBatch([
    { sql: "UPDATE orders SET status='approved', updated_at=datetime('now') WHERE id=?", args: [o.id] },
    { sql: "UPDATE payments SET status='approved', paid_at=datetime('now') WHERE order_id=? AND status='pending'", args: [o.id] },
    { sql: "UPDATE rifa_numeros SET status='paid' WHERE order_id=?", args: [o.id] },
  ]);
  ok(res, { status: 'approved' });
}));

/* ============ ADMIN: AUTENTICAÇÃO ============ */

router.post('/admin/login', h(async (req, res) => {
  const { email, password } = req.body || {};
  const user = await db.prepare('SELECT * FROM users WHERE email=?').get(String(email || '').toLowerCase().trim());
  if (!user || !util.verifyPassword(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'E-mail ou senha inválidos' });
  }
  if (!user.active) return res.status(403).json({ error: 'Usuário inativo' });
  const token = sign({ uid: user.id, role: user.role });
  await logAction(user.id, 'login', { email });
  ok(res, { token, user: publicUser(user) });
}));

router.get('/admin/me', requireAuth, h(async (req, res) => ok(res, { user: publicUser(req.user) })));

/* ============ ADMIN: DASHBOARD ============ */

router.get('/admin/dashboard', requireAuth, h(async (req, res) => {
  const rifas = await db.prepare('SELECT * FROM rifas ORDER BY created_at DESC').all();
  const totalSold = (await db.prepare("SELECT COUNT(*) AS c FROM rifa_numeros WHERE status='paid'").get()).c;
  const totalAvail = (await db.prepare("SELECT COUNT(*) AS c FROM rifa_numeros WHERE status IN ('available','selected')").get()).c;
  const totalOrders = (await db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status='approved'").get()).c;
  const revenue = (await db.prepare("SELECT COALESCE(SUM(total),0) AS s FROM orders WHERE status='approved'").get()).s;
  const totalQty = (await db.prepare('SELECT COALESCE(SUM(qty),0) AS s FROM rifas').get()).s;

  const perRifa = [];
  for (const r of rifas) {
    const st = await numberStats(r.id);
    const rev = (await db.prepare("SELECT COALESCE(SUM(total),0) AS s FROM orders WHERE rifa_id=? AND status='approved'").get(r.id)).s;
    perRifa.push({
      id: r.id, name: r.name, slug: r.slug, status: r.status, qty: r.qty,
      sold: st.paid, reserved: st.reserved, available: st.available,
      revenue: rev,
      potential: r.qty * r.price
    });
  }

  const salesByDay = await db.prepare(`
    SELECT substr(sold_at, 1, 10) AS day, COUNT(*) AS c
    FROM rifa_numeros WHERE status='paid' GROUP BY day ORDER BY day
  `).all();

  const recentOrders = await db.prepare(`
    SELECT o.*, p.name AS participant_name FROM orders o
    JOIN participants p ON p.id=o.participant_id
    ORDER BY o.id DESC LIMIT 10
  `).all();

  const recentLogs = await db.prepare('SELECT * FROM logs ORDER BY id DESC LIMIT 10').all();
  const pendingPayments = (await db.prepare("SELECT COUNT(*) AS c FROM payments WHERE status='pending'").get()).c;

  ok(res, {
    cards: {
      rifas_ativas: rifas.filter(r => r.status === 'active').length,
      numeros_vendidos: totalSold,
      numeros_disponiveis: totalAvail,
      participacoes: totalOrders,
      valor_arrecadado: revenue,
      percentual_vendido: totalQty ? Math.round((totalSold / totalQty) * 100) : 0
    },
    perRifa, salesByDay, recentOrders, recentLogs, pendingPayments
  });
}));

/* ============ ADMIN: RIFAS ============ */

router.get('/admin/rifas', requireAuth, h(async (req, res) => {
  const rifas = await db.prepare('SELECT * FROM rifas ORDER BY created_at DESC').all();
  const out = [];
  for (const r of rifas) {
    const st = await numberStats(r.id);
    const vis = await ensureVisual(r.id);
    out.push({ ...r, stats: st, visual: vis });
  }
  ok(res, out);
}));

router.get('/admin/rifas/:id', requireAuth, h(async (req, res) => {
  const r = await db.prepare('SELECT * FROM rifas WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Rifa não encontrada' });
  ok(res, await fullRifa(r));
}));

router.get('/admin/rifas/:id/dashboard', requireAuth, h(async (req, res) => {
  const r = await db.prepare('SELECT * FROM rifas WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Rifa não encontrada' });
  const st = await numberStats(r.id);
  const revenue = (await db.prepare("SELECT COALESCE(SUM(total),0) AS s FROM orders WHERE rifa_id=? AND status='approved'").get(r.id)).s;
  const participants = (await db.prepare("SELECT COUNT(DISTINCT participant_id) AS c FROM orders WHERE rifa_id=? AND status='approved'").get(r.id)).c;
  const salesByDay = await db.prepare(`
    SELECT substr(sold_at,1,10) AS day, COUNT(*) AS c FROM rifa_numeros
    WHERE rifa_id=? AND status='paid' GROUP BY day ORDER BY day
  `).all(r.id);
  const recentOrders = await db.prepare(`
    SELECT o.*, p.name AS participant_name, p.whatsapp FROM orders o
    JOIN participants p ON p.id=o.participant_id
    WHERE o.rifa_id=? ORDER BY o.id DESC LIMIT 10
  `).all(r.id);
  const draw = await drawResult(r.id);
  ok(res, {
    rifa: await fullRifa(r), stats: st, revenue, participants, salesByDay, recentOrders, draw,
    potential: r.qty * r.price, percent: st.total ? Math.round((st.paid / st.total) * 100) : 0
  });
}));

router.post('/admin/rifas', requireAuth, requireRole('super_admin', 'admin'), h(async (req, res) => {
  const body = req.body || {};
  if (!String(body.name || '').trim()) return res.status(400).json({ error: 'Nome da rifa é obrigatório' });
  let slug = util.slugify(body.slug || body.name);
  if (!slug) slug = 'rifa-' + util.genUid().slice(0, 6);
  const exists = await db.prepare('SELECT id FROM rifas WHERE slug=?').get(slug);
  if (exists) slug = slug + '-' + util.genUid().slice(0, 4).toLowerCase();

  const qty = Math.max(1, parseInt(body.qty) || 100);
  const price = Math.max(0, parseFloat(body.price) || 0);

  const ins = await db.prepare(`
    INSERT INTO rifas (name, slug, prize_name, prize_desc, prize_image, price, qty, packages,
      cause_name, cause_title, cause_subtitle, cause_short, cause_long, cause_objective, cause_benefited,
      cause_use_of_resources, org_name, org_site, org_instagram, org_whatsapp, org_email,
      start_date, end_date, draw_date, draw_location, rules, responsible, contact, status, reserve_minutes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    String(body.name).trim(), slug,
    String(body.prize_name || ''), String(body.prize_desc || ''), String(body.prize_image || ''),
    price, qty, JSON.stringify(Array.isArray(body.packages) ? body.packages : []),
    String(body.cause_name || ''), String(body.cause_title || ''), String(body.cause_subtitle || ''),
    String(body.cause_short || ''), String(body.cause_long || ''), String(body.cause_objective || ''),
    String(body.cause_benefited || ''), String(body.cause_use_of_resources || ''),
    String(body.org_name || ''), String(body.org_site || ''), String(body.org_instagram || ''),
    String(body.org_whatsapp || ''), String(body.org_email || ''),
    String(body.start_date || ''), String(body.end_date || ''), String(body.draw_date || ''),
    String(body.draw_location || ''), String(body.rules || ''), String(body.responsible || ''),
    String(body.contact || ''), String(body.status || 'draft'),
    Math.max(1, parseInt(body.reserve_minutes) || 10)
  );
  const id = ins.lastInsertRowid;

  await ensureVisual(id);
  await generateNumbers(id, qty);
  await logAction(req.user.id, 'rifa.create', { id, slug });
  ok(res, await fullRifa(await db.prepare('SELECT * FROM rifas WHERE id=?').get(id)), 201);
}));

router.put('/admin/rifas/:id', requireAuth, requireRole('super_admin', 'admin'), h(async (req, res) => {
  const r = await db.prepare('SELECT * FROM rifas WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Rifa não encontrada' });
  const body = req.body || {};

  const used = (await db.prepare("SELECT COUNT(*) AS c FROM rifa_numeros WHERE rifa_id=? AND status IN ('reserved','paid')").get(r.id)).c;
  const newQty = Math.max(1, parseInt(body.qty) || r.qty);
  if (newQty < used) {
    return res.status(400).json({
      error: 'Essa quantidade não pode ser reduzida porque existem números já vendidos ou reservados.',
      min: used
    });
  }

  const slug = body.slug ? util.slugify(body.slug) : r.slug;
  if (slug && slug !== r.slug) {
    const dup = await db.prepare('SELECT id FROM rifas WHERE slug=? AND id<>?').get(slug, r.id);
    if (dup) return res.status(400).json({ error: 'Slug já em uso' });
  }

  await db.prepare(`
    UPDATE rifas SET name=?, slug=?, prize_name=?, prize_desc=?, prize_image=?, price=?, qty=?, packages=?,
      cause_name=?, cause_title=?, cause_subtitle=?, cause_short=?, cause_long=?, cause_objective=?,
      cause_benefited=?, cause_use_of_resources=?, org_name=?, org_site=?, org_instagram=?, org_whatsapp=?, org_email=?,
      start_date=?, end_date=?, draw_date=?, draw_location=?, rules=?, responsible=?, contact=?,
      status=?, reserve_minutes=? WHERE id=?
  `).run(
    String(body.name ?? r.name), slug || r.slug,
    String(body.prize_name ?? r.prize_name), String(body.prize_desc ?? r.prize_desc), String(body.prize_image ?? r.prize_image),
    parseFloat(body.price ?? r.price), newQty,
    JSON.stringify(Array.isArray(body.packages) ? body.packages : util.parsePackages(r.packages)),
    String(body.cause_name ?? r.cause_name), String(body.cause_title ?? r.cause_title), String(body.cause_subtitle ?? r.cause_subtitle),
    String(body.cause_short ?? r.cause_short), String(body.cause_long ?? r.cause_long), String(body.cause_objective ?? r.cause_objective),
    String(body.cause_benefited ?? r.cause_benefited), String(body.cause_use_of_resources ?? r.cause_use_of_resources),
    String(body.org_name ?? r.org_name), String(body.org_site ?? r.org_site), String(body.org_instagram ?? r.org_instagram),
    String(body.org_whatsapp ?? r.org_whatsapp), String(body.org_email ?? r.org_email),
    String(body.start_date ?? r.start_date), String(body.end_date ?? r.end_date), String(body.draw_date ?? r.draw_date),
    String(body.draw_location ?? r.draw_location), String(body.rules ?? r.rules), String(body.responsible ?? r.responsible),
    String(body.contact ?? r.contact), String(body.status ?? r.status),
    Math.max(1, parseInt(body.reserve_minutes) || r.reserve_minutes),
    r.id
  );

  if (newQty > r.qty) {
    const maxRow = await db.prepare('SELECT MAX(number) AS m FROM rifa_numeros WHERE rifa_id=?').get(r.id);
    const maxNum = (maxRow && maxRow.m) || 0;
    const stmts = [];
    for (let i = maxNum + 1; i <= newQty; i++) {
      stmts.push({ sql: 'INSERT INTO rifa_numeros (rifa_id, number) VALUES (?,?)', args: [r.id, i] });
    }
    if (stmts.length) await db.runBatch(stmts);
  }
  if (newQty < r.qty) {
    await db.prepare("DELETE FROM rifa_numeros WHERE rifa_id=? AND number > ? AND status='available'").run(r.id, newQty);
  }

  await logAction(req.user.id, 'rifa.update', { id: r.id, slug });
  ok(res, await fullRifa(await db.prepare('SELECT * FROM rifas WHERE id=?').get(r.id)));
}));

router.delete('/admin/rifas/:id', requireAuth, requireRole('super_admin'), h(async (req, res) => {
  const r = await db.prepare('SELECT * FROM rifas WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Rifa não encontrada' });
  const sold = (await db.prepare("SELECT COUNT(*) AS c FROM rifa_numeros WHERE rifa_id=? AND status='paid'").get(r.id)).c;
  if (sold > 0) return res.status(400).json({ error: 'Não é possível excluir uma rifa com números vendidos' });
  await db.runBatch([
    { sql: 'DELETE FROM rifa_numeros WHERE rifa_id=?', args: [r.id] },
    { sql: 'DELETE FROM order_numbers WHERE rifa_id=?', args: [r.id] },
    { sql: 'DELETE FROM visual_settings WHERE rifa_id=?', args: [r.id] },
    { sql: 'DELETE FROM participants WHERE rifa_id=?', args: [r.id] },
    { sql: 'DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE rifa_id=?)', args: [r.id] },
    { sql: 'DELETE FROM orders WHERE rifa_id=?', args: [r.id] },
    { sql: 'DELETE FROM rifas WHERE id=?', args: [r.id] },
  ]);
  await logAction(req.user.id, 'rifa.delete', { id: r.id });
  ok(res, { ok: true });
}));

router.put('/admin/rifas/:id/visual', requireAuth, requireRole('super_admin', 'admin'), h(async (req, res) => {
  const r = await db.prepare('SELECT id FROM rifas WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Rifa não encontrada' });
  const b = req.body || {};
  const vis = await ensureVisual(r.id);
  await db.prepare(`
    UPDATE visual_settings SET primary_color=?, secondary_color=?, accent_color=?, bg_color=?, text_color=?,
      logo_main=?, logo_secondary=?, logo_org=?, logo_campaign=? WHERE rifa_id=?
  `).run(
    String(b.primary_color || vis.primary_color), String(b.secondary_color || vis.secondary_color),
    String(b.accent_color || vis.accent_color), String(b.bg_color || vis.bg_color), String(b.text_color || vis.text_color),
    String(b.logo_main ?? vis.logo_main), String(b.logo_secondary ?? vis.logo_secondary),
    String(b.logo_org ?? vis.logo_org), String(b.logo_campaign ?? vis.logo_campaign),
    r.id
  );
  await logAction(req.user.id, 'rifa.visual', { id: r.id });
  ok(res, await ensureVisual(r.id));
}));

/* ============ ADMIN: NÚMEROS ============ */

router.get('/admin/rifas/:id/numeros', requireAuth, h(async (req, res) => {
  const r = await db.prepare('SELECT id FROM rifas WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Rifa não encontrada' });
  const nums = await getRifaNumbers(r.id, { status: req.query.status || 'all', q: req.query.q || '' });
  const rows = [];
  for (const n of nums) {
    const info = { number: n.number, status: n.status, id: n.id };
    if (n.participant_id) {
      const p = await getParticipantInfo(n.participant_id);
      if (p) { info.participant = p.name; info.cpf = p.cpf; }
    }
    if (n.order_id) {
      const o = await db.prepare('SELECT code, status FROM orders WHERE id=?').get(n.order_id);
      if (o) { info.order_code = o.code; info.order_status = o.status; }
    }
    info.sold_at = n.sold_at;
    rows.push(info);
  }
  ok(res, { numbers: rows, stats: await numberStats(r.id) });
}));

router.patch('/admin/numeros/:numId', requireAuth, requireRole('super_admin', 'admin'), h(async (req, res) => {
  const n = await db.prepare('SELECT * FROM rifa_numeros WHERE id=?').get(req.params.numId);
  if (!n) return res.status(404).json({ error: 'Número não encontrado' });
  const { action } = req.body || {};
  if (action === 'block') {
    if (n.status !== 'available') return res.status(400).json({ error: 'Apenas números disponíveis podem ser bloqueados' });
    await db.prepare("UPDATE rifa_numeros SET status='blocked' WHERE id=?").run(n.id);
    await logAction(req.user.id, 'numero.block', { rifa_id: n.rifa_id, number: n.number });
  } else if (action === 'unblock') {
    if (n.status !== 'blocked') return res.status(400).json({ error: 'Número não está bloqueado' });
    await db.prepare("UPDATE rifa_numeros SET status='available' WHERE id=?").run(n.id);
    await logAction(req.user.id, 'numero.unblock', { rifa_id: n.rifa_id, number: n.number });
  } else {
    return res.status(400).json({ error: 'Ação inválida' });
  }
  ok(res, await db.prepare('SELECT * FROM rifa_numeros WHERE id=?').get(n.id));
}));

router.patch('/admin/rifas/:id/numeros', requireAuth, requireRole('super_admin', 'admin'), h(async (req, res) => {
  const { action, numbers } = req.body || {};
  if (!Array.isArray(numbers) || !numbers.length) return res.status(400).json({ error: 'Informe os números' });
  const ph = numbers.map(() => '?').join(',');
  let result;
  if (action === 'block') {
    result = await db.prepare(`UPDATE rifa_numeros SET status='blocked' WHERE rifa_id=? AND number IN (${ph}) AND status='available'`).run(req.params.id, ...numbers);
  } else if (action === 'unblock') {
    result = await db.prepare(`UPDATE rifa_numeros SET status='available' WHERE rifa_id=? AND number IN (${ph}) AND status='blocked'`).run(req.params.id, ...numbers);
  } else {
    return res.status(400).json({ error: 'Ação inválida' });
  }
  ok(res, { changed: result.changes });
}));

/* ============ ADMIN: PEDIDOS ============ */

router.get('/admin/rifas/:id/orders', requireAuth, h(async (req, res) => {
  const r = await db.prepare('SELECT id FROM rifas WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Rifa não encontrada' });
  const orders = await db.prepare(`
    SELECT o.*, p.name AS participant_name, p.cpf, p.whatsapp, p.email, p.city, p.state,
      (SELECT COUNT(*) FROM order_numbers n WHERE n.order_id=o.id) AS num_count
    FROM orders o JOIN participants p ON p.id=o.participant_id
    WHERE o.rifa_id=? ORDER BY o.id DESC
  `).all(r.id);
  const rows = [];
  for (const o of orders) {
    const pay = await db.prepare('SELECT * FROM payments WHERE order_id=?').get(o.id);
    const nums = await db.prepare('SELECT n.* FROM order_numbers n WHERE n.order_id=?').all(o.id);
    rows.push({ ...o, payment: pay, numbers: nums });
  }
  ok(res, rows);
}));

router.post('/admin/orders/:id/confirm', requireAuth, requireRole('super_admin', 'admin'), h(async (req, res) => {
  const o = await db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Pedido não encontrado' });
  await db.runBatch([
    { sql: "UPDATE orders SET status='approved', updated_at=datetime('now') WHERE id=?", args: [o.id] },
    { sql: "UPDATE payments SET status='approved', paid_at=datetime('now') WHERE order_id=? AND status='pending'", args: [o.id] },
    { sql: "UPDATE rifa_numeros SET status='paid' WHERE order_id=?", args: [o.id] },
  ]);
  await logAction(req.user.id, 'order.confirm', { order: o.code });
  ok(res, { status: 'approved' });
}));

router.post('/admin/orders/:id/cancel', requireAuth, requireRole('super_admin', 'admin'), h(async (req, res) => {
  const o = await db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Pedido não encontrado' });
  await db.runBatch([
    { sql: "UPDATE rifa_numeros SET status='available', order_id=NULL, participant_id=NULL, sold_at=NULL WHERE order_id=?", args: [o.id] },
    { sql: "UPDATE orders SET status='cancelled', updated_at=datetime('now') WHERE id=?", args: [o.id] },
    { sql: "UPDATE payments SET status='cancelled' WHERE order_id=? AND status='pending'", args: [o.id] },
  ]);
  await logAction(req.user.id, 'order.cancel', { order: o.code });
  ok(res, { status: 'cancelled' });
}));

/* ============ ADMIN: PARTICIPANTES ============ */

router.get('/admin/rifas/:id/participants', requireAuth, h(async (req, res) => {
  const rows = await db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM order_numbers n JOIN orders o ON o.id=n.order_id WHERE o.participant_id=p.id AND o.status='approved') AS num_paid,
      (SELECT COALESCE(SUM(o.total),0) FROM orders o WHERE o.participant_id=p.id AND o.status='approved') AS total_spent
    FROM participants p WHERE p.rifa_id=? ORDER BY p.id DESC
  `).all(req.params.id);
  ok(res, rows);
}));

/* ============ ADMIN: SORTEIO ============ */

router.get('/admin/rifas/:id/draw-info', requireAuth, h(async (req, res) => {
  const r = await db.prepare('SELECT * FROM rifas WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Rifa não encontrada' });
  const sold = (await db.prepare("SELECT COUNT(*) AS c FROM rifa_numeros WHERE rifa_id=? AND status='paid'").get(r.id)).c;
  const participants = (await db.prepare("SELECT COUNT(DISTINCT participant_id) AS c FROM orders WHERE rifa_id=? AND status='approved'").get(r.id)).c;
  const revenue = (await db.prepare("SELECT COALESCE(SUM(total),0) AS s FROM orders WHERE rifa_id=? AND status='approved'").get(r.id)).s;
  ok(res, { sold, participants, revenue, eligible: sold > 0 });
}));

router.post('/admin/rifas/:id/sortear', requireAuth, requireRole('super_admin', 'admin'), h(async (req, res) => {
  const r = await db.prepare('SELECT * FROM rifas WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Rifa não encontrada' });
  const existing = await db.prepare('SELECT id FROM draws WHERE rifa_id=?').get(r.id);
  if (existing) return res.status(400).json({ error: 'Esta rifa já possui sorteio realizado' });

  const eligible = await db.prepare(`
    SELECT n.*, p.name AS participant_name, p.cpf FROM rifa_numeros n
    JOIN order_numbers on_n ON on_n.numero_id = n.id
    JOIN orders o ON o.id = on_n.order_id AND o.status='approved'
    JOIN participants p ON p.id = o.participant_id
    WHERE n.rifa_id=? AND n.status='paid'
  `).all(r.id);
  if (!eligible.length) return res.status(400).json({ error: 'Não há números elegíveis. Venda números antes de sortear.' });

  const winner = eligible[Math.floor(Math.random() * eligible.length)];
  const drawCode = util.genCode('S', 10);
  const ins = await db.prepare(`
    INSERT INTO draws (rifa_id, numero_id, number, participant_name, participant_cpf_masked, draw_code, admin_id)
    VALUES (?,?,?,?,?,?,?)
  `).run(r.id, winner.id, winner.number, winner.participant_name, util.maskCPF(winner.cpf), drawCode, req.user.id);
  const did = ins.lastInsertRowid;

  await db.prepare("UPDATE rifas SET status='finished', draw_id=? WHERE id=?").run(drawCode, r.id);
  await logAction(req.user.id, 'rifa.draw', { rifa_id: r.id, number: winner.number, draw_code: drawCode });
  const draw = await db.prepare('SELECT * FROM draws WHERE id=?').get(did);
  ok(res, { draw, winner: { number: winner.number, name: winner.participant_name } });
}));

/* ============ ADMIN: RELATÓRIOS ============ */

function toCSV(headers, rows) {
  const esc = v => {
    v = v == null ? '' : String(v);
    return /["\n,]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  return '\uFEFF' + headers.join(';') + '\n' + rows.map(r => r.map(esc).join(';')).join('\n');
}

router.get('/admin/reports/:type', requireAuth, h(async (req, res) => {
  const { type } = req.params;
  const rifaId = req.query.rifa_id ? parseInt(req.query.rifa_id) : null;
  const where = rifaId ? ' WHERE rifa_id=?' : '';
  const whereArgs = rifaId ? [rifaId] : [];
  let headers = [], rows = [];

  if (type === 'vendas') {
    headers = ['Pedido', 'Rifa', 'Participante', 'CPF', 'WhatsApp', 'Números', 'Qtd', 'Total', 'Status', 'Data'];
    const orderWhere = rifaId ? ' WHERE o.rifa_id=?' : '';
    rows = (await db.prepare(`
      SELECT o.code, r.name AS rifa, p.name, p.cpf, p.whatsapp,
        (SELECT GROUP_CONCAT(n.number) FROM order_numbers n WHERE n.order_id=o.id) AS nums,
        o.qty, o.total, o.status, o.created_at
      FROM orders o JOIN participants p ON p.id=o.participant_id JOIN rifas r ON r.id=o.rifa_id
    ` + orderWhere).all(...whereArgs)).map(r => [r.code, r.rifa, r.name, r.cpf, r.whatsapp, r.nums, r.qty, r.total, r.status, r.created_at]);
  } else if (type === 'participantes') {
    headers = ['ID', 'Nome', 'CPF', 'WhatsApp', 'E-mail', 'Cidade', 'UF', 'Rifa', 'Números pagos', 'Total gasto'];
    const pWhere = rifaId ? ' WHERE p.rifa_id=?' : '';
    rows = (await db.prepare(`
      SELECT p.id, p.name, p.cpf, p.whatsapp, p.email, p.city, p.state, r.name AS rifa,
        (SELECT COUNT(*) FROM order_numbers n JOIN orders o ON o.id=n.order_id WHERE o.participant_id=p.id AND o.status='approved') AS np,
        (SELECT COALESCE(SUM(o.total),0) FROM orders o WHERE o.participant_id=p.id AND o.status='approved') AS tot
      FROM participants p JOIN rifas r ON r.id=p.rifa_id
    ` + pWhere).all(...whereArgs)).map(p => [p.id, p.name, p.cpf, p.whatsapp, p.email, p.city, p.state, p.rifa, p.np, p.tot]);
  } else if (type === 'financeiro') {
    headers = ['Rifa', 'Vendidos', 'Valor arrecadado', 'Valor potencial', 'Descontos', 'Pendentes'];
    const rifas = await db.prepare('SELECT id, name, qty, price FROM rifas' + (rifaId ? ' WHERE id=?' : '')).all(...whereArgs);
    for (const r of rifas) {
      const paid = (await db.prepare("SELECT COUNT(*) c FROM rifa_numeros WHERE rifa_id=? AND status='paid'").get(r.id)).c;
      const rev = (await db.prepare("SELECT COALESCE(SUM(total),0) s FROM orders WHERE rifa_id=? AND status='approved'").get(r.id)).s;
      const disc = (await db.prepare("SELECT COALESCE(SUM(discount),0) s FROM orders WHERE rifa_id=? AND status='approved'").get(r.id)).s;
      const pend = (await db.prepare("SELECT COALESCE(SUM(total),0) s FROM orders WHERE rifa_id=? AND status='pending'").get(r.id)).s;
      rows.push([r.name, paid, rev, r.qty * r.price, disc, pend]);
    }
  } else if (type === 'pagamentos') {
    headers = ['Pedido', 'Método', 'Status', 'Valor', 'Criado', 'Pago'];
    rows = (await db.prepare('SELECT o.code, p.method, p.status, p.amount, p.created_at, p.paid_at FROM payments p JOIN orders o ON o.id=p.order_id').all())
      .map(p => [p.code, p.method, p.status, p.amount, p.created_at, p.paid_at]);
  } else if (type === 'numeros') {
    headers = ['Rifa', 'Número', 'Status', 'Participante', 'Pedido', 'Vendido'];
    rows = (await db.prepare(`
      SELECT r.name, n.number, n.status, p.name AS pname, o.code, n.sold_at
      FROM rifa_numeros n JOIN rifas r ON r.id=n.rifa_id
      LEFT JOIN participants p ON p.id=n.participant_id
      LEFT JOIN orders o ON o.id=n.order_id
    `).all()).map(x => [x.name, x.number, x.status, x.pname, x.code, x.sold_at]);
  } else if (type === 'reservas') {
    headers = ['Pedido', 'Participante', 'Números', 'Qtd', 'Total', 'Expira', 'Status'];
    rows = (await db.prepare(`
      SELECT o.code, p.name,
        (SELECT GROUP_CONCAT(n.number) FROM order_numbers n WHERE n.order_id=o.id) AS nums,
        o.qty, o.total, o.expires_at, o.status
      FROM orders o JOIN participants p ON p.id=o.participant_id
      WHERE o.status IN ('pending','expired')
    `).all()).map(r => [r.code, r.name, r.nums, r.qty, r.total, r.expires_at, r.status]);
  } else if (type === 'sorteios') {
    headers = ['Rifa', 'Número', 'Vencedor', 'CPF', 'Código', 'Data'];
    rows = (await db.prepare(`
      SELECT r.name, d.number, d.participant_name, d.participant_cpf_masked, d.draw_code, d.created_at
      FROM draws d JOIN rifas r ON r.id=d.rifa_id
    `).all()).map(d => [d.name, d.number, d.participant_name, d.participant_cpf_masked, d.draw_code, d.created_at]);
  } else {
    return res.status(400).json({ error: 'Tipo de relatório inválido' });
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${type}_${Date.now()}.csv"`);
  res.send(toCSV(headers, rows));
}));

/* ============ ADMIN: USUÁRIOS ============ */

router.get('/admin/users', requireAuth, requireRole('super_admin'), h(async (req, res) => {
  ok(res, await db.prepare('SELECT id, name, email, role, active, created_at FROM users ORDER BY id').all());
}));

router.post('/admin/users', requireAuth, requireRole('super_admin'), h(async (req, res) => {
  const b = req.body || {};
  if (!String(b.name || '').trim() || !util.isValidEmail(b.email)) return res.status(400).json({ error: 'Nome e e-mail válido são obrigatórios' });
  if (String(b.password || '').length < 6) return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres' });
  const email = b.email.toLowerCase().trim();
  if (await db.prepare('SELECT id FROM users WHERE email=?').get(email)) return res.status(400).json({ error: 'E-mail já cadastrado' });
  const ins = await db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)').run(
    b.name.trim(), email, util.hashPassword(b.password), b.role || 'operator'
  );
  const id = ins.lastInsertRowid;
  await logAction(req.user.id, 'user.create', { id });
  ok(res, await db.prepare('SELECT id, name, email, role, active FROM users WHERE id=?').get(id), 201);
}));

router.put('/admin/users/:id', requireAuth, requireRole('super_admin'), h(async (req, res) => {
  const u = await db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });
  const b = req.body || {};
  if (b.password) {
    if (String(b.password).length < 6) return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres' });
    await db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(util.hashPassword(b.password), u.id);
  }
  if (b.name) await db.prepare('UPDATE users SET name=? WHERE id=?').run(String(b.name).trim(), u.id);
  if (b.role) await db.prepare('UPDATE users SET role=? WHERE id=?').run(String(b.role), u.id);
  if (typeof b.active === 'boolean') await db.prepare('UPDATE users SET active=? WHERE id=?').run(b.active ? 1 : 0, u.id);
  await logAction(req.user.id, 'user.update', { id: u.id });
  ok(res, await db.prepare('SELECT id, name, email, role, active FROM users WHERE id=?').get(u.id));
}));

/* ============ ADMIN: LOGS E CONFIGURAÇÕES ============ */

router.get('/admin/logs', requireAuth, requireRole('super_admin', 'admin'), h(async (req, res) => {
  ok(res, await db.prepare('SELECT * FROM logs ORDER BY id DESC LIMIT 200').all());
}));

router.get('/admin/settings', requireAuth, h(async (req, res) => {
  const keys = ['platform_name', 'platform_logo', 'primary_color', 'secondary_color', 'accent_color', 'bg_color', 'text_color',
    'whatsapp_default', 'email_default', 'org_name', 'org_cnpj', 'org_address',
    'pix_key', 'reserve_minutes', 'terms', 'privacy'];
  const out = {};
  for (const k of keys) out[k] = await getSetting(k, '');
  ok(res, out);
}));

router.put('/admin/settings', requireAuth, requireRole('super_admin', 'admin'), h(async (req, res) => {
  const b = req.body || {};
  for (const [k, v] of Object.entries(b)) {
    if (k.startsWith('platform_') || k.startsWith('whatsapp') || k.startsWith('email') ||
      k === 'primary_color' || k === 'secondary_color' || k === 'accent_color' || k === 'bg_color' || k === 'text_color' ||
      k === 'org_name' || k === 'org_cnpj' || k === 'org_address' || k === 'pix_key' || k === 'reserve_minutes' ||
      k === 'terms' || k === 'privacy') {
      await setSetting(k, v);
    }
  }
  await logAction(req.user.id, 'settings.update', {});
  ok(res, { ok: true });
}));

router.get('/admin/notifications', requireAuth, h(async (req, res) => {
  ok(res, await db.prepare('SELECT * FROM notifications ORDER BY id DESC LIMIT 50').all());
}));

router.post('/admin/notifications/read-all', requireAuth, h(async (req, res) => {
  await db.prepare('UPDATE notifications SET read=1').run();
  ok(res, { ok: true });
}));

/* ============ ADMIN: UPLOAD ============ */

router.post('/admin/upload', requireAuth, h(async (req, res) => {
  const { data, folder } = req.body || {};
  const stored = util.saveBase64Image(data, folder || 'images');
  if (!stored) return res.status(400).json({ error: 'Imagem inválida' });
  ok(res, { path: stored }, 201);
}));

module.exports = router;
