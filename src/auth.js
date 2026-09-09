const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');

const SECRET = process.env.JWT_SECRET || 'rifa-secret-local-2026';

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}

function verify(token) {
  try {
    const [body, sig] = String(token).split('.');
    const expect = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
    const a = Buffer.from(sig), b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return JSON.parse(Buffer.from(body, 'base64url').toString());
  } catch (e) {
    return null;
  }
}

function parseUserMeta(raw) {
  if (!raw || typeof raw !== 'object') return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch (e) { return {}; }
  }
  return raw;
}

function normalizeUser(u) {
  const meta = parseUserMeta(u.raw_user_meta_data);
  return {
    id: u.id,
    name: meta.name || u.raw_app_meta_data?.name || u.email || '',
    email: u.email,
    role: meta.role || 'operator',
    active: meta.active !== undefined ? (meta.active ? 1 : (meta.active === false ? 0 : 1)) : 1,
    created_at: u.created_at,
  };
}

function publicUser(u) {
  const n = normalizeUser(u);
  return { id: n.id, name: n.name, email: n.email, role: n.role };
}

async function requireAuth(req, res, next) {
  try {
    const hdr = req.headers.authorization || '';
    const token = hdr.startsWith('Bearer ')
      ? hdr.slice(7)
      : (req.query && req.query.token ? String(req.query.token) : null);
    const payload = token ? verify(token) : null;
    if (!payload) return res.status(401).json({ error: 'Não autenticado' });
    const user = await db.prepare('SELECT * FROM auth.users WHERE id=?').get(payload.uid);
    if (!user) return res.status(401).json({ error: 'Usuário inválido' });
    const n = normalizeUser(user);
    if (!n.active) return res.status(401).json({ error: 'Usuário inativo' });
    req.user = { ...user, _normalized: n };
    req.user.id = n.id;
    req.user.role = n.role;
    req.user.email = n.email;
    req.user.name = n.name;
    next();
  } catch (e) {
    next(e);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Acesso negado' });
    next();
  };
}

async function logAction(userId, action, details) {
  try {
    await db.prepare('INSERT INTO logs (user_id, action, details) VALUES (?,?,?)').run(
      userId || null, action, JSON.stringify(details || {})
    );
  } catch (e) {
    console.error('[logAction] erro:', e.message);
  }
}

module.exports = { sign, verify, requireAuth, requireRole, publicUser, logAction, normalizeUser, parseUserMeta };
