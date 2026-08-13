const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function genCode(prefix, len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[crypto.randomInt(chars.length)];
  return (prefix ? prefix + '-' : '') + out;
}

function genUid() {
  return genCode('', 16);
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return salt + ':' + hash;
}

function verifyPassword(pw, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
}

function validCPF(cpf) {
  cpf = String(cpf || '').replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i]) * (10 - i);
  let d1 = 11 - (sum % 11);
  if (d1 >= 10) d1 = 0;
  if (d1 !== parseInt(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i]) * (11 - i);
  let d2 = 11 - (sum % 11);
  if (d2 >= 10) d2 = 0;
  return d2 === parseInt(cpf[10]);
}

function formatCPF(cpf) {
  cpf = String(cpf || '').replace(/\D/g, '');
  if (cpf.length === 11) return `${cpf.slice(0,3)}.${cpf.slice(3,6)}.${cpf.slice(6,9)}-${cpf.slice(9)}`;
  return cpf;
}

function maskCPF(cpf) {
  cpf = String(cpf || '').replace(/\D/g, '');
  if (cpf.length === 11) return `***.${cpf.slice(3,6)}.${cpf.slice(6,9)}-**`;
  return '***-**';
}

function maskPhone(phone) {
  phone = String(phone || '');
  if (phone.length < 8) return phone;
  return phone.slice(0, 2) + '****-' + phone.slice(-4);
}

function money(v) {
  const n = Number(v) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function crc16(payload) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function pixEMVField(id, value) {
  const v = String(value);
  return id + String(v.length).padStart(2, '0') + v;
}

function buildPix(amount, key, name, city, txid, description) {
  const payload =
    pixEMVField('00', '01') +
    pixEMVField('26', pixEMVField('00', 'br.gov.bcb.pix') + pixEMVField('01', key) + (description ? pixEMVField('02', description) : '')) +
    pixEMVField('52', '0000') +
    pixEMVField('53', '986') +
    (amount ? pixEMVField('54', Number(amount).toFixed(2)) : '') +
    pixEMVField('58', 'BR') +
    pixEMVField('59', String(name).slice(0, 24).toUpperCase()) +
    pixEMVField('60', String(city || 'BRASIL').slice(0, 14).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')) +
    pixEMVField('62', pixEMVField('05', (txid || genUid()).slice(0, 24))) +
    '6304';
  return payload + crc16(payload);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));
}

function saveBase64Image(dataUrl, folder) {
  const m = String(dataUrl).match(/^data:([a-zA-Z0-9.\/+\-]+);base64,(.+)$/);
  if (!m) return '';
  const extMap = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
  const ext = extMap[m[1]] || 'png';
  const name = genUid() + '.' + ext;
  const dir = path.join(__dirname, '..', 'uploads', folder || '');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), Buffer.from(m[2], 'base64'));
  return '/' + (folder ? folder + '/' : '') + name;
}

function padNumber(num, qty) {
  const digits = String(qty).length;
  return String(num).padStart(digits, '0');
}

function parsePackages(json) {
  try {
    const arr = JSON.parse(json || '[]');
    if (!Array.isArray(arr)) return [];
    return arr.map(p => ({ qty: Number(p.qty) || 0, price: Number(p.price) || 0 }));
  } catch (e) {
    return [];
  }
}

module.exports = {
  slugify, genCode, genUid, hashPassword, verifyPassword, validCPF, formatCPF, maskCPF,
  maskPhone, money, crc16, buildPix, isValidEmail, saveBase64Image, padNumber, parsePackages
};
