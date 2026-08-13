const slug = window.location.pathname.split('/').filter(Boolean).pop();

async function load() {
  try {
    const r = await API.get('/api/public/rifa/' + slug + '/resultado');
    const rifa = r.rifa;
    applyVisual(rifa.visual);
    const d = r.draw;
    const pad = n => padNum(n, rifa.qty);
    document.title = 'Resultado | ' + rifa.name;
    const logo = rifa.visual.logo_main || rifa.visual.logo_org || rifa.visual.logo_campaign;
    if (logo) { document.getElementById('hdrLogo').src = logo; }
    document.getElementById('hdrName').textContent = rifa.name;

    if (!d) {
      document.getElementById('app').innerHTML = `
        <section class="section">
          <div class="container center">
            <div style="font-size:60px">⏳</div>
            <h1 style="color:var(--c-primary)">Sorteio ainda não realizado</h1>
            <p class="section-sub" style="margin:12px auto">O sorteio da ${escapeHtml(rifa.name)} será realizado em <b>${formatDate(rifa.draw_date)}</b>.</p>
            <a href="/r/${rifa.slug}" class="btn">Ver página da rifa</a>
          </div>
        </section>`;
      return;
    }

    document.getElementById('app').innerHTML = `
      <section class="hero" style="text-align:center;padding:70px 0">
        <div class="container">
          <div style="font-size:16px;letter-spacing:3px;text-transform:uppercase;opacity:.8;margin-bottom:10px">Resultado do sorteio</div>
          <h1 style="font-size:clamp(26px,4vw,44px)">${escapeHtml(rifa.name)}</h1>
          ${logo ? '<img src="' + logo + '" style="height:60px;margin:16px auto;border-radius:10px">' : ''}
          <div style="background:#fff;color:var(--c-primary);border-radius:20px;display:inline-block;padding:30px 60px;margin-top:20px;box-shadow:0 20px 60px rgba(0,0,0,.25)">
            <div style="font-size:13px;letter-spacing:2px;opacity:.6;text-transform:uppercase">Número vencedor</div>
            <div style="font-size:110px;font-weight:900;font-family:monospace;line-height:1">${pad(d.number)}</div>
            <div style="font-size:26px;font-weight:800;margin-top:8px">🏆 ${escapeHtml(d.participant_name)}</div>
          </div>
          <div style="color:#fff;opacity:.85;margin-top:22px;font-size:15px">
            Sorteio realizado em ${formatDate(d.created_at)} · Código: ${escapeHtml(d.draw_code)}
            ${rifa.draw_location ? '<br>📍 ' + escapeHtml(rifa.draw_location) : ''}
          </div>
        </div>
      </section>
      <section class="section">
        <div class="container center">
          <h2 class="section-title" style="color:var(--c-primary)">Obrigado a todos!</h2>
          <p class="section-sub" style="margin:0 auto;max-width:600px">"Obrigado a todos que participaram e contribuíram com essa causa. Cada participação fez a diferença."</p>
          <p class="mt-24" style="font-weight:700">Prêmio: ${escapeHtml(rifa.prize_name)}</p>
          <a class="btn mt-24" href="/r/${rifa.slug}">Ver página da rifa</a>
        </div>
      </section>`;

    document.getElementById('footer').innerHTML = `
      <div class="container">
        <div style="display:flex;align-items:center;gap:12px">
          ${logo ? '<img src="' + logo + '">' : ''}
          <div><b>${escapeHtml(rifa.name)}</b><br><small>${escapeHtml(rifa.cause_name)}</small></div>
        </div>
        <small>© ${new Date().getFullYear()} ${escapeHtml(rifa.org_name || rifa.name)}</small>
      </div>`;
  } catch (e) {
    document.getElementById('app').innerHTML = '<div class="container"><div class="alert" style="margin:40px auto;max-width:500px">' + escapeHtml(e.message) + '</div></div>';
  }
}

load();
