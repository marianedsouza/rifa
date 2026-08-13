const slug = window.location.pathname.split('/').filter(Boolean).pop();
let RIFA = null;
let NUMBERS = [];
let selected = new Set();
let selectedNumObjs = [];
let paymentOrder = null;
let pollTimer = null;

const $ = id => document.getElementById(id);

function pad(n) { return padNum(n, RIFA ? RIFA.qty : 100); }

function stateLabel(st) {
  return { available: 'DISPONÍVEL', selected: 'SELECIONADO', reserved: 'RESERVADO', paid: 'PAGO', blocked: 'BLOQUEADO' }[st] || st;
}

async function load() {
  try {
    RIFA = await API.get('/api/public/rifa/' + slug);
    applyVisual(RIFA.visual);
    document.title = RIFA.name + ' | ' + RIFA.cause_name;
    render();
    loadNumbers();
    startCountdown();
    if (RIFA.status === 'finished') renderResult();
  } catch (e) {
    $('app').innerHTML = '<div class="container"><div class="alert" style="margin:40px auto;max-width:500px">' + escapeHtml(e.message) + '</div></div>';
  }
}

async function loadNumbers() {
  const j = await API.get('/api/public/rifa/' + slug + '/numeros');
  NUMBERS = j.numbers;
  renderGrid();
  renderProgress(j.stats);
}

function render() {
  const v = RIFA.visual;
  const logo = v.logo_main || v.logo_org || v.logo_campaign || '';
  $('hdrLogo').src = logo || '/img/logo-default.png';
  $('hdrLogo').style.display = logo ? '' : 'none';
  $('hdrName').textContent = RIFA.name;

  const pads = RIFA.packages || [];
  const standard = money(RIFA.price);

  $('app').innerHTML = `
    <section class="hero">
      <div class="container">
        <div>
          <div class="hero-badge">🎯 Sorteio: ${formatDate(RIFA.draw_date) || 'a definir'}</div>
          <h1>${escapeHtml(RIFA.name)}</h1>
          <p class="subtitle">${escapeHtml(RIFA.cause_title || RIFA.cause_short || 'Participe e ajude essa causa')}</p>
          <div class="hero-copy">
            <div class="hero-stat"><strong>${money(RIFA.price)}</strong><span>por número</span></div>
            <div class="hero-stat"><strong>${RIFA.qty}</strong><span>números</span></div>
            <div class="hero-stat"><strong>${escapeHtml(RIFA.prize_name)}</strong><span>prêmio</span></div>
          </div>
          <div class="hero-cta">
            <a href="#numeros" class="btn accent" style="font-size:18px;padding:16px 34px">🎟️ PARTICIPAR AGORA</a>
          </div>
        </div>
        <div class="hero-prize">
          ${RIFA.prize_image ? '<img src="' + RIFA.prize_image + '" alt="' + escapeHtml(RIFA.prize_name) + '">' : '<img src="/img/prize-default.png" alt="Prêmio">'}
          <div class="price-tag">${money(RIFA.price)} por número</div>
        </div>
      </div>
    </section>

    <section class="progress-section">
      <div class="container">
        <div class="progress-card">
          <div class="progress-top"><strong id="pctLabel">Carregando vendas...</strong><span id="availLabel"></span></div>
          <div class="progress-track"><div class="progress-fill" id="pctBar" style="width:0%"></div></div>
          <div class="progress-meta" id="progressMeta"></div>
        </div>
      </div>
    </section>

    <section class="section" id="causeSec">
      <div class="container">
        <h2 class="section-title">Sua participação pode fazer a diferença</h2>
        <p class="section-sub">Esta rifa foi criada para apoiar ${escapeHtml(RIFA.cause_name || 'uma causa')}.</p>
        <div class="cause-grid">
          <div class="cause-box">
            <h3>${escapeHtml(RIFA.cause_name)}</h3>
            ${RIFA.cause_short ? '<p><b>' + escapeHtml(RIFA.cause_short) + '</b></p>' : ''}
            ${RIFA.cause_long ? '<p>' + escapeHtml(RIFA.cause_long).replace(/\n/g, '<br>') + '</p>' : ''}
            <ul class="cause-list">
              ${RIFA.cause_objective ? '<li><span style="font-size:18px">🎯</span><div><b>Objetivo:</b> ' + escapeHtml(RIFA.cause_objective) + '</div></li>' : ''}
              ${RIFA.cause_benefited ? '<li><span style="font-size:18px">🤝</span><div><b>Quem será beneficiado:</b> ' + escapeHtml(RIFA.cause_benefited) + '</div></li>' : ''}
              ${RIFA.cause_use_of_resources ? '<li><span style="font-size:18px">💡</span><div><b>Uso dos recursos:</b> ' + escapeHtml(RIFA.cause_use_of_resources) + '</div></li>' : ''}
            </ul>
            <p style="margin-top:14px;font-style:italic;opacity:.8">Ao participar, você concorre ao prêmio e contribui diretamente para essa iniciativa.</p>
          </div>
          <div class="cause-org">
            ${v.logo_org ? '<img src="' + v.logo_org + '" alt="' + escapeHtml(RIFA.org_name) + '">' : '<h4 style="color:var(--c-primary)">' + escapeHtml(RIFA.org_name || 'Organização responsável') + '</h4>'}
            <p style="font-size:14px;opacity:.75">Organização responsável pela campanha</p>
            <div class="org-links">
              ${RIFA.org_site ? '<a href="' + escapeHtml(RIFA.org_site) + '" target="_blank" rel="noopener">🌐 ' + escapeHtml(RIFA.org_site) + '</a>' : ''}
              ${RIFA.org_instagram ? '<a href="https://instagram.com/' + RIFA.org_instagram.replace('@','') + '" target="_blank" rel="noopener">📸 ' + escapeHtml(RIFA.org_instagram) + '</a>' : ''}
              ${RIFA.org_whatsapp ? '<a href="https://wa.me/' + RIFA.org_whatsapp.replace(/\D/g,'') + '" target="_blank" rel="noopener">💬 WhatsApp</a>' : ''}
              ${RIFA.org_email ? '<a href="mailto:' + escapeHtml(RIFA.org_email) + '">✉️ ' + escapeHtml(RIFA.org_email) + '</a>' : ''}
            </div>
            ${RIFA.responsible ? '<p style="margin-top:14px;font-size:13px;opacity:.7">Responsável: ' + escapeHtml(RIFA.responsible) + '</p>' : ''}
          </div>
        </div>
      </div>
    </section>

    <section class="section" id="prizeSec" style="padding-top:0">
      <div class="container">
        <h2 class="section-title">O prêmio</h2>
        <div class="prize-grid">
          ${RIFA.prize_image ? '<img src="' + RIFA.prize_image + '" alt="Prêmio">' : '<div class="skeleton" style="height:300px"></div>'}
          <div class="prize-details">
            <h3>${escapeHtml(RIFA.prize_name)}</h3>
            ${RIFA.prize_desc ? '<p>' + escapeHtml(RIFA.prize_desc).replace(/\n/g,'<br>') + '</p>' : ''}
            <p class="mt-16"><b>Valor:</b> ${money(RIFA.price)} por número</p>
            ${pads.length ? `
              <div class="packs-grid">
                ${pads.map(p => {
                  const save = (RIFA.price * p.qty) - p.price;
                  return `<div class="pack-card" data-qty="${p.qty}" onclick="applyPack(this)">
                    <div class="q">${p.qty} ${p.qty === 1 ? 'número' : 'números'}</div>
                    <div class="p">${money(p.price)}</div>
                    ${save > 0 ? `<div class="save">Economize ${money(save)}</div>` : ''}
                  </div>`;
                }).join('')}
              </div>
            ` : ''}
            <div class="qty-control mt-16">
              <button onclick="changeQty(-1)">−</button>
              <input id="qtyInput" type="number" min="1" value="1" oninput="onQtyInput(this.value)">
              <button onclick="changeQty(1)">+</button>
            </div>
            <div class="qty-shortcuts">
              ${[5,10,20,50,100].filter(n => n <= RIFA.qty).map(n => `<button onclick="setQty(${n})">${n}</button>`).join('')}
              <button onclick="randomPick()">🎲 Escolher números aleatórios</button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section numbers-section" id="numeros">
      <div class="container">
        <h2 class="section-title">Escolha seus números</h2>
        <p class="section-sub">Clique nos números para selecionar. Quanto mais números, maiores suas chances!</p>
        <div class="numbers-toolbar">
          <input type="search" id="numSearch" placeholder="Buscar número..." oninput="filterGrid(this.value)">
          <select id="numFilter" onchange="filterGrid()">
            <option value="all">Todos</option>
            <option value="available">Disponíveis</option>
            <option value="paid">Pagos</option>
            <option value="reserved">Reservados</option>
            <option value="blocked">Bloqueados</option>
          </select>
          <div class="spacer"></div>
          <button class="btn outline sm" onclick="randomPick()">🎲 Números aleatórios</button>
        </div>
        <div class="grid" id="numGrid"></div>
        <div class="legend">
          <span><i class="dot available"></i> Disponível</span>
          <span><i class="dot selected"></i> Selecionado</span>
          <span><i class="dot reserved"></i> Reservado</span>
          <span><i class="dot paid"></i> Pago</span>
          <span><i class="dot blocked"></i> Bloqueado</span>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <h2 class="section-title">Como participar</h2>
        <div class="steps">
          <div class="step"><span class="n">1</span><b>Escolha seus números</b><span>Clique nos números disponíveis</span></div>
          <div class="step"><span class="n">2</span><b>Informe seus dados</b><span>Nome, CPF, WhatsApp e e-mail</span></div>
          <div class="step"><span class="n">3</span><b>Realize o pagamento</b><span>Pague via PIX em poucos segundos</span></div>
          <div class="step"><span class="n">4</span><b>Receba o comprovante</b><span>Confirmação imediata da participação</span></div>
          <div class="step"><span class="n">5</span><b>Aguarde o sorteio</b><span>${formatDate(RIFA.draw_date) || 'Data a definir'}</span></div>
        </div>
      </div>
    </section>

    <section class="section" style="padding-top:0">
      <div class="container center">
        <h2 class="section-title">Data do sorteio</h2>
        <p class="section-sub mb-24">Falta pouco para descobrir quem levará o prêmio!</p>
        <div class="countdown" id="countdown"></div>
        ${RIFA.draw_location ? '<p class="mt-16" style="opacity:.75">📍 ' + escapeHtml(RIFA.draw_location) + '</p>' : ''}
      </div>
    </section>

    ${RIFA.rules ? `
    <section class="section" style="padding-top:0">
      <div class="container">
        <h2 class="section-title">Regulamento</h2>
        <div class="rules-box">${escapeHtml(RIFA.rules)}</div>
      </div>
    </section>` : ''}

    <section class="section" style="padding-top:0" id="contactSec">
      <div class="container">
        <h2 class="section-title">Contato</h2>
        <div class="contact-links">
          ${RIFA.org_whatsapp ? '<a class="btn outline" href="https://wa.me/' + RIFA.org_whatsapp.replace(/\D/g,'') + '" target="_blank">💬 WhatsApp</a>' : ''}
          ${RIFA.org_instagram ? '<a class="btn outline" href="https://instagram.com/' + RIFA.org_instagram.replace('@','') + '" target="_blank">📸 Instagram</a>' : ''}
          ${RIFA.org_site ? '<a class="btn outline" href="' + escapeHtml(RIFA.org_site) + '" target="_blank">🌐 Site</a>' : ''}
          <a class="btn ghost" href="/pages/consulta.html?rifa=' + RIFA.slug + '" style="color:var(--c-text)">🔍 Consultar minha participação</a>
        </div>
      </div>
    </section>

    <div class="selection-bar" id="selectionBar">
      <div class="container">
        <div class="selection-card" id="selectionCard">
          <div class="info">
            <div class="total" id="selTotal">R$ 0,00</div>
            <div id="selDetail">Nenhum número selecionado</div>
          </div>
          <button class="btn" id="btnGoCheckout" onclick="openCheckout()" disabled>Confirmar números</button>
        </div>
      </div>
    </div>

    <div id="resultSection"></div>
  `;

  const w = RIFA.org_whatsapp ? RIFA.org_whatsapp.replace(/\D/g,'') : '';
  $('footer').innerHTML = `
    <div class="container">
      <div style="display:flex;align-items:center;gap:12px">
        ${logo ? '<img src="' + logo + '">' : ''}
        <div><b>${escapeHtml(RIFA.name)}</b><br><small>${escapeHtml(RIFA.cause_name)}</small></div>
      </div>
      <small>© ${new Date().getFullYear()} ${escapeHtml(RIFA.org_name || 'Rifa')} · Organização beneficente sem fins lucrativos</small>
    </div>`;

  updateSelectionBar();
}

function renderGrid(filtered) {
  const grid = $('numGrid');
  if (!grid) return;
  const filter = (filtered || []).length ? filtered : NUMBERS;
  grid.innerHTML = filter.map(n => {
    const st = selected.has(n.number) ? 'selected' : n.status;
    return `<div class="num-cell ${st}" data-num="${n.number}" ${st === 'available' || st === 'selected' ? 'onclick="toggleNum(' + n.number + ')"' : ''}>
      ${pad(n.number)}
      <span class="mini">${stateLabel(st)}</span>
    </div>`;
  }).join('');
}

function filterGrid() {
  const q = ($('numSearch')?.value || '').trim();
  const st = $('numFilter')?.value || 'all';
  let list = NUMBERS;
  if (st !== 'all') {
    list = list.filter(n => n.status === st || (st === 'available' && selected.has(n.number)));
  }
  if (q) list = list.filter(n => String(n.number).includes(q) || pad(n.number).includes(q));
  renderGrid(list);
}

function toggleNum(num) {
  if (selected.has(num)) { selected.delete(num); }
  else {
    const maxSel = Math.max(1, Number(($('qtyInput')?.value) || 1));
    if (selected.size >= maxSel) { flash('Limite: ' + maxSel + ' número(s) selecionado(s). Ajuste a quantidade desejada.'); return; }
    selected.add(num);
  }
  updateSelectionBar();
  filterGrid();
}

function updateSelectionBar() {
  const bar = $('selectionCard');
  if (!bar) return;
  const qty = selected.size;
  const price = calcPrice(qty);
  $('selTotal').textContent = money(price.total);
  $('selDetail').innerHTML = qty
    ? qty + ' número(s) · ' + [...selected].map(pad).join(', ') + (price.discount > 0 ? ' · Desconto ' + money(price.discount) : '')
    : 'Nenhum número selecionado';
  $('btnGoCheckout').disabled = qty === 0;
}

function calcPrice(qty) {
  const packs = (RIFA.packages || []).slice().sort((a, b) => b.qty - a.qty);
  let rem = qty, promo = 0;
  for (const p of packs) {
    if (p.qty > 0 && p.price > 0) while (rem >= p.qty) { promo += p.price; rem -= p.qty; }
  }
  if (rem > 0) promo += rem * RIFA.price;
  const standard = RIFA.price * qty;
  return { standard, total: promo, discount: standard - promo };
}

function changeQty(delta) {
  const input = $('qtyInput');
  const cur = Math.max(1, Number(input.value) || 1);
  const next = Math.min(RIFA.qty, cur + delta);
  input.value = next;
  syncQty(next);
}

function setQty(n) {
  $('qtyInput').value = n;
  syncQty(n);
}

function onQtyInput(v) {
  let n = Math.max(1, Math.min(RIFA.qty, Number(v) || 1));
  $('qtyInput').value = n;
  syncQty(n);
}

function syncQty(n) {
  const avail = NUMBERS.filter(x => x.status === 'available').length;
  const target = Math.min(n, avail);
  if (target === 0) { flash('Não há números disponíveis no momento.'); return; }
  if (selected.size > n) { selected = new Set([...selected].slice(0, n)); }
  else if (selected.size < n) {
    const pick = NUMBERS.filter(x => x.status === 'available' && !selected.has(x.number)).map(x => x.number).slice(0, n - selected.size);
    pick.forEach(x => selected.add(x));
  }
  updateSelectionBar();
  filterGrid();
}

function randomPick() {
  const n = Math.max(1, Number(($('qtyInput')?.value) || 1));
  const avail = NUMBERS.filter(x => x.status === 'available').map(x => x.number);
  if (!avail.length) { flash('Não há números disponíveis.'); return; }
  const target = Math.min(n, avail.length);
  const picked = [];
  const pool = [...avail];
  while (picked.length < target) {
    const i = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(i, 1)[0]);
  }
  selected = new Set(picked);
  updateSelectionBar();
  filterGrid();
}

function applyPack(el) {
  const q = Number(el.dataset.qty);
  $('qtyInput').value = q;
  syncQty(q);
  document.querySelectorAll('.pack-card').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('numeros').scrollIntoView({ behavior: 'smooth' });
}

let flashTimer = null;
function flash(msg) {
  let el = $('flashMsg');
  if (!el) {
    el = document.createElement('div');
    el.id = 'flashMsg';
    el.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#111;color:#fff;padding:12px 22px;border-radius:50px;z-index:300;font-size:14px;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,.3);max-width:90vw';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.style.display = 'none', 3500);
}

function renderProgress(stats) {
  if (!stats || !RIFA) return;
  const pct = Math.round((stats.paid / stats.total) * 100);
  $('pctLabel').textContent = pct + '% dos números já foram vendidos';
  $('pctBar').style.width = pct + '%';
  $('availLabel').textContent = 'Números disponíveis: ' + (stats.available + stats.selected);
  $('progressMeta').textContent = stats.paid + ' vendidos · ' + (stats.reserved || 0) + ' reservados · ' + (stats.available + stats.selected) + ' disponíveis';
}

function startCountdown() {
  if (!RIFA.draw_date) return;
  const target = new Date(RIFA.draw_date + 'T23:59:59');
  const el = $('countdown');
  if (!el) return;
  const tick = () => {
    const diff = target - new Date();
    if (diff <= 0) { el.innerHTML = '<div class="cd-box"><strong>HOJE</strong><span>é o dia</span></div>'; return; }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor(diff / 3600000) % 24;
    const m = Math.floor(diff / 60000) % 60;
    const s = Math.floor(diff / 1000) % 60;
    const pad2 = x => String(x).padStart(2, '0');
    el.innerHTML = `<div class="cd-box"><strong>${d}</strong><span>dias</span></div>
      <div class="cd-box"><strong>${pad2(h)}</strong><span>horas</span></div>
      <div class="cd-box"><strong>${pad2(m)}</strong><span>min</span></div>
      <div class="cd-box"><strong>${pad2(s)}</strong><span>seg</span></div>`;
  };
  tick();
  setInterval(tick, 1000);
}

/* ---------- Checkout ---------- */
function openCheckout() {
  if (RIFA.status === 'finished') { flash('Esta rifa já foi sorteada.'); return; }
  if (!selected.size) { flash('Selecione ao menos um número.'); return; }
  const price = calcPrice(selected.size);
  const nums = [...selected].sort((a, b) => a - b).map(pad).join(', ');
  showModal(`
    <div class="modal-header"><h3>Confirmar participação</h3><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="summary mb-16">
        <div class="row"><span>Rifa</span><b>${escapeHtml(RIFA.name)}</b></div>
        <div class="row"><span>Causa</span><b>${escapeHtml(RIFA.cause_name)}</b></div>
        <div class="row"><span>Números</span><span class="nums" style="justify-content:flex-end">${nums.split(', ').slice(0, 12).map(x => '<span class="num-chip">' + x + '</span>').join('')}${selected.size > 12 ? '<span class="num-chip">+' + (selected.size - 12) + '</span>' : ''}</span></div>
        <div class="row"><span>Quantidade</span><b>${selected.size}</b></div>
        <div class="row"><span>Valor unitário</span><span>${money(RIFA.price)}</span></div>
        ${price.discount > 0 ? '<div class="row"><span>Desconto</span><span style="color:#059669;font-weight:700">− ' + money(price.discount) + '</span></div>' : ''}
        <div class="row total"><span>Valor total</span><span>${money(price.total)}</span></div>
      </div>
      <form onsubmit="event.preventDefault(); submitReserve()">
        <div class="form-grid">
          <div class="field full"><label>Nome completo *</label><input id="fName" required placeholder="Seu nome completo"></div>
          <div class="field"><label>CPF *</label><input id="fCPF" required placeholder="000.000.000-00" oninput="maskCPFInput(this)" maxlength="14"></div>
          <div class="field"><label>WhatsApp *</label><input id="fWhats" required placeholder="(11) 99999-9999" oninput="maskPhoneInput(this)" maxlength="16"></div>
          <div class="field"><label>E-mail</label><input id="fEmail" type="email" placeholder="voce@email.com"></div>
          <div class="field"><label>Cidade</label><input id="fCity" placeholder="Sua cidade"></div>
          <div class="field"><label>Estado</label><input id="fState" placeholder="UF" maxlength="2"></div>
        </div>
        <p class="hint" style="font-size:12px;opacity:.65;margin-top:10px">Seus números ficarão reservados por ${RIFA.reserve_minutes} minutos enquanto você realiza o pagamento.</p>
        <button class="btn block mt-16" type="submit">Confirmar participação · ${money(price.total)}</button>
      </form>
    </div>`);
  selectedNumObjs = [...selected].sort((a, b) => a - b);
}

function submitReserve() {
  const name = $('fName').value.trim();
  const cpf = $('fCPF').value.replace(/\D/g, '');
  const whatsapp = $('fWhats').value.replace(/\D/g, '');
  const email = $('fEmail').value.trim();
  if (!validCPF(cpf)) { flash('CPF inválido. Verifique os números.'); return; }
  if (whatsapp.length < 8) { flash('WhatsApp inválido.'); return; }
  closeModal();
  showLoading('Reservando seus números...');
  API.post('/api/public/rifa/' + slug + '/reserve', {
    numbers: selectedNumObjs,
    participant: {
      name, cpf, whatsapp, email,
      city: $('fCity').value.trim(), state: $('fState').value.trim()
    }
  }).then(r => {
    hideLoading();
    paymentOrder = r.code;
    openPayment(r);
  }).catch(e => {
    hideLoading();
    if (e.message.startsWith('Os números')) {
      flash(e.message);
      loadNumbers();
    } else flash(e.message);
  });
}

function openPayment(r) {
  showModal(`
    <div class="modal-header"><h3>Pagamento via PIX</h3><button class="modal-close" onclick="cancelPending()">×</button></div>
    <div class="modal-body pix-box">
      <div class="countdown-badge">⏳ Reserva expira em <b id="pixCount">${RIFA.reserve_minutes}:00</b></div>
      <p style="margin-bottom:12px">Escaneie o QR Code ou copie o código PIX para pagar <b>${money(r.total)}</b>.</p>
      <div class="pix-qr"><img id="pixQR" src="/img/loading.png"></div>
      <div class="pix-brcode" id="pixBrcode">Carregando código PIX...</div>
      <button class="btn outline sm" onclick="copyBrcode()">Copiar código PIX</button>
      <div class="mt-16" id="pixStatus"><span class="spinner"></span> Aguardando confirmação do pagamento...</div>
      <p class="hint" style="font-size:12px;opacity:.6;margin-top:10px">Pagamento processado automaticamente em poucos instantes.</p>
      <button class="btn accent block mt-16" onclick="simulatePay()">Já fiz o pagamento (simulação)</button>
    </div>`);
  API.get('/api/public/order/' + r.code).then(d => {
    if (d.payment && d.payment.pix_qr) {
      $('pixQR').src = d.payment.pix_qr;
      $('pixBrcode').textContent = d.payment.pix_brcode;
    }
  }).catch(() => {});
  startPixCountdown(r);
  pollTimer = setInterval(() => pollOrder(r.code), 5000);
}

function startPixCountdown(r) {
  const end = new Date(r.expires_at).getTime();
  const tick = () => {
    const left = Math.max(0, end - Date.now());
    const m = Math.floor(left / 60000);
    const s = Math.floor(left / 1000) % 60;
    const el = $('pixCount');
    if (el) el.textContent = m + ':' + String(s).padStart(2, '0');
    if (left <= 0) {
      clearInterval(pollTimer);
      closeModal();
      flash('O tempo de reserva expirou. Seus números voltaram a ficar disponíveis.');
      loadNumbers();
    }
  };
  tick();
  setInterval(tick, 1000);
}

function pollOrder(code) {
  API.get('/api/public/order/' + code).then(d => {
    if (d.order.status === 'approved') {
      clearInterval(pollTimer);
      closeModal();
      showReceipt(code);
    } else if (d.order.status === 'expired') {
      clearInterval(pollTimer);
      closeModal();
      flash('Pagamento expirado.');
      loadNumbers();
    }
  }).catch(() => {});
}

async function simulatePay() {
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = 'Confirmando...';
  try {
    await API.post('/api/public/order/' + paymentOrder + '/confirm-sim', {});
    clearInterval(pollTimer);
    closeModal();
    showReceipt(paymentOrder);
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Já fiz o pagamento (simulação)';
    flash(e.message);
  }
}

function copyBrcode() {
  const t = $('pixBrcode').textContent;
  copyText(t).then(ok => flash(ok ? 'Código PIX copiado!' : 'Erro ao copiar'));
}

async function cancelPending() {
  clearInterval(pollTimer);
  closeModal();
  await loadNumbers();
  flash('Reserva cancelada. Você pode escolher outros números quando quiser.');
}

function showReceipt(code) {
  API.get('/api/public/order/' + code).then(d => {
    showModal(`
      <div class="modal-header"><h3>✅ Participação confirmada!</h3><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <div class="receipt">
          <div class="receipt-head">
            ${d.rifa.visual.logo_main || d.rifa.visual.logo_org ? '<img src="' + (d.rifa.visual.logo_main || d.rifa.visual.logo_org) + '">' : ''}
            <div><b>${escapeHtml(d.rifa.name)}</b><br><small>${escapeHtml(d.rifa.cause_name)}</small></div>
          </div>
          <div class="receipt-code"><span style="font-size:12px;opacity:.7">CÓDIGO DA PARTICIPAÇÃO</span><b>${d.order.code}</b></div>
          <div class="summary">
            <div class="row"><span>Participante</span><b>${escapeHtml(d.participant.name)}</b></div>
            <div class="row"><span>Números</span><span class="nums" style="justify-content:flex-end">${d.numbers.map(n => '<span class="num-chip">' + pad(n.number) + '</span>').join('')}</span></div>
            <div class="row"><span>Valor pago</span><b>${money(d.order.total)}</b></div>
            <div class="row"><span>Status</span><span><span class="badge-status approved">PAGO</span></span></div>
            <div class="row"><span>Data do sorteio</span><b>${formatDate(d.rifa.draw_date)}</b></div>
          </div>
        </div>
        <button class="btn block mt-16" onclick="downloadReceipt('${d.order.code}')">Baixar comprovante</button>
        <button class="btn ghost block mt-8" onclick="closeModal(); loadNumbers();">Concluir</button>
      </div>`);
  }).catch(e => flash(e.message));
}

function downloadReceipt(code) {
  const w = window.open('', '_blank');
  API.get('/api/public/order/' + code).then(d => {
    const html = `
      <html><head><title>Comprovante ${d.order.code}</title>
      <style>
        body{font-family:'Segoe UI',sans-serif;color:#222;padding:40px;max-width:600px;margin:auto}
        .head{display:flex;align-items:center;gap:14px;border-bottom:3px solid #6A1E2C;padding-bottom:16px;margin-bottom:16px}
        .code{background:#f3f4f6;border-radius:12px;padding:14px;text-align:center;margin:16px 0}
        .code b{font-size:22px;letter-spacing:2px}
        .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed #ddd;font-size:14px}
        .row.total{font-weight:800;font-size:17px}
        .badge{background:#d1fae5;color:#065f46;padding:4px 14px;border-radius:50px;font-size:12px;font-weight:800}
        .nums span{background:#C6A86B;border-radius:8px;padding:4px 8px;font-size:12px;font-weight:700;margin:2px;display:inline-block}
        @media print { body{padding:10px} .noprint{display:none} }
      </style></head><body>
        <div class="head">
          ${d.rifa.visual.logo_main || d.rifa.visual.logo_org ? '<img src="' + (d.rifa.visual.logo_main || d.rifa.visual.logo_org) + '" style="height:52px">' : ''}
          <div><b>${escapeHtml(d.rifa.name)}</b><br>${escapeHtml(d.rifa.cause_name)}</div>
        </div>
        <h2>Comprovante de Participação</h2>
        <div class="code">PARTICIPAÇÃO<br><b>${d.order.code}</b></div>
        <div class="row"><span>Participante</span><b>${escapeHtml(d.participant.name)}</b></div>
        <div class="row"><span>CPF</span><span>${maskCPF(d.participant.cpf)}</span></div>
        <div class="row"><span>Números</span><span class="nums">${d.numbers.map(n => '<span>' + pad(n.number) + '</span>').join('')}</span></div>
        <div class="row"><span>Quantidade</span><b>${d.order.qty}</b></div>
        <div class="row"><span>Valor pago</span><b>${money(d.order.total)}</b></div>
        <div class="row"><span>Status</span><span class="badge">PAGAMENTO CONFIRMADO</span></div>
        <div class="row"><span>Data da participação</span><span>${formatDate(d.order.created_at)}</span></div>
        <div class="row"><span>Prêmio</span><b>${escapeHtml(d.rifa.prize_name)}</b></div>
        <div class="row"><span>Data do sorteio</span><b>${formatDate(d.rifa.draw_date)}</b></div>
        ${d.rifa.draw_location ? '<div class="row"><span>Local do sorteio</span><span>' + escapeHtml(d.rifa.draw_location) + '</span></div>' : ''}
        <p style="margin-top:20px;font-size:12px;color:#666">Documento gerado eletronicamente pela plataforma. Guarde este comprovante para retirada do prêmio caso seja o vencedor.</p>
        <button class="noprint" onclick="window.print()" style="margin-top:16px;padding:12px 24px;background:#6A1E2C;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer">Imprimir / Salvar PDF</button>
      </body></html>`;
    w.document.write(html);
    w.document.close();
  }).catch(() => flash('Erro ao gerar comprovante'));
}

/* ---------- Resultado ---------- */
function renderResult() {
  API.get('/api/public/rifa/' + slug + '/resultado').then(r => {
    const d = r.draw;
    $('resultSection').innerHTML = `
      <section class="section" style="background:linear-gradient(135deg, var(--c-primary), #111)">
        <div class="container center" style="color:#fff">
          <h2 class="section-title" style="color:#fff">🎉 Resultado do sorteio</h2>
          <p class="section-sub" style="color:rgba(255,255,255,.8)">${escapeHtml(r.rifa.name)}</p>
          <div class="winner-reveal">
            <div style="font-size:14px;text-transform:uppercase;letter-spacing:2px;opacity:.7">Número vencedor</div>
            <div class="big-num" style="color:var(--c-accent)">${pad(d.number)}</div>
            <div class="winner-name">🏆 ${escapeHtml(d.participant_name)}</div>
            <p style="opacity:.75;margin-top:8px">Sorteado em ${formatDate(d.created_at)}</p>
          </div>
          <p style="font-style:italic;opacity:.85;max-width:520px;margin:16px auto 0">"Obrigado a todos que participaram e contribuíram com essa causa."</p>
        </div>
      </section>`;
    if (r.rifa.visual.logo_main || r.rifa.visual.logo_org) {
      const img = r.rifa.visual.logo_main || r.rifa.visual.logo_org;
      $('footer').innerHTML = '<div class="container"><img src="' + img + '" style="max-height:44px"><small>© ' + new Date().getFullYear() + ' ' + escapeHtml(r.rifa.name) + '</small></div>';
    }
  }).catch(() => {});
}

/* ---------- Modal helpers ---------- */
function showModal(html) {
  $('modalRoot').innerHTML = `<div class="modal-overlay" onclick="if(event.target===this)closeModal()"><div class="modal">${html}</div></div>`;
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  $('modalRoot').innerHTML = '';
  document.body.style.overflow = '';
  clearInterval(pollTimer);
}
function showLoading(msg) {
  showModal(`<div class="modal-header"><h3>${escapeHtml(msg)}</h3></div><div class="modal-body center"><span class="spinner" style="width:30px;height:30px"></span></div>`);
}
function hideLoading() { closeModal(); }

/* ---------- Input masks ---------- */
function maskCPFInput(el) {
  let v = el.value.replace(/\D/g, '').slice(0, 11);
  if (v.length > 9) v = v.slice(0, 3) + '.' + v.slice(3, 6) + '.' + v.slice(6, 9) + '-' + v.slice(9);
  else if (v.length > 6) v = v.slice(0, 3) + '.' + v.slice(3, 6) + '.' + v.slice(6);
  else if (v.length > 3) v = v.slice(0, 3) + '.' + v.slice(3);
  el.value = v;
}
function maskPhoneInput(el) {
  let v = el.value.replace(/\D/g, '').slice(0, 11);
  if (v.length > 10) v = '(' + v.slice(0, 2) + ') ' + v.slice(2, 7) + '-' + v.slice(7);
  else if (v.length > 6) v = '(' + v.slice(0, 2) + ') ' + v.slice(2, 6) + '-' + v.slice(6);
  else if (v.length > 2) v = '(' + v.slice(0, 2) + ') ' + v.slice(2);
  else if (v.length) v = '(' + v;
  el.value = v;
}
function validCPF(cpf) {
  cpf = String(cpf || '').replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(cpf[i]) * (10 - i);
  let d1 = 11 - (s % 11); if (d1 >= 10) d1 = 0;
  if (d1 !== parseInt(cpf[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(cpf[i]) * (11 - i);
  let d2 = 11 - (s % 11); if (d2 >= 10) d2 = 0;
  return d2 === parseInt(cpf[10]);
}

load();
