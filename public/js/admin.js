let TOKEN = localStorage.getItem('rifa_token') || '';
let USER = null;
let currentRifaId = null;

const $ = id => document.getElementById(id);
const $$ = s => document.querySelectorAll(s);

function headers() {
  return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN };
}
async function api(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Erro na requisição');
  return j;
}
const apiGet = url => api('GET', url);
const apiPost = (url, b) => api('POST', url, b);
const apiPut = (url, b) => api('PUT', url, b);
const apiPatch = (url, b) => api('PATCH', url, b);
const apiDel = url => api('DELETE', url);

/* ---------- Auth ---------- */
async function init() {
  if (!TOKEN) return;
  try {
    const j = await apiGet('/api/admin/me');
    USER = j.user;
    showShell();
  } catch (e) {
    localStorage.removeItem('rifa_token');
  }
}

async function doLogin() {
  const email = $('loginEmail').value.trim();
  const pass = $('loginPass').value;
  $('loginErr').classList.add('hidden');
  if (!email || !pass) { $('loginErr').textContent = 'Preencha e-mail e senha.'; $('loginErr').classList.remove('hidden'); return; }
  try {
    const j = await API.post('/api/admin/login', { email, password: pass });
    TOKEN = j.token;
    localStorage.setItem('rifa_token', TOKEN);
    USER = j.user;
    showShell();
    go('dashboard');
  } catch (e) {
    $('loginErr').textContent = e.message;
    $('loginErr').classList.remove('hidden');
  }
}

function showShell() {
  $('loginScreen').style.display = 'none';
  $('adminShell').classList.add('show');
  $('userName').textContent = USER.name;
  $('userRole').textContent = USER.role.replace('_', ' ');
  if (USER.role !== 'super_admin') {
    $$('.admin-only').forEach(b => b.style.display = 'none');
  }
  go('dashboard');
}

function doLogout() {
  TOKEN = '';
  localStorage.removeItem('rifa_token');
  location.reload();
}

function go(view, param) {
  if (view === 'rifa' && param) { currentRifaId = param; viewRifa(param); return; }
  currentRifaId = null;
  $$('.sidebar nav button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  const titles = { dashboard: 'Dashboard', rifas: 'Rifas', relatorios: 'Relatórios', usuarios: 'Usuários', config: 'Configurações', logs: 'Logs' };
  $('pageTitle').textContent = titles[view] || 'Painel';
  if (view === 'dashboard') viewDashboard();
  else if (view === 'rifas') viewRifas();
  else if (view === 'relatorios') viewRelatorios();
  else if (view === 'usuarios') viewUsuarios();
  else if (view === 'config') viewConfig();
  else if (view === 'logs') viewLogs();
  window.scrollTo(0, 0);
}

/* ---------- Toast / Modal ---------- */
let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.style.display = 'none', 3200);
}
function showModal(html, wide) {
  $('modalRoot').innerHTML = `<div class="modal-overlay" onclick="if(event.target===this)closeModal()"><div class="modal ${wide ? 'wide' : ''}">${html}</div></div>`;
}
function closeModal() { $('modalRoot').innerHTML = ''; }

function readFileAsDataURL(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}
async function uploadImage(file, folder) {
  const data = await readFileAsDataURL(file);
  const j = await apiPost('/api/admin/upload', { data, folder });
  return j.path;
}

function esc(s) { return escapeHtml(s); }

/* ================= DASHBOARD ================= */
async function viewDashboard() {
  const d = await apiGet('/api/admin/dashboard');
  const c = d.cards;
  $('content').innerHTML = `
    <div class="cards-grid">
      <div class="stat-card"><div class="icon">🎟️</div><div class="label">RIFAS ATIVAS</div><div class="value">${c.rifas_ativas}</div></div>
      <div class="stat-card"><div class="icon">✅</div><div class="label">NÚMEROS VENDIDOS</div><div class="value">${c.numeros_vendidos}</div></div>
      <div class="stat-card"><div class="icon">📋</div><div class="label">NÚMEROS DISPONÍVEIS</div><div class="value">${c.numeros_disponiveis}</div></div>
      <div class="stat-card"><div class="icon">👥</div><div class="label">PARTICIPAÇÕES</div><div class="value">${c.participacoes}</div></div>
      <div class="stat-card"><div class="icon">💰</div><div class="label">VALOR ARRECADADO</div><div class="value">${money(c.valor_arrecadado)}</div></div>
      <div class="stat-card"><div class="icon">📈</div><div class="label">PERCENTUAL VENDIDO</div><div class="value">${c.percentual_vendido}%</div></div>
    </div>

    <div class="panel">
      <div class="head"><h3>Vendas por dia</h3></div>
      <canvas id="salesChart" height="220" style="width:100%"></canvas>
    </div>

    <div class="panel">
      <div class="head"><h3>Campanhas</h3></div>
      <table class="tbl">
        <thead><tr><th>Rifa</th><th>Status</th><th>Vendidos</th><th>Disponíveis</th><th>Reservados</th><th>Arrecadado</th><th>Potencial</th><th></th></tr></thead>
        <tbody>
          ${d.perRifa.map(r => `<tr>
            <td><b>${esc(r.name)}</b><br><small style="color:#999">/${r.slug}</small></td>
            <td><span class="chip ${r.status}">${r.status}</span></td>
            <td>${r.sold}</td><td>${r.available}</td><td>${r.reserved}</td>
            <td><b>${money(r.revenue)}</b></td><td>${money(r.potential)}</td>
            <td><button class="btn sm outline" onclick="go('rifa',${r.id})">Abrir</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <div class="grid2" style="grid-template-columns:1fr 1fr">
      <div class="panel">
        <div class="head"><h3>Últimas participações</h3></div>
        <table class="tbl">
          <thead><tr><th>Pedido</th><th>Participante</th><th>Status</th><th>Total</th></tr></thead>
          <tbody>${d.recentOrders.map(o => `<tr><td>${esc(o.code)}</td><td>${esc(o.participant_name)}</td><td><span class="chip ${o.status}">${o.status}</span></td><td>${money(o.total)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
      <div class="panel">
        <div class="head"><h3>Atividade recente</h3></div>
        <table class="tbl">
          <thead><tr><th>Ação</th><th>Detalhe</th><th>Quando</th></tr></thead>
          <tbody>${d.recentLogs.map(l => `<tr><td>${esc(l.action)}</td><td style="font-size:12px;color:#666">${esc((l.details||'').slice(0,80))}</td><td style="white-space:nowrap">${esc(l.created_at)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`;

  drawBarChart($('salesChart'), d.salesByDay.map(s => ({ label: s.day.slice(5), value: s.c })));
}

function drawBarChart(canvas, data) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 800;
  const H = 220;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);
  if (!data.length) {
    ctx.fillStyle = '#999'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Ainda não há vendas', W / 2, H / 2);
    return;
  }
  const max = Math.max(...data.map(d => d.value), 1);
  const bw = W / data.length;
  const pad = 8;
  ctx.textAlign = 'center';
  data.forEach((d, i) => {
    const bh = (d.value / max) * (H - 40);
    const x = i * bw + pad;
    const y = H - 20 - bh;
    ctx.fillStyle = '#6A1E2C';
    ctx.fillRect(x, y, bw - pad * 2, bh);
    ctx.fillStyle = '#666'; ctx.font = '10px sans-serif';
    ctx.fillText(String(d.value), x + (bw - pad * 2) / 2, y - 4);
    ctx.fillText(d.label, x + (bw - pad * 2) / 2, H - 6);
  });
}

/* ================= RIFAS ================= */
async function viewRifas() {
  const rifas = await apiGet('/api/admin/rifas');
  $('content').innerHTML = `
    <div class="panel">
      <div class="head"><h3>Todas as rifas</h3><div class="right"><button class="btn primary" onclick="openNewRifa()">+ Nova rifa</button></div></div>
      <table class="tbl">
        <thead><tr><th>Rifa</th><th>Causa</th><th>Prêmio</th><th>Preço</th><th>Vendidos</th><th>Status</th><th>Sorteio</th><th></th></tr></thead>
        <tbody>
          ${rifas.map(r => `<tr>
            <td><b>${esc(r.name)}</b><br><small style="color:#999">/${r.slug}</small></td>
            <td>${esc(r.cause_name || '—')}</td>
            <td>${esc(r.prize_name || '—')}</td>
            <td>${money(r.price)}</td>
            <td>${r.stats ? r.stats.paid + '/' + r.qty : '—'}</td>
            <td><span class="chip ${r.status}">${r.status}</span></td>
            <td>${esc(r.draw_date || '—')}</td>
            <td>
              <a class="btn sm outline" href="/r/${r.slug}" target="_blank">Ver</a>
              <button class="btn sm outline" onclick="go('rifa',${r.id})">Gerenciar</button>
            </td>
          </tr>`).join('') || '<tr><td colspan="8"><div class="empty">Nenhuma rifa criada ainda</div></td></tr>'}
        </tbody>
      </table>
    </div>`;
}

async function openNewRifa() {
  const d = await apiGet('/api/admin/settings');
  const defaultColors = { primary: d.primary_color || '#6A1E2C', secondary: d.secondary_color || '#F7F6F3', accent: d.accent_color || '#C6A86B', bg: d.bg_color || '#FFFFFF', text: d.text_color || '#1F2933' };
  wizardState = {
    step: 1, id: null,
    name: '', slug: '', status: 'draft', reserve_minutes: Number(d.reserve_minutes) || 10,
    cause_name: '', cause_title: '', cause_subtitle: '', cause_short: '', cause_long: '',
    cause_objective: '', cause_benefited: '', cause_use_of_resources: '',
    org_name: d.org_name || '', org_site: '', org_instagram: '', org_whatsapp: d.whatsapp_default || '', org_email: d.email_default || '',
    prize_name: '', prize_desc: '', prize_image: '',
    price: 10, qty: 100, packages: [{ qty: 1, price: 10 }, { qty: 5, price: 45 }, { qty: 10, price: 80 }],
    start_date: '', end_date: '', draw_date: '', draw_location: '',
    rules: '', responsible: '', contact: d.whatsapp_default || '',
    visual: defaultColors
  };
  renderWizard();
}

let wizardState = null;

function renderWizard() {
  const s = wizardState;
  const steps = ['Causa', 'Identidade', 'Prêmio', 'Números', 'Valores', 'Datas', 'Regulamento', 'Publicação'];
  const v = s.visual;
  const pads = s.packages || [];
  showModal(`
    <div class="modal wide">
      <div class="modal-head"><h3>${s.id ? 'Editar rifa: ' + esc(s.name) : 'Nova rifa'}</h3><button onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <div class="wizard-steps">${steps.map((st, i) => `<div class="wstep ${i + 1 === s.step ? 'active' : i + 1 < s.step ? 'done' : ''}">${i + 1}. ${st}</div>`).join('')}</div>
        ${wizardStepHtml(s)}
      </div>
    </div>`, true);
}

function wizardStepHtml(s) {
  const step = s.step;
  if (step === 1) return `
    <h3 class="mb">Etapa 1 · Informações da causa</h3>
    <div class="grid2">
      <div class="field full"><label>Nome da causa *</label><input id="wCauseName" value="${esc(s.cause_name)}" placeholder="Ex: Programa Horizonte Mulher"></div>
      <div class="field full"><label>Título</label><input id="wCauseTitle" value="${esc(s.cause_title)}" placeholder="Ajude o Instituto a ampliar o programa"></div>
      <div class="field full"><label>Subtítulo</label><input id="wCauseSub" value="${esc(s.cause_subtitle)}" placeholder="Sua participação pode transformar vidas"></div>
      <div class="field full"><label>Descrição curta</label><textarea id="wCauseShort">${esc(s.cause_short)}</textarea></div>
      <div class="field full"><label>Descrição completa</label><textarea id="wCauseLong" style="min-height:140px">${esc(s.cause_long)}</textarea></div>
      <div class="field full"><label>Objetivo da campanha</label><textarea id="wCauseObj">${esc(s.cause_objective)}</textarea></div>
      <div class="field"><label>Quem será beneficiado</label><textarea id="wCauseBen">${esc(s.cause_benefited)}</textarea></div>
      <div class="field"><label>Como os recursos serão utilizados</label><textarea id="wCauseUse">${esc(s.cause_use_of_resources)}</textarea></div>
      <div class="field"><label>Instituição responsável</label><input id="wOrgName" value="${esc(s.org_name)}"></div>
      <div class="field"><label>Site</label><input id="wOrgSite" value="${esc(s.org_site)}"></div>
      <div class="field"><label>Instagram</label><input id="wOrgIg" value="${esc(s.org_instagram)}"></div>
      <div class="field"><label>WhatsApp</label><input id="wOrgWa" value="${esc(s.org_whatsapp)}"></div>
      <div class="field"><label>E-mail</label><input id="wOrgEmail" value="${esc(s.org_email)}"></div>
    </div>
    <div class="flex mt"><button class="btn primary" onclick="wizardNext()">Continuar →</button></div>`;

  if (step === 2) return `
    <h3 class="mb">Etapa 2 · Identidade visual</h3>
    <div class="grid2">
      <div>
        ${wizardColorField('primary', 'Cor principal', v.primary_color)}
        ${wizardColorField('secondary', 'Cor secundária', v.secondary_color)}
        ${wizardColorField('accent', 'Cor de destaque', v.accent_color)}
        ${wizardColorField('bg', 'Cor de fundo', v.bg_color)}
        ${wizardColorField('text', 'Cor dos textos', v.text_color)}
        <div class="field mt"><label>Logo da campanha</label>${logoUploadBox('wLogoC', v.logo_campaign, 'campaign')}</div>
        <div class="field"><label>Logo da instituição</label>${logoUploadBox('wLogoO', v.logo_org, 'org')}</div>
      </div>
      <div>
        <div class="vis-preview" id="visPreview">
          <div class="vp-head" style="background:${v.primary_color};color:#fff">
            <b>${esc(s.cause_name || 'Nome da campanha')}</b>
          </div>
          <div class="vp-hero" style="background:${v.secondary_color}">
            ${v.logo_campaign ? '<img src="' + v.logo_campaign + '">' : '<div style="font-size:40px;opacity:.4">[LOGO]</div>'}
            <div style="font-weight:800;font-size:18px;color:${v.text_color}">${esc(s.name || 'Nome da rifa')}</div>
            <div style="font-size:13px;color:${v.text_color};opacity:.7">Participe e ajude essa causa</div>
            <div style="font-weight:800;font-size:22px;margin-top:8px;color:${v.primary_color}">${money(s.price)}</div>
            <span class="vp-btn" style="background:${v.accent};color:#222">PARTICIPAR AGORA</span>
          </div>
          <div style="background:${v.bg_color};padding:10px;font-size:11px;color:${v.text_color}">Preview em tempo real da página pública</div>
        </div>
      </div>
    </div>
    <div class="flex mt"><button class="btn outline" onclick="wizardBack()">← Voltar</button><button class="btn primary" onclick="wizardNext()">Continuar →</button></div>`;

  if (step === 3) return `
    <h3 class="mb">Etapa 3 · Prêmio</h3>
    <div class="grid2">
      <div class="field full"><label>Nome do prêmio *</label><input id="wPrizeName" value="${esc(s.prize_name)}" placeholder="Ex: TV 50 polegadas 4K"></div>
      <div class="field full"><label>Descrição do prêmio</label><textarea id="wPrizeDesc">${esc(s.prize_desc)}</textarea></div>
      <div class="field full"><label>Imagem do prêmio</label>${imageUploadBox('wPrizeImg', s.prize_image, 'prizes', 'Escolher imagem do prêmio')}</div>
    </div>
    <div class="flex mt"><button class="btn outline" onclick="wizardBack()">← Voltar</button><button class="btn primary" onclick="wizardNext()">Continuar →</button></div>`;

  if (step === 4) return `
    <h3 class="mb">Etapa 4 · Quantidade de números</h3>
    <div class="flex mb" style="gap:8px">
      ${[50, 100, 200, 300].map(q => `<button class="btn ${s.qty === q ? 'primary' : 'outline'}" onclick="setWizardQty(${q})">${q}</button>`).join('')}
    </div>
    <div class="field"><label>Quantidade personalizada</label><input id="wQty" type="number" min="1" value="${s.qty}" onchange="wizardState.qty=Number(this.value)||100"></div>
    <p class="hint">Os números serão gerados automaticamente de 001 até ${s.qty}. Enquanto a rifa estiver em rascunho você pode alterar livremente. Após vendas, não será possível reduzir abaixo dos números já utilizados.</p>
    <div class="flex mt"><button class="btn outline" onclick="wizardBack()">← Voltar</button><button class="btn primary" onclick="wizardNext()">Continuar →</button></div>`;

  if (step === 5) return `
    <h3 class="mb">Etapa 5 · Valores</h3>
    <div class="grid2">
      <div class="field"><label>Valor por número (R$)</label><input id="wPrice" type="number" step="0.01" min="0" value="${s.price}" onchange="wizardState.price=Number(this.value)||0;wizardState.visual=v;refreshWizardPrice()"></div>
      <div class="field"><label>Valor potencial</label><div class="notice" id="wPotential">${money((s.qty || 100) * (s.price || 0))}</div></div>
    </div>
    <h4 class="mt mb">Pacotes promocionais</h4>
    <div id="wPackList">
      ${pads.map((p, i) => `<div class="flex mb" style="gap:8px">
        <input type="number" min="1" value="${p.qty}" style="width:90px;padding:10px;border:1px solid var(--line);border-radius:8px" placeholder="Qtd" onchange="wizardState.packages[${i}].qty=Number(this.value)||0">
        <input type="number" min="0" step="0.01" value="${p.price}" style="width:110px;padding:10px;border:1px solid var(--line);border-radius:8px" placeholder="Preço" onchange="wizardState.packages[${i}].price=Number(this.value)||0">
        <button class="btn danger sm" onclick="removePack(${i})">Remover</button>
      </div>`).join('')}
    </div>
    <button class="btn outline sm" onclick="addPack()">+ Adicionar pacote</button>
    <div class="flex mt"><button class="btn outline" onclick="wizardBack()">← Voltar</button><button class="btn primary" onclick="wizardNext()">Continuar →</button></div>`;

  if (step === 6) return `
    <h3 class="mb">Etapa 6 · Datas e organização</h3>
    <div class="grid2">
      <div class="field"><label>Início da campanha</label><input id="wStart" type="date" value="${esc(s.start_date)}" onchange="wizardState.start_date=this.value"></div>
      <div class="field"><label>Encerramento</label><input id="wEnd" type="date" value="${esc(s.end_date)}" onchange="wizardState.end_date=this.value"></div>
      <div class="field"><label>Data do sorteio *</label><input id="wDrawDate" type="date" value="${esc(s.draw_date)}" onchange="wizardState.draw_date=this.value"></div>
      <div class="field"><label>Local do sorteio</label><input id="wDrawLoc" value="${esc(s.draw_location)}" onchange="wizardState.draw_location=this.value" placeholder="Auditório do instituto"></div>
      <div class="field"><label>Responsável pela campanha</label><input id="wResp" value="${esc(s.responsible)}" onchange="wizardState.responsible=this.value"></div>
      <div class="field"><label>Contato</label><input id="wContact" value="${esc(s.contact)}" onchange="wizardState.contact=this.value"></div>
      <div class="field"><label>Tempo de reserva (minutos)</label><input id="wReserve" type="number" min="1" value="${s.reserve_minutes}" onchange="wizardState.reserve_minutes=Number(this.value)||10"></div>
    </div>
    <div class="flex mt"><button class="btn outline" onclick="wizardBack()">← Voltar</button><button class="btn primary" onclick="wizardNext()">Continuar →</button></div>`;

  if (step === 7) return `
    <h3 class="mb">Etapa 7 · Regulamento</h3>
    <div class="grid2">
      <div class="field full"><label>Regulamento da rifa</label><textarea id="wRules" style="min-height:220px">${esc(s.rules)}</textarea></div>
      <div class="field full"><label>Nome da rifa *</label><input id="wName" value="${esc(s.name)}" onchange="wizardState.name=this.value"></div>
      <div class="field full"><label>Slug (link público)</label><input id="wSlug" value="${esc(s.slug)}" placeholder="nome-da-rifa" onchange="wizardState.slug=this.value"></div>
    </div>
    <div class="flex mt"><button class="btn outline" onclick="wizardBack()">← Voltar</button><button class="btn primary" onclick="wizardNext()">Continuar →</button></div>`;

  if (step === 8) return `
    <h3 class="mb">Etapa 8 · Publicação</h3>
    ${s.id ? `
      <div class="notice mb">Rifa criada! Link público: <b>/r/${esc(s.slug)}</b></div>
      <div class="flex">
        <a class="btn outline" href="/r/${esc(s.slug)}" target="_blank">Ver página pública</a>
        <button class="btn outline" onclick="generateArt()">Gerar arte de divulgação</button>
        <button class="btn primary" onclick="closeModal();go('rifa',${s.id})">Abrir no painel</button>
      </div>` : `
      <p class="mb">Revise as informações e publique sua rifa. Você poderá editar tudo depois, inclusive a identidade visual e o regulamento.</p>
      <div class="flex">
        <button class="btn outline" onclick="wizardBack()">← Voltar</button>
        <button class="btn primary" onclick="saveWizard('draft')">Salvar rascunho</button>
        <button class="btn accent" onclick="saveWizard('active')">🚀 Publicar rifa</button>
      </div>`}`;

  return '';
}

function wizardColorField(key, label, value) {
  return `<div class="color-row">
    <label>${label}</label>
    <input type="color" value="${value}" oninput="wizardState.visual.${key}=this.value;document.getElementById('wCol${key}').value=this.value;refreshWizardPreview()">
    <input type="text" id="wCol${key}" value="${value}" oninput="wizardState.visual.${key}=this.value;document.querySelector('.color-row input[type=color]').value=this.value;refreshWizardPreview()">
  </div>`;
}

function logoUploadBox(id, val, folder) {
  return `<div class="upload-box" onclick="document.getElementById('${id}Input').click()">
    <img id="${id}Img" src="${val || '/img/logo-default.png'}" style="max-height:70px">
    <input type="file" id="${id}Input" accept="image/*" style="display:none" onchange="wizardUploadLogo(event,'${id}','${folder}')">
    <div style="font-size:12px;color:var(--muted)">Clique para enviar ou substituir</div>
    ${val ? '<button class="btn danger sm mt" onclick="event.stopPropagation();wizardState.visual.' + (folder === 'campaign' ? 'logo_campaign' : 'logo_org') + '=\'\';refreshWizard()">Remover</button>' : ''}
  </div>`;
}

function imageUploadBox(id, val, folder, label) {
  return `<div class="upload-box" onclick="document.getElementById('${id}Input').click()">
    ${val ? '<img id="' + id + 'Img" src="' + val + '" style="max-height:120px">' : '<div style="font-size:30px;opacity:.4">📷</div>'}
    <input type="file" id="${id}Input" accept="image/*" style="display:none" onchange="wizardUploadImage(event,'${id}','${folder}')">
    <div style="font-size:12px;color:var(--muted)">${label || 'Clique para escolher'}</div>
  </div>`;
}

async function wizardUploadLogo(e, id, folder) {
  const file = e.target.files[0];
  if (!file) return;
  const path = await uploadImage(file, 'logos');
  wizardState.visual[folder === 'campaign' ? 'logo_campaign' : 'logo_org'] = path;
  refreshWizard();
}

async function wizardUploadImage(e, id, folder) {
  const file = e.target.files[0];
  if (!file) return;
  const path = await uploadImage(file, folder);
  if (id === 'wPrizeImg') wizardState.prize_image = path;
  refreshWizard();
}

function setWizardQty(q) { wizardState.qty = q; refreshWizard(); }
function addPack() { wizardState.packages.push({ qty: 1, price: wizardState.price || 10 }); refreshWizard(); }
function removePack(i) { wizardState.packages.splice(i, 1); refreshWizard(); }
function refreshWizardPrice() {
  const p = $('wPotential');
  if (p) p.textContent = money((wizardState.qty || 100) * (wizardState.price || 0));
}
function refreshWizard() { renderWizard(); }
function refreshWizardPreview() {
  const v = wizardState.visual;
  const pv = $('visPreview');
  if (!pv) return;
  pv.innerHTML = `
    <div class="vp-head" style="background:${v.primary_color};color:#fff"><b>${esc(wizardState.cause_name || 'Nome da campanha')}</b></div>
    <div class="vp-hero" style="background:${v.secondary_color}">
      ${v.logo_campaign ? '<img src="' + v.logo_campaign + '">' : '<div style="font-size:40px;opacity:.4">[LOGO]</div>'}
      <div style="font-weight:800;font-size:18px;color:${v.text_color}">${esc(wizardState.name || 'Nome da rifa')}</div>
      <div style="font-size:13px;color:${v.text_color};opacity:.7">Participe e ajude essa causa</div>
      <div style="font-weight:800;font-size:22px;margin-top:8px;color:${v.primary_color}">${money(wizardState.price)}</div>
      <span class="vp-btn" style="background:${v.accent};color:#222">PARTICIPAR AGORA</span>
    </div>
    <div style="background:${v.bg_color};padding:10px;font-size:11px;color:${v.text_color}">Preview em tempo real da página pública</div>`;
}
function wizardBack() { wizardState.step--; renderWizard(); }
function wizardNext() {
  const s = wizardState;
  if (s.step === 1) {
    s.cause_name = $('wCauseName').value; s.cause_title = $('wCauseTitle').value; s.cause_subtitle = $('wCauseSub').value;
    s.cause_short = $('wCauseShort').value; s.cause_long = $('wCauseLong').value; s.cause_objective = $('wCauseObj').value;
    s.cause_benefited = $('wCauseBen').value; s.cause_use_of_resources = $('wCauseUse').value;
    s.org_name = $('wOrgName').value; s.org_site = $('wOrgSite').value; s.org_instagram = $('wOrgIg').value;
    s.org_whatsapp = $('wOrgWa').value; s.org_email = $('wOrgEmail').value;
    if (!s.cause_name) { toast('Informe o nome da causa'); return; }
  }
  if (s.step === 3) {
    s.prize_name = $('wPrizeName').value; s.prize_desc = $('wPrizeDesc').value;
    if (!s.prize_name) { toast('Informe o nome do prêmio'); return; }
  }
  if (s.step === 6) {
    s.start_date = $('wStart').value; s.end_date = $('wEnd').value; s.draw_date = $('wDrawDate').value;
    s.draw_location = $('wDrawLoc').value; s.responsible = $('wResp').value; s.contact = $('wContact').value;
    s.reserve_minutes = Number($('wReserve').value) || 10;
  }
  if (s.step === 7) {
    s.rules = $('wRules').value; s.name = $('wName').value; s.slug = $('wSlug').value;
    if (!s.name) { toast('Informe o nome da rifa'); return; }
  }
  s.step++;
  renderWizard();
}

async function saveWizard(status) {
  const s = wizardState;
  if (!s.name) { toast('Informe o nome da rifa'); return; }
  const body = { ...s, status };
  delete body.visual;
  try {
    let rifa;
    if (s.id) {
      rifa = await apiPut('/api/admin/rifas/' + s.id, body);
    } else {
      rifa = await apiPost('/api/admin/rifas', body);
      wizardState.id = rifa.id;
    }
    await apiPut('/api/admin/rifas/' + rifa.id + '/visual', s.visual);
    toast('Rifa salva com sucesso!');
    wizardState.step = 8;
    renderWizard();
  } catch (e) {
    toast(e.message);
  }
}

/* ================= RIFA DETAIL ================= */
let rifaTabs = {};

async function viewRifa(id) {
  $('pageTitle').textContent = 'Gerenciar rifa';
  const d = await apiGet('/api/admin/rifas/' + id + '/dashboard');
  const r = d.rifa;
  const url = location.origin + '/r/' + r.slug;
  $('content').innerHTML = `
    <div class="panel">
      <div class="head">
        <div style="display:flex;align-items:center;gap:12px">
          ${r.visual.logo_main || r.visual.logo_org ? '<img class="logo-preview" src="' + (r.visual.logo_main || r.visual.logo_org) + '">' : ''}
          <div>
            <h3 style="margin-bottom:0">${esc(r.name)}</h3>
            <small style="color:#999">/${r.slug} · Causa: ${esc(r.cause_name)}</small>
          </div>
        </div>
        <div class="right">
          <span class="chip ${r.status}">${r.status}</span>
          <a class="btn sm outline" href="${url}" target="_blank">Ver página</a>
          <button class="btn sm primary" onclick="viewRifaTab(${id},'geral')">Editar</button>
        </div>
      </div>
    </div>

    <div class="cards-grid">
      <div class="stat-card"><div class="label">VENDIDOS</div><div class="value">${d.stats.paid}</div></div>
      <div class="stat-card"><div class="label">DISPONÍVEIS</div><div class="value">${d.stats.available}</div></div>
      <div class="stat-card"><div class="label">RESERVADOS</div><div class="value">${d.stats.reserved}</div></div>
      <div class="stat-card"><div class="label">ARRECADADO</div><div class="value">${money(d.revenue)}</div></div>
      <div class="stat-card"><div class="label">POTENCIAL</div><div class="value">${money(d.potential)}</div></div>
      <div class="stat-card"><div class="label">% VENDIDO</div><div class="value">${d.percent}%</div></div>
    </div>

    <div class="panel">
      <div class="head"><h3>Participantes</h3><div class="right">${d.participants} participante(s)</div></div>
      <canvas id="rifaChart" height="180" style="width:100%"></canvas>
    </div>

    <div class="tabs">
      <button class="tab" data-tab="geral">Geral</button>
      <button class="tab" data-tab="visual">Identidade</button>
      <button class="tab" data-tab="numeros">Números</button>
      <button class="tab" data-tab="pedidos">Pedidos</button>
      <button class="tab" data-tab="participantes">Participantes</button>
      <button class="tab" data-tab="sorteio">Sorteio</button>
      <button class="tab" data-tab="arte">Arte</button>
      <button class="tab" data-tab="compartilhar">Compartilhar</button>
    </div>
    <div id="rifaTabContent"></div>`;

  $$('.tabs .tab').forEach(t => t.addEventListener('click', () => viewRifaTab(id, t.dataset.tab)));
  drawBarChart($('rifaChart'), d.salesByDay.map(s => ({ label: s.day.slice(5), value: s.c })));
  viewRifaTab(id, rifaTabs[id] || 'geral');
}

async function viewRifaTab(id, tab) {
  rifaTabs[id] = tab;
  $$('.tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  const el = $('rifaTabContent');
  if (tab === 'geral') return editRifaForm(id, el);
  if (tab === 'visual') return visualTab(id, el);
  if (tab === 'numeros') return numbersTab(id, el);
  if (tab === 'pedidos') return ordersTab(id, el);
  if (tab === 'participantes') return participantsTab(id, el);
  if (tab === 'sorteio') return drawTab(id, el);
  if (tab === 'arte') return artTab(id, el);
  if (tab === 'compartilhar') return shareTab(id, el);
}

/* ---- Geral (editar rifa) ---- */
async function editRifaForm(id, el) {
  const r = await apiGet('/api/admin/rifas/' + id);
  el.innerHTML = `
    <div class="panel">
      <div class="head"><h3>Dados da rifa</h3></div>
      <div class="grid2">
        <div class="field"><label>Nome da rifa *</label><input id="eName" value="${esc(r.name)}"></div>
        <div class="field"><label>Slug (link)</label><input id="eSlug" value="${esc(r.slug)}"></div>
        <div class="field"><label>Nome da causa</label><input id="eCauseName" value="${esc(r.cause_name)}"></div>
        <div class="field"><label>Título da causa</label><input id="eCauseTitle" value="${esc(r.cause_title)}"></div>
        <div class="field full"><label>Subtítulo</label><input id="eCauseSub" value="${esc(r.cause_subtitle)}"></div>
        <div class="field full"><label>Descrição curta</label><textarea id="eCauseShort">${esc(r.cause_short)}</textarea></div>
        <div class="field full"><label>Descrição completa</label><textarea id="eCauseLong" style="min-height:140px">${esc(r.cause_long)}</textarea></div>
        <div class="field"><label>Objetivo</label><textarea id="eCauseObj">${esc(r.cause_objective)}</textarea></div>
        <div class="field"><label>Beneficiados</label><textarea id="eCauseBen">${esc(r.cause_benefited)}</textarea></div>
        <div class="field"><label>Uso dos recursos</label><textarea id="eCauseUse">${esc(r.cause_use_of_resources)}</textarea></div>
        <div class="field"><label>Instituição</label><input id="eOrgName" value="${esc(r.org_name)}"></div>
        <div class="field"><label>Site</label><input id="eOrgSite" value="${esc(r.org_site)}"></div>
        <div class="field"><label>Instagram</label><input id="eOrgIg" value="${esc(r.org_instagram)}"></div>
        <div class="field"><label>WhatsApp</label><input id="eOrgWa" value="${esc(r.org_whatsapp)}"></div>
        <div class="field"><label>E-mail</label><input id="eOrgEmail" value="${esc(r.org_email)}"></div>
        <div class="field"><label>Prêmio *</label><input id="ePrizeName" value="${esc(r.prize_name)}"></div>
        <div class="field"><label>Descrição do prêmio</label><textarea id="ePrizeDesc">${esc(r.prize_desc)}</textarea></div>
        <div class="field"><label>Valor por número (R$)</label><input id="ePrice" type="number" step="0.01" value="${r.price}"></div>
        <div class="field"><label>Quantidade</label><input id="eQty" type="number" min="1" value="${r.qty}"></div>
        <div class="field"><label>Status</label><select id="eStatus">
          <option value="draft" ${r.status === 'draft' ? 'selected' : ''}>Rascunho</option>
          <option value="active" ${r.status === 'active' ? 'selected' : ''}>Ativa</option>
          <option value="finished" ${r.status === 'finished' ? 'selected' : ''}>Finalizada</option>
          <option value="cancelled" ${r.status === 'cancelled' ? 'selected' : ''}>Cancelada</option>
        </select></div>
        <div class="field"><label>Início</label><input id="eStart" type="date" value="${esc(r.start_date)}"></div>
        <div class="field"><label>Encerramento</label><input id="eEnd" type="date" value="${esc(r.end_date)}"></div>
        <div class="field"><label>Data do sorteio</label><input id="eDrawDate" type="date" value="${esc(r.draw_date)}"></div>
        <div class="field"><label>Local do sorteio</label><input id="eDrawLoc" value="${esc(r.draw_location)}"></div>
        <div class="field"><label>Responsável</label><input id="eResp" value="${esc(r.responsible)}"></div>
        <div class="field"><label>Contato</label><input id="eContact" value="${esc(r.contact)}"></div>
        <div class="field"><label>Tempo de reserva (min)</label><input id="eReserve" type="number" min="1" value="${r.reserve_minutes}"></div>
        <div class="field full"><label>Regulamento</label><textarea id="eRules" style="min-height:160px">${esc(r.rules)}</textarea></div>
        <div class="field full"><label>Imagem do prêmio</label>${imageUploadBox('ePrizeImg', r.prize_image, 'prizes', 'Escolher imagem do prêmio')}</div>
      </div>
      <div class="flex mt">
        <button class="btn primary" onclick="saveRifa(${id})">Salvar alterações</button>
        ${USER.role === 'super_admin' ? '<button class="btn danger" onclick="deleteRifa(' + id + ')">Excluir rifa</button>' : ''}
      </div>
    </div>`;
}

async function saveRifa(id) {
  const g = v => $(v).value;
  const body = {
    name: g('eName'), slug: g('eSlug'), cause_name: g('eCauseName'), cause_title: g('eCauseTitle'),
    cause_subtitle: g('eCauseSub'), cause_short: g('eCauseShort'), cause_long: g('eCauseLong'),
    cause_objective: g('eCauseObj'), cause_benefited: g('eCauseBen'), cause_use_of_resources: g('eCauseUse'),
    org_name: g('eOrgName'), org_site: g('eOrgSite'), org_instagram: g('eOrgIg'), org_whatsapp: g('eOrgWa'), org_email: g('eOrgEmail'),
    prize_name: g('ePrizeName'), prize_desc: g('ePrizeDesc'), prize_image: $('#ePrizeImg') ? ($('#ePrizeImg').src || '') : '',
    price: Number(g('ePrice')), qty: Number(g('eQty')), status: g('eStatus'),
    start_date: g('eStart'), end_date: g('eEnd'), draw_date: g('eDrawDate'), draw_location: g('eDrawLoc'),
    responsible: g('eResp'), contact: g('eContact'), reserve_minutes: Number(g('eReserve')), rules: g('eRules')
  };
  const prizeImg = $('#ePrizeImg');
  if (prizeImg) body.prize_image = prizeImg.src || '';
  try {
    await apiPut('/api/admin/rifas/' + id, body);
    toast('Alterações salvas!');
    viewRifa(id);
  } catch (e) { toast(e.message); }
}

async function deleteRifa(id) {
  if (!confirm('Excluir esta rifa permanentemente?')) return;
  try {
    await apiDel('/api/admin/rifas/' + id);
    toast('Rifa excluída');
    go('rifas');
  } catch (e) { toast(e.message); }
}

/* ---- Identidade visual ---- */
async function visualTab(id, el) {
  const r = await apiGet('/api/admin/rifas/' + id);
  const v = r.visual;
  previewDirty = {
    'vPrimary': v.primary_color || '#6A1E2C',
    'vSecondary': v.secondary_color || '#F7F6F3',
    'vAccent': v.accent_color || '#C6A86B',
    'vBg': v.bg_color || '#FFFFFF',
    'vText': v.text_color || '#1F2933'
  };
  el.innerHTML = `
    <div class="grid2">
      <div class="panel">
        <div class="head"><h3>Cores da campanha</h3></div>
        ${colorField('vPrimary', 'Cor principal', v.primary_color)}
        ${colorField('vSecondary', 'Cor secundária', v.secondary_color)}
        ${colorField('vAccent', 'Cor de destaque', v.accent_color)}
        ${colorField('vBg', 'Cor de fundo', v.bg_color)}
        ${colorField('vText', 'Cor dos textos', v.text_color)}
        <h4 class="mt">Logos</h4>
        <div class="field"><label>Logo principal</label>${adminLogoBox('vLogoMain', v.logo_main, 'logo_main')}</div>
        <div class="field"><label>Logo secundária</label>${adminLogoBox('vLogoSec', v.logo_secondary, 'logo_secondary')}</div>
        <div class="field"><label>Logo da instituição</label>${adminLogoBox('vLogoOrg', v.logo_org, 'logo_org')}</div>
        <div class="field"><label>Logo da campanha</label>${adminLogoBox('vLogoCamp', v.logo_campaign, 'logo_campaign')}</div>
        <button class="btn primary mt" onclick="saveVisual(${id})">Salvar identidade visual</button>
      </div>
      <div class="panel">
        <div class="head"><h3>Prévia em tempo real</h3></div>
        <div class="vis-preview" id="adminPreview">
          ${renderAdminPreview(id)}
        </div>
      </div>
    </div>`;
}

function colorField(key, label, value) {
  return `<div class="color-row">
    <label>${label}</label>
    <input type="color" value="${value}" oninput="liveColor('${key}','${value}')">
    <input type="text" id="cf-${key}" value="${value}" oninput="liveColorText('${key}',this.value)">
  </div>`;
}

let previewDirty = {};
function liveColor(key) {
  const inp = event.target;
  const pair = inp.closest('.color-row').querySelector('input[type=text]');
  pair.value = inp.value;
  previewDirty[key] = inp.value;
  renderAdminPreviewLive();
}
function liveColorText(key, v) {
  previewDirty[key] = v;
  renderAdminPreviewLive();
}

function renderAdminPreview() {
  const v = previewDirty;
  const vis = (d) => d;
  return `
    <div style="background:${v['vBg'] || '#fff'};border-radius:12px;overflow:hidden">
      <div style="background:${v['vPrimary'] || '#6A1E2C'};color:#fff;padding:12px 16px;display:flex;align-items:center;justify-content:space-between">
        <b>Nome da rifa</b><span style="background:${v['vAccent'] || '#C6A86B'};color:#222;padding:4px 12px;border-radius:50px;font-size:12px;font-weight:700">Participar</span>
      </div>
      <div style="background:${v['vSecondary'] || '#F7F6F3'};padding:22px;text-align:center">
        <div style="font-size:40px;opacity:.4">[LOGO]</div>
        <div style="font-weight:800;font-size:17px;color:${v['vText'] || '#1F2933'}">Participe e ajude essa causa</div>
        <div style="font-weight:800;font-size:22px;margin:8px 0;color:${v['vPrimary'] || '#6A1E2C'}">R$ 10,00</div>
        <span style="background:${v['vAccent'] || '#C6A86B'};color:#222;padding:10px 22px;border-radius:50px;font-weight:700;display:inline-block">PARTICIPAR AGORA</span>
      </div>
      <div style="background:${v['vBg'] || '#fff'};padding:10px;font-size:11px;color:${v['vText'] || '#1F2933'}">As cores são aplicadas em toda a experiência</div>
    </div>`;
}

function renderAdminPreviewLive() {
  const pv = $('adminPreview');
  if (pv) pv.innerHTML = renderAdminPreview();
}

function adminLogoBox(key, val, prop) {
  return `<div class="upload-box" onclick="document.getElementById('${key}Inp').click()">
    ${val ? '<img src="' + val + '" style="max-height:60px">' : '<div style="font-size:28px;opacity:.35">🖼️</div>'}
    <input type="file" id="${key}Inp" accept="image/*" style="display:none" onchange="adminUploadLogo(event,'${prop}')">
    <div style="font-size:12px;color:var(--muted)">Enviar / substituir</div>
  </div>`;
}

let visualUploads = {};
async function adminUploadLogo(e, prop) {
  const file = e.target.files[0];
  if (!file) return;
  const path = await uploadImage(file, 'logos');
  visualUploads[prop] = path;
  toast('Logo carregada. Salve a identidade para aplicar.');
}

async function saveVisual(id) {
  const get = key => {
    const el = document.getElementById('cf-' + key);
    if (el && el.value) return el.value;
    return previewDirty[key] || null;
  };
  const body = {
    primary_color: get('vPrimary'),
    secondary_color: get('vSecondary'),
    accent_color: get('vAccent'),
    bg_color: get('vBg'),
    text_color: get('vText'),
    ...visualUploads
  };
  Object.keys(body).forEach(k => { if (body[k] === null || body[k] === undefined) delete body[k]; });
  try {
    await apiPut('/api/admin/rifas/' + id + '/visual', body);
    toast('Identidade visual salva!');
    previewDirty = {};
    visualUploads = {};
    viewRifa(id);
  } catch (e) { toast(e.message); }
}

/* ---- Números ---- */
async function numbersTab(id, el) {
  el.innerHTML = `<div class="panel">
    <div class="head"><h3>Gerenciamento de números</h3></div>
    <div class="flex mb">
      <input id="nSearch" placeholder="Pesquisar número..." style="padding:10px 14px;border:1px solid var(--line);border-radius:8px" oninput="loadAdminNumbers(${id})">
      <select id="nStatus" style="padding:10px 14px;border:1px solid var(--line);border-radius:8px" onchange="loadAdminNumbers(${id})">
        <option value="all">Todos</option>
        <option value="available">Disponíveis</option>
        <option value="reserved">Reservados</option>
        <option value="paid">Pagos</option>
        <option value="blocked">Bloqueados</option>
        <option value="expired">Expirados</option>
      </select>
      <div class="spacer"></div>
      <button class="btn outline sm" onclick="loadAdminNumbers(${id})">Atualizar</button>
    </div>
    <div id="nGrid" class="numgrid">Carregando...</div>
  </div>`;
  loadAdminNumbers(id);
}

let adminNumbersCache = [];
async function loadAdminNumbers(id) {
  const q = $('#nSearch')?.value || '';
  const st = $('#nStatus')?.value || 'all';
  const j = await apiGet(`/api/admin/rifas/${id}/numeros?status=${st}&q=${encodeURIComponent(q)}`);
  adminNumbersCache = j.numbers;
  const grid = $('nGrid');
  if (!grid) return;
  grid.innerHTML = j.numbers.map(n => {
    const extra = [];
    if (n.participant) extra.push(`<div>Participante: ${esc(n.participant)}</div>`);
    if (n.order_code) extra.push(`<div>Pedido: ${esc(n.order_code)} (${esc(n.order_status)})</div>`);
    if (n.sold_at) extra.push(`<div>Compra: ${esc(n.sold_at)}</div>`);
    const hasOpts = n.status === 'available' || n.status === 'blocked';
    return `<div class="ncell ${n.status}" ${hasOpts ? 'onclick="toggleBlock(' + n.id + ')"' : ''} style="cursor:${hasOpts ? 'pointer' : 'default'}">
      ${padNum(n.number, 300)}
      ${extra.length ? `<span class="tt">${extra.join('')}</span>` : ''}
    </div>`;
  }).join('') || '<div class="empty">Nenhum número encontrado</div>';
}

async function toggleBlock(numId) {
  const n = adminNumbersCache.find(x => x.id === numId);
  const action = n.status === 'available' ? 'block' : 'unblock';
  try {
    await apiPatch('/api/admin/numeros/' + numId, { action });
    toast(action === 'block' ? 'Número bloqueado' : 'Número desbloqueado');
    const id = currentRifaId;
    loadAdminNumbers(id);
  } catch (e) { toast(e.message); }
}

/* ---- Pedidos ---- */
async function ordersTab(id, el) {
  el.innerHTML = `<div class="panel"><div class="head"><h3>Pedidos e pagamentos</h3></div><div id="ordersList">Carregando...</div></div>`;
  const orders = await apiGet('/api/admin/rifas/' + id + '/orders');
  const list = $('ordersList');
  list.innerHTML = `<table class="tbl">
    <thead><tr><th>Código</th><th>Participante</th><th>Números</th><th>Total</th><th>Pagamento</th><th>Status</th><th>Ações</th></tr></thead>
    <tbody>
      ${orders.map(o => `<tr>
        <td><b>${esc(o.code)}</b><br><small style="color:#999">${esc(o.created_at)}</small></td>
        <td>${esc(o.participant_name)}<br><small style="color:#999">${o.cpf ? maskCPF(o.cpf) : ''}</small></td>
        <td>${o.numbers.map(n => `<span class="num-chip">${padNum(n.number, 300)}</span>`).join('')}</td>
        <td><b>${money(o.total)}</b>${o.discount ? `<br><small style="color:#059669">desc ${money(o.discount)}</small>` : ''}</td>
        <td>${o.payment ? esc(o.payment.method) + ' · ' + esc(o.payment.status) : '—'}</td>
        <td><span class="chip ${o.status}">${o.status}</span></td>
        <td>
          ${o.status === 'pending' ? `<button class="btn success sm" onclick="confirmOrder(${o.id})">Confirmar pagamento</button>
          <button class="btn danger sm" onclick="cancelOrder(${o.id})">Cancelar</button>` : ''}
          ${o.status === 'approved' ? `<button class="btn outline sm" onclick="showOrderDetail(${o.id})">Ver</button>` : ''}
        </td>
      </tr>`).join('') || '<tr><td colspan="7"><div class="empty">Nenhum pedido</div></td></tr>'}
    </tbody>
  </table>`;
}

async function confirmOrder(oid) {
  if (!confirm('Confirmar pagamento deste pedido?')) return;
  try {
    await apiPost('/api/admin/orders/' + oid + '/confirm', {});
    toast('Pagamento confirmado! Números marcados como pagos.');
    ordersTab(currentRifaId, $('rifaTabContent'));
  } catch (e) { toast(e.message); }
}
async function cancelOrder(oid) {
  if (!confirm('Cancelar pedido? Os números voltarão a ficar disponíveis.')) return;
  try {
    await apiPost('/api/admin/orders/' + oid + '/cancel', {});
    toast('Pedido cancelado.');
    ordersTab(currentRifaId, $('rifaTabContent'));
  } catch (e) { toast(e.message); }
}

async function showOrderDetail(oid) {
  const orders = await apiGet('/api/admin/rifas/' + currentRifaId + '/orders');
  const o = orders.find(x => x.id === oid);
  if (!o) return;
  showModal(`
    <div class="modal-head"><h3>Pedido ${esc(o.code)}</h3><button onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="summary">
        <div class="row"><span>Participante</span><b>${esc(o.participant_name)}</b></div>
        <div class="row"><span>CPF</span><span>${maskCPF(o.cpf)}</span></div>
        <div class="row"><span>WhatsApp</span><span>${esc(o.whatsapp)}</span></div>
        <div class="row"><span>Números</span><span class="nums" style="display:flex;flex-wrap:wrap;gap:4px">${o.numbers.map(n => '<span class="num-chip">' + padNum(n.number, 300) + '</span>').join('')}</span></div>
        <div class="row"><span>Total</span><b>${money(o.total)}</b></div>
        <div class="row"><span>Status</span><span class="chip ${o.status}">${o.status}</span></div>
        <div class="row"><span>Data</span><span>${esc(o.created_at)}</span></div>
      </div>
      <a class="btn primary block mt" href="https://wa.me/${(o.whatsapp||'').replace(/\D/g,'')}" target="_blank">💬 Chamar no WhatsApp</a>
    </div>`, false);
}

/* ---- Participantes ---- */
async function participantsTab(id, el) {
  el.innerHTML = `<div class="panel"><div class="head"><h3>Participantes</h3></div><div id="partsList">Carregando...</div></div>`;
  const parts = await apiGet('/api/admin/rifas/' + id + '/participants');
  $('partsList').innerHTML = `<table class="tbl">
    <thead><tr><th>Nome</th><th>CPF</th><th>WhatsApp</th><th>Cidade/UF</th><th>Números pagos</th><th>Total gasto</th></tr></thead>
    <tbody>${parts.map(p => `<tr>
      <td><b>${esc(p.name)}</b></td>
      <td>${maskCPF(p.cpf)}</td>
      <td>${esc(p.whatsapp)}</td>
      <td>${esc(p.city)}/${esc(p.state)}</td>
      <td>${p.num_paid}</td>
      <td>${money(p.total_spent)}</td>
    </tr>`).join('') || '<tr><td colspan="6"><div class="empty">Nenhum participante</div></td></tr>'}</tbody>
  </table>`;
}

/* ---- Sorteio ---- */
async function drawTab(id, el) {
  const info = await apiGet('/api/admin/rifas/' + id + '/draw-info');
  const r = await apiGet('/api/admin/rifas/' + id);
  const hasDraw = !!(r.draw_id);
  el.innerHTML = `
    <div class="panel draw-panel">
      <div class="head"><h3>Realizar sorteio</h3></div>
      ${hasDraw ? `
        <div class="notice">Este sorteio já foi realizado. Consulte o resultado na página pública.</div>
        <a class="btn outline" href="/resultado/${esc(r.slug)}" target="_blank">Ver resultado</a>` : `
        <div class="cards-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
          <div class="stat-card"><div class="label">NÚMEROS VENDIDOS</div><div class="value">${info.sold}</div></div>
          <div class="stat-card"><div class="label">PARTICIPANTES</div><div class="value">${info.participants}</div></div>
          <div class="stat-card"><div class="label">VALOR ARRECADADO</div><div class="value">${money(info.revenue)}</div></div>
          <div class="stat-card"><div class="label">ELEGÍVEIS</div><div class="value">${info.sold}</div></div>
        </div>
        <p class="hint mb">O sorteio considera somente números com pagamento confirmado. Números disponíveis, reservados, bloqueados ou com pagamento pendente nunca são sorteados.</p>
        <button class="btn primary" onclick="startDrawAnimation(${id})" ${info.sold > 0 ? '' : 'disabled'}>🎰 Sortear agora</button>
        ${info.sold === 0 ? '<p class="mt" style="color:var(--warn);font-size:13px">Venda números antes de realizar o sorteio.</p>' : ''}
      `}
    </div>`;
}

async function startDrawAnimation(id) {
  showModal(`
    <div class="modal-head"><h3>Sorteio</h3></div>
    <div class="modal-body">
      <div class="draw-machine">
        <div style="font-size:13px;letter-spacing:3px;opacity:.7">SORTEANDO NÚMERO</div>
        <div class="reel" id="drawReel">000</div>
        <div style="font-size:12px;opacity:.6">os números estão passando rapidamente...</div>
      </div>
    </div>`, false);
  const r = await apiGet('/api/admin/rifas/' + id);
  const digits = String(r.qty).length;
  const reel = $('drawReel');
  const spinTime = 4500;
  const start = Date.now();
  let finalNum = null;
  await new Promise(resolve => {
    const tick = () => {
      const elapsed = Date.now() - start;
      const rand = Math.floor(Math.random() * r.qty) + 1;
      reel.textContent = String(rand).padStart(digits, '0');
      if (elapsed >= spinTime) {
        const res = confirmDraw(id);
        resolve(res);
      } else {
        setTimeout(tick, elapsed < spinTime * 0.7 ? 30 : 130);
      }
    };
    tick();
  });
}

async function confirmDraw(id) {
  try {
    const j = await apiPost('/api/admin/rifas/' + id + '/sortear', {});
    const r = await apiGet('/api/admin/rifas/' + id);
    const digits = String(r.qty).length;
    const reel = $('drawReel');
    reel.textContent = String(j.draw.number).padStart(digits, '0');
    reel.classList.add('slow');
    setTimeout(() => {
      $('modalRoot').innerHTML = `
        <div class="modal-overlay" style="align-items:center">
          <div class="modal">
            <div class="modal-body winner-reveal center">
              <div style="font-size:14px;letter-spacing:3px;opacity:.6">NÚMERO SORTEADO</div>
              <div class="big">${String(j.draw.number).padStart(digits, '0')}</div>
              <div style="font-size:24px;font-weight:800;margin-top:8px">🏆 ${esc(j.draw.participant_name)}</div>
              <p style="opacity:.6;margin-top:6px">Código do sorteio: ${esc(j.draw.draw_code)}</p>
              <a class="btn primary mt" href="/resultado/${esc(r.slug)}" target="_blank">Ver página de resultado</a>
              <button class="btn outline mt" onclick="closeModal();viewRifaTab(${id},'sorteio')">Concluir</button>
            </div>
          </div>
        </div>`;
      confetti();
    }, 800);
    toast('Sorteio realizado com sucesso!');
  } catch (e) {
    closeModal();
    toast(e.message);
  }
}

function confetti() {
  const c = document.createElement('div');
  c.className = 'confetti';
  document.body.appendChild(c);
  const colors = ['#C6A86B', '#6A1E2C', '#10b981', '#f59e0b', '#3b82f6'];
  for (let i = 0; i < 90; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + 'vw';
    p.style.background = colors[i % colors.length];
    p.style.animationDuration = 2 + Math.random() * 2.5 + 's';
    p.style.animationDelay = Math.random() * 1.2 + 's';
    p.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
    c.appendChild(p);
  }
  setTimeout(() => c.remove(), 5000);
}

/* ---- Arte ---- */
async function artTab(id, el) {
  const r = await apiGet('/api/admin/rifas/' + id);
  const v = r.visual;
  const url = location.origin + '/r/' + r.slug;
  const qr = await API.get('/api/qr?text=' + encodeURIComponent(url));
  el.innerHTML = `
    <div class="panel">
      <div class="head"><h3>Gerador de arte para divulgação</h3>
        <div class="right">
          <select id="artType" onchange="renderArt('${esc(r.slug)}')">
            <option value="square">Instagram Feed / WhatsApp · 1080×1080</option>
            <option value="story">Instagram Story · 1080×1920</option>
          </select>
          <button class="btn primary sm" onclick="downloadArt()">⬇ Baixar imagem</button>
          <button class="btn outline sm" onclick="renderArt('${esc(r.slug)}')">Atualizar</button>
        </div>
      </div>
      <div id="artCanvasWrap" style="text-align:center;background:#eee;border-radius:14px;padding:20px;min-height:300px">Gerando...</div>
    </div>`;
  window._artRifa = r;
  window._artQR = qr.dataUrl;
  setTimeout(() => renderArt(r.slug), 50);
}

async function renderArt(slug) {
  const r = window._artRifa;
  if (!r) return;
  const qr = window._artQR;
  const type = $('#artType')?.value || 'square';
  const W = type === 'story' ? 1080 : 1080;
  const H = type === 'story' ? 1920 : 1080;
  const wrap = $('artCanvasWrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  canvas.id = 'artCanvas';
  wrap.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const v = r.visual;

  const loadImg = src => new Promise(res => {
    if (!src) return res(null);
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
  const logo = await loadImg(v.logo_main || v.logo_org || v.logo_campaign || '');
  const prize = await loadImg(r.prize_image);
  const qrim = await loadImg(qr);

  ctx.fillStyle = v.primary_color || '#6A1E2C';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = v.secondary_color || '#F7F6F3';
  const bandH = type === 'story' ? Math.floor(H * 0.55) : Math.floor(H * 0.42);
  ctx.fillRect(0, Math.floor(H * 0.05), W, bandH);

  ctx.textAlign = 'center';

  let y = type === 'story' ? 220 : 130;
  if (logo) {
    const lh = type === 'story' ? 170 : 130;
    const lw = logo.width * (lh / logo.height);
    ctx.drawImage(logo, (W - lw) / 2, y - lh / 2, lw, lh);
    y += (type === 'story' ? 210 : 160);
  }

  ctx.fillStyle = v.text_color || '#1F2933';
  ctx.font = '800 ' + (type === 'story' ? 84 : 72) + 'px "Segoe UI", Arial, sans-serif';
  ctx.fillText(r.name.toUpperCase(), W / 2, y);
  y += (type === 'story' ? 110 : 100);

  ctx.fillStyle = v.primary_color || '#6A1E2C';
  ctx.font = '700 ' + (type === 'story' ? 48 : 42) + 'px "Segoe UI", Arial, sans-serif';
  ctx.fillText('CONCORRA A', W / 2, y);
  y += (type === 'story' ? 90 : 78);

  if (prize) {
    const ph = type === 'story' ? 420 : 320;
    const pw = prize.width * (ph / prize.height);
    ctx.drawImage(prize, (W - pw) / 2, y, pw, ph);
    y += ph + (type === 'story' ? 40 : 34);
  } else {
    ctx.fillStyle = v.accent_color || '#C6A86B';
    ctx.font = '700 ' + (type === 'story' ? 56 : 48) + 'px "Segoe UI", Arial, sans-serif';
    ctx.fillText(r.prize_name || 'GRANDE PRÊMIO', W / 2, y + (type === 'story' ? 200 : 160));
    y += (type === 'story' ? 420 : 330);
  }

  ctx.fillStyle = v.primary_color || '#6A1E2C';
  ctx.font = '800 ' + (type === 'story' ? 76 : 62) + 'px "Segoe UI", Arial, sans-serif';
  ctx.fillText(money(r.price) + ' POR NÚMERO', W / 2, y);
  y += (type === 'story' ? 120 : 100);

  ctx.fillStyle = v.text_color || '#1F2933';
  ctx.font = '700 ' + (type === 'story' ? 44 : 40) + 'px "Segoe UI", Arial, sans-serif';
  ctx.fillText('PARTICIPE E APOIE', W / 2, y);
  y += (type === 'story' ? 90 : 78);
  ctx.fillStyle = v.primary_color || '#6A1E2C';
  ctx.fillText((r.cause_name || r.org_name || '').toUpperCase(), W / 2, y);
  y += (type === 'story' ? 90 : 78);

  ctx.fillStyle = v.text_color || '#1F2933';
  ctx.font = '700 ' + (type === 'story' ? 46 : 42) + 'px "Segoe UI", Arial, sans-serif';
  ctx.fillText('SORTEIO: ' + formatDate(r.draw_date), W / 2, y);
  y += (type === 'story' ? 120 : 100);

  if (qrim) {
    const qs = type === 'story' ? 220 : 200;
    ctx.drawImage(qrim, (W - qs) / 2, y, qs, qs);
    y += qs + (type === 'story' ? 30 : 26);
    ctx.fillStyle = '#fff';
    ctx.font = '600 28px "Segoe UI", Arial, sans-serif';
    ctx.fillText('/r/' + r.slug, W / 2, y);
  }
}

function downloadArt() {
  const canvas = $('artCanvas');
  if (!canvas) return;
  const a = document.createElement('a');
  a.download = 'arte_' + window._artRifa.slug + '.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
}

/* ---- Compartilhar ---- */
async function shareTab(id, el) {
  const r = await apiGet('/api/admin/rifas/' + id);
  const url = location.origin + '/r/' + r.slug;
  const qr = await API.get('/api/qr?text=' + encodeURIComponent(url));
  const waText = encodeURIComponent('🎟️ ' + r.name + ' — concorra a ' + r.prize_name + ' e ajude ' + r.cause_name + '! Participe: ' + url);
  el.innerHTML = `
    <div class="grid2">
      <div class="panel">
        <div class="head"><h3>Link da rifa</h3></div>
        <input value="${url}" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:8px;font-size:14px" readonly>
        <div class="flex mt">
          <button class="btn primary" onclick="copyArtLink('${url}')">Copiar link</button>
          <a class="btn success" href="https://wa.me/?text=${waText}" target="_blank">Compartilhar no WhatsApp</a>
          <button class="btn outline" onclick="shareArtFB('${url}')">Facebook</button>
          <button class="btn outline" onclick="shareArtIG()">Instagram</button>
        </div>
      </div>
      <div class="panel center">
        <div class="head"><h3>QR Code</h3></div>
        <img src="${qr.dataUrl}" style="width:240px;height:240px;margin:0 auto">
        <div class="flex mt" style="justify-content:center">
          <button class="btn outline" onclick="copyArtLink('${url}')">Copiar link</button>
          <button class="btn primary" onclick="downloadQR('${qr.dataUrl}')">Baixar QR Code</button>
        </div>
      </div>
    </div>`;
}

function copyArtLink(url) {
  copyText(url).then(ok => toast(ok ? 'Link copiado!' : 'Erro ao copiar'));
}
function downloadQR(dataUrl) {
  const a = document.createElement('a');
  a.download = 'qr_' + window._artRifa?.slug || 'qr' + '.png';
  a.href = dataUrl;
  a.click();
}
function shareArtFB(url) {
  window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url), '_blank');
}
function shareArtIG() {
  toast('Baixe a arte no menu "Arte" e publique no seu Instagram com o link da rifa.');
}

/* ================= RELATÓRIOS ================= */
async function viewRelatorios() {
  const rifas = await apiGet('/api/admin/rifas');
  $('content').innerHTML = `
    <div class="panel">
      <div class="head"><h3>Relatórios</h3>
        <div class="right">
          <select id="repRifa" style="padding:10px;border:1px solid var(--line);border-radius:8px">
            <option value="">Todas as rifas</option>
            ${rifas.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="cards-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
        ${[
          ['vendas', 'Relatório de vendas', '📈'],
          ['participantes', 'Relatório de participantes', '👥'],
          ['financeiro', 'Relatório financeiro', '💰'],
          ['pagamentos', 'Relatório de pagamentos', '💳'],
          ['numeros', 'Relatório de números', '🔢'],
          ['reservas', 'Relatório de reservas', '⏳'],
          ['sorteios', 'Relatório de sorteios', '🎰']
        ].map(([t, name, icon]) => `
          <div class="stat-card center" style="cursor:pointer" onclick="exportReport('${t}')">
            <div class="icon">${icon}</div>
            <div class="label">${name}</div>
            <div class="value" style="font-size:16px">Baixar CSV</div>
          </div>`).join('')}
      </div>
      <p class="hint mt">Os relatórios são exportados em CSV (compatível com Excel e Google Sheets).</p>
    </div>`;
}

function exportReport(type) {
  const rid = $('#repRifa')?.value || '';
  const params = [];
  if (rid) params.push('rifa_id=' + rid);
  if (TOKEN) params.push('token=' + encodeURIComponent(TOKEN));
  window.open('/api/admin/reports/' + type + (params.length ? '?' + params.join('&') : ''), '_blank');
}

/* ================= USUÁRIOS ================= */
async function viewUsuarios() {
  const users = await apiGet('/api/admin/users');
  $('content').innerHTML = `
    <div class="panel">
      <div class="head"><h3>Usuários e permissões</h3>
        <div class="right"><button class="btn primary sm" onclick="openNewUser()">+ Novo usuário</button></div>
      </div>
      <table class="tbl">
        <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Ações</th></tr></thead>
        <tbody>${users.map(u => `<tr>
          <td><b>${esc(u.name)}</b>${u.id === USER.id ? ' <small>(você)</small>' : ''}</td>
          <td>${esc(u.email)}</td>
          <td><span class="chip ${u.role === 'super_admin' ? 'active' : 'draft'}">${u.role.replace('_', ' ')}</span></td>
          <td>${u.active ? '<span class="chip active">ativo</span>' : '<span class="chip cancelled">inativo</span>'}</td>
          <td><button class="btn sm outline" onclick="editUser(${u.id})">Editar</button></td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="panel">
      <h3>Perfis de acesso</h3>
      <div class="grid3">
        <div class="stat-card"><div class="label">SUPER ADMIN</div><div style="font-size:13px;color:var(--muted)">Acesso total: usuários, rifas, sorteios, relatórios e configurações</div></div>
        <div class="stat-card"><div class="label">ADMIN</div><div style="font-size:13px;color:var(--muted)">Gerencia rifas, vendas, sorteios e relatórios</div></div>
        <div class="stat-card"><div class="label">OPERADOR</div><div style="font-size:13px;color:var(--muted)">Acompanha painel, números e pedidos</div></div>
      </div>
    </div>`;
}

function openNewUser() {
  showModal(`
    <div class="modal-head"><h3>Novo usuário</h3><button onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="field mb"><label>Nome</label><input id="uName"></div>
      <div class="field mb"><label>E-mail</label><input id="uEmail" type="email"></div>
      <div class="field mb"><label>Senha (mín. 6 caracteres)</label><input id="uPass" type="password"></div>
      <div class="field mb"><label>Perfil</label><select id="uRole">
        <option value="operator">Operador</option>
        <option value="admin">Admin</option>
        <option value="super_admin">Super Admin</option>
      </select></div>
      <button class="btn primary" onclick="createUser()">Criar usuário</button>
    </div>`);
}
async function createUser() {
  try {
    await apiPost('/api/admin/users', { name: $('#uName').value, email: $('#uEmail').value, password: $('#uPass').value, role: $('#uRole').value });
    toast('Usuário criado!');
    closeModal();
    viewUsuarios();
  } catch (e) { toast(e.message); }
}
function editUser(uid) {
  showModal(`
    <div class="modal-head"><h3>Editar usuário #${uid}</h3><button onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="field mb"><label>Nome</label><input id="eUName"></div>
      <div class="field mb"><label>Nova senha (opcional)</label><input id="eUPass" type="password" placeholder="Deixe em branco para manter"></div>
      <div class="field mb"><label>Perfil</label><select id="eURole">
        <option value="operator">Operador</option>
        <option value="admin">Admin</option>
        <option value="super_admin">Super Admin</option>
      </select></div>
      <div class="field mb"><label>Status</label><select id="eUActive"><option value="1">Ativo</option><option value="0">Inativo</option></select></div>
      <button class="btn primary" onclick="updateUser(${uid})">Salvar</button>
    </div>`);
}
async function updateUser(uid) {
  const body = { name: $('#eUName').value || undefined, role: $('#eURole').value, active: $('#eUActive').value === '1' };
  if ($('#eUPass').value) body.password = $('#eUPass').value;
  try {
    await apiPut('/api/admin/users/' + uid, body);
    toast('Usuário atualizado');
    closeModal();
    viewUsuarios();
  } catch (e) { toast(e.message); }
}

/* ================= CONFIGURAÇÕES ================= */
async function viewConfig() {
  const s = await apiGet('/api/admin/settings');
  $('content').innerHTML = `
    <div class="grid2">
      <div class="panel">
        <div class="head"><h3>Plataforma</h3></div>
        <div class="field mb"><label>Nome da plataforma</label><input id="cPlatform" value="${esc(s.platform_name)}"></div>
        <div class="field mb"><label>WhatsApp padrão</label><input id="cWhats" value="${esc(s.whatsapp_default)}"></div>
        <div class="field mb"><label>E-mail padrão</label><input id="cEmail" value="${esc(s.email_default)}"></div>
        <div class="field mb"><label>Organização</label><input id="cOrg" value="${esc(s.org_name)}"></div>
        <div class="field mb"><label>CNPJ</label><input id="cCnpj" value="${esc(s.org_cnpj)}"></div>
        <div class="field mb"><label>Endereço</label><input id="cAddr" value="${esc(s.org_address)}"></div>
        <div class="field mb"><label>Chave PIX (para pagamentos)</label><input id="cPix" value="${esc(s.pix_key)}"></div>
        <div class="field mb"><label>Tempo padrão de reserva (min)</label><input id="cReserve" type="number" min="1" value="${esc(s.reserve_minutes)}"></div>
      </div>
      <div class="panel">
        <div class="head"><h3>Cores padrão da plataforma</h3></div>
        ${colorField('sPrimary', 'Cor principal', s.primary_color || '#6A1E2C')}
        ${colorField('sSecondary', 'Cor secundária', s.secondary_color || '#F7F6F3')}
        ${colorField('sAccent', 'Cor de destaque', s.accent_color || '#C6A86B')}
        ${colorField('sBg', 'Cor de fundo', s.bg_color || '#FFFFFF')}
        ${colorField('sText', 'Cor dos textos', s.text_color || '#1F2933')}
      </div>
      <div class="panel full">
        <div class="head"><h3>Termos e políticas</h3></div>
        <div class="field mb"><label>Termos de uso</label><textarea id="cTerms" style="min-height:140px">${esc(s.terms)}</textarea></div>
        <div class="field mb"><label>Política de privacidade</label><textarea id="cPrivacy" style="min-height:140px">${esc(s.privacy)}</textarea></div>
      </div>
    </div>
    <button class="btn primary" onclick="saveConfig()">Salvar configurações</button>`;
}

async function saveConfig() {
  const get = key => {
    const el = document.getElementById('cf-' + key);
    if (el && el.value) return el.value;
    return previewDirty[key] || null;
  };
  const body = {
    platform_name: $('#cPlatform').value, whatsapp_default: $('#cWhats').value,
    email_default: $('#cEmail').value, org_name: $('#cOrg').value, org_cnpj: $('#cCnpj').value,
    org_address: $('#cAddr').value, pix_key: $('#cPix').value,
    reserve_minutes: $('#cReserve').value,
    primary_color: get('sPrimary'),
    secondary_color: get('sSecondary'),
    accent_color: get('sAccent'),
    bg_color: get('sBg'),
    text_color: get('sText'),
    terms: $('#cTerms').value, privacy: $('#cPrivacy').value
  };
  Object.keys(body).forEach(k => { if (body[k] === null || body[k] === undefined) delete body[k]; });
  try {
    await apiPut('/api/admin/settings', body);
    toast('Configurações salvas!');
  } catch (e) { toast(e.message); }
}

/* ================= LOGS ================= */
async function viewLogs() {
  const logs = await apiGet('/api/admin/logs');
  $('content').innerHTML = `
    <div class="panel">
      <div class="head"><h3>Registro de ações administrativas</h3></div>
      <table class="tbl">
        <thead><tr><th>Usuário</th><th>Ação</th><th>Detalhes</th><th>Data</th></tr></thead>
        <tbody>${logs.map(l => `<tr>
          <td>#${l.user_id || '—'}</td>
          <td><span class="chip draft">${esc(l.action)}</span></td>
          <td style="font-size:12px;color:#666">${esc((l.details || '').slice(0, 100))}</td>
          <td style="white-space:nowrap">${esc(l.created_at)}</td>
        </tr>`).join('') || '<tr><td colspan="4"><div class="empty">Sem registros</div></td></tr>'}</tbody>
      </table>
    </div>`;
}

/* ---------- init ---------- */
$('loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
init();
