window.API = {
  async get(url) {
    const r = await fetch(url);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Erro na requisição');
    return j;
  },
  async post(url, body) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Erro na requisição');
    return j;
  },
  async put(url, body) {
    const r = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Erro na requisição');
    return j;
  },
  async patch(url, body) {
    const r = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Erro na requisição');
    return j;
  },
  async del(url) {
    const r = await fetch(url, { method: 'DELETE' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Erro na requisição');
    return j;
  }
};

window.money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

window.padNum = (n, qty) => String(n).padStart(String(qty).length, '0');

window.formatDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

window.escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

window.applyVisual = (vis) => {
  if (!vis) return;
  const map = {
    '--c-primary': vis.primary_color,
    '--c-secondary': vis.secondary_color,
    '--c-accent': vis.accent_color,
    '--c-bg': vis.bg_color,
    '--c-text': vis.text_color
  };
  Object.entries(map).forEach(([k, v]) => {
    if (v) document.documentElement.style.setProperty(k, v);
  });
};

window.qrDataUrl = async (text) => {
  const j = await API.get('/api/qr?text=' + encodeURIComponent(text));
  return j.dataUrl;
};

window.copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (x) {}
    document.body.removeChild(ta);
    return true;
  }
};

window.maskCPF = (s) => {
  s = String(s || '').replace(/\D/g, '');
  if (s.length === 11) return '***.' + s.slice(3, 6) + '.' + s.slice(6, 9) + '-**';
  return '***-**';
};
