const crypto = require('crypto');
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

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

async function requireAuth(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    const payload = token ? verify(token) : null;
    if (!payload) return res.status(401).json({ error: 'Não autenticado' });
    const user = await db.prepare('SELECT * FROM users WHERE id=?').get(payload.uid);
    if (!user || !user.active) return res.status(401).json({ error: 'Usuário inválido' });
    req.user = user;
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
    // logging não deve derrubar a requisição
    console.error('[logAction] erro:', e.message);
  }
}

module.exports = { sign, verify, requireAuth, requireRole, publicUser, logAction };
