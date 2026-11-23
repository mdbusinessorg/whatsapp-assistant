function online() { return ROW && NOW - Date.parse(ROW.updated_at) < 150000; }
function S() { return D?.sales || { leads: [], pending: [], stages: {}, categories: {}, topObjections: [], topProducts: [], insights: [], total: 0, qualified: 0, hot: 0, won: 0, lost: 0, conversionRate: 0, followUpsSent: 0, recovered: 0 }; }
function spark(vals, w = 170, h = 60, color = '#111') {
  const max = Math.max(1, ...vals), step = w / Math.max(1, vals.length - 1);
  const pts = vals.map((v, i) => [i * step, h - 6 - (v / max) * (h - 12)]);
  const d = pts.map((p, i) => (i ? 'S' + (p[0] - step / 2) + ',' + p[1] + ' ' : 'M') + p[0] + ',' + p[1]).join(' ');
  return `<svg width="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="height:${h}px"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.4"/></svg>`;
}
function perDay(leads, key, days = 14) {
  const out = Array(days).fill(0), day = 864e5;
  for (const l of leads) { const i = days - 1 - Math.floor((NOW - (l[key] || 0)) / day); if (i >= 0 && i < days) out[i]++; }
  return out;
}
function render() {
  $('nav').innerHTML = NAV.map(([k, t]) => `<a class="${view === k ? 'on' : ''}" onclick="go('${k}')">${svg(k)}<span>${t}</span></a>`).join('');
  const s = S(), on = online();
  $('wa-ic').innerHTML = svg('cam');
  $('wa-txt').innerHTML = `<b>${on ? (D.connected ? 'Ligado' : 'À espera do QR') : 'Servidor offline'}</b><br><span class="muted">${D?.paused ? 'Em pausa' : 'A responder'}</span>`;
  $('s-ic').innerHTML = svg('search');
  $('bell').innerHTML = svg('bell') + (s.pending.length ? `<span class="badge">${s.pending.length}</span>` : '');
  $('mail').innerHTML = svg('mail') + (s.hot ? `<span class="badge">+${s.hot}</span>` : '');
  const t = new Date(NOW + 3600e3);
  $('clk').innerHTML = `${svg('clock').replace('<svg', '<svg style="width:16px;height:16px"')}<br>${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`;
  $('me-num').textContent = D?.selfNum ? '+' + D.selfNum : '';
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('on', v.id === 'v-' + view));
  ({ home: renderHome, leads: renderLeads, funnel: renderFunnel, follow: renderFollow, obj: renderObj, act: renderAct, wa: renderWa })[view]();
}
function renderHome() {
  const s = S(), on = online(), leads = s.leads.filter(inRange), open = leads.filter((l) => l.status === 'open');
  const stages = Object.keys(STAGE), max = Math.max(1, ...stages.map((k) => open.filter((l) => l.stage === k).length));
  const months = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'], dt = new Date(NOW + 3600e3);
  const funnel = stages.map((k) => {
    const ls = open.filter((l) => l.stage === k), n = ls.length;
    return `<div>${STAGE[k]}</div><div class="lane">${n ? `<button class="bar" style="--share:${100*n/max}%" onclick="go('funnel')" aria-label="${STAGE[k]}: ${n} leads">${n} lead${n > 1 ? 's' : ''}</button>` : '<span class="muted">—</span>'}</div>`;
  }).join('');
  const hot = [...open].sort((a, b) => b.score - a.score).slice(0, 4);
  const today = s.leads.filter((l) => NOW - l.createdAt < 864e5).length;
  const cats = Object.keys(CAT), cmax = Math.max(1, ...cats.map((c) => s.categories[c] || 0));
  const pendPct = open.length ? Math.round((s.pending.length / open.length) * 100) : 0;
  const obj = s.topObjections.slice(0, 3), omax = Math.max(1, ...obj.map((o) => o[1]));
  $('v-home').innerHTML = `
  <h1>CRM</h1>
  <div class="grid home-grid">
    <div class="plain">
      <div class="dateline"><span>▢ ${dt.getUTCDate()} ${months[dt.getUTCMonth()]} ${dt.getUTCFullYear()} ➤</span>
        <div class="tabs">${[['day', 'Dia'], ['week', 'Semana'], ['month', 'Mês'], ['all', 'Tudo']].map(([k, t]) => `<button class="${range === k ? 'on' : ''}" onclick="range='${k}';render()">${t}</button>`).join('')}</div></div>
      <div class="funnel">${funnel}</div>
    </div>
    <div class="card">
      <div class="row between"><b style="font-weight:500">Funil de vendas</b><span>▪▪</span></div>
      <div class="small" style="margin-top:12px">Taxa de conversão</div>
      <div class="big">${s.conversionRate.toLocaleString('pt-PT')}%</div>
      <div class="small muted">${s.won} vendido(s) em ${s.total} lead(s)</div>
      <div style="margin:14px 0">${spark(perDay(s.leads, 'createdAt'))}${spark(perDay(s.leads, 'lastCustomerAt'), 170, 1, '#999').replace('height:1px', 'height:0')}</div>
      <div class="legend"><div><span>Vendidos</span><span>${s.won}</span></div><div><span>Quentes</span><span>${s.hot}</span></div><div><span>Perdidos</span><span>${s.lost}</span></div></div>
    </div>
    <div class="dark">
      <div class="row">${svg('file').replace('<svg', '<svg style="width:16px"')} <b style="font-weight:500">WhatsApp Business</b></div>
      ${D?.qr && on ? `<img class="qr" src="${D.qr}" alt="QR">` : `<div class="orb ${on && D?.connected ? '' : 'off'}"></div>`}
      <div class="small">${D?.qr && on ? 'Escaneia: Aparelhos ligados → Ligar aparelho' : D?.selfNum ? '+' + esc(D.selfNum) : 'Sem sessão'}</div>
      <div class="small muted">${on ? (D.connected ? 'Online' : 'À espera do QR') : 'Servidor offline'} · ${D?.paused ? 'em pausa' : 'a responder'}</div>
      <div class="hr"></div>
      <div class="row between"><span class="row small"><span class="face" style="background:#333;margin:0">MD</span> MD Business</span>
      <button class="btn l" style="padding:6px 14px" onclick="cmd('toggle')">${D?.paused ? '▶ Retomar' : '⏸ Pausar'}</button></div>
    </div>
    <div class="card">
      <div class="row between"><span class="row"><span class="circ">${svg('leads')}</span> <span class="small">⌄ &nbsp; Leads quentes</span></span><span>▪▪</span></div>
      <div class="files">${hot.length ? hot.map((l) => `<div class="file" onclick="openLead('${l.jid}')"><span class="ic">${l.score}</span><span>${esc(l.name || '+' + l.num)}<br><span class="muted">${CAT[l.category]} · ${STAGE[l.stage] || ''}</span></span></div>`).join('') : '<div class="empty">Ainda sem leads. Aparecem aqui quando os clientes escreverem.</div>'}</div>
    </div>
    <div class="teamwrap">
      <div class="stats">
        <span class="row"><span style="font-size:30px;font-weight:500">Leads</span><span class="chip">+${today}</span></span>
        <span class="stat"><span class="circ" style="width:34px;height:34px">${svg('leads')}</span><span>Total de leads<b>${s.total} <span class="prog"><i style="width:${s.total ? (s.qualified / s.total) * 100 : 0}%"></i></span><span class="small">${s.qualified} qualif.</span></b></span></span>
        <span class="stat"><span class="circ" style="width:34px;height:34px">${svg('bell')}</span><span>Pendentes<b>${s.pending.length} <span class="prog"><i style="width:${pendPct}%"></i></span><span class="small">${pendPct}%</span></b></span></span>
        <span class="stat"><span class="circ" style="width:34px;height:34px">${svg('mail')}</span><span>Follow-ups<b>${s.followUpsSent} <span class="small">· ${s.recovered} recuperados</span></b></span></span>
      </div>
      <div class="dark cols">
        <div><b style="font-weight:500">Pendentes</b><div class="small muted">À espera de resposta do cliente</div><div class="faces" style="margin:18px 0 18px 8px">${s.pending.slice(0, 4).map(face).join('') || '<span class="small muted">nenhum</span>'}</div>
          <div class="row between small"><span>PROGRESSO</span><span>${pendPct}%</span></div><div class="prog"><i style="width:${pendPct}%"></i></div>
          <div class="row small" style="margin-top:12px;gap:18px"><span>💬 ${open.reduce((n, l) => n + l.messages, 0)}</span><span>↻ ${s.followUpsSent}</span></div></div>
        <div><b style="font-weight:500">Objeções</b><div class="small muted">As mais frequentes</div>
          ${obj.length ? obj.map(([k, n]) => `<div class="row between small" style="margin-top:14px"><span>${OBJ[k] || k}</span><span>${n}</span></div><div class="prog"><i style="width:${(n / omax) * 100}%"></i></div>`).join('') : '<div class="small muted" style="margin-top:18px">Sem objeções registadas</div>'}</div>
        <div><b style="font-weight:500">Categorias</b>${cats.map((c) => `<div class="row between small"><span>${CAT[c]}</span><b>${s.categories[c] || 0}</b></div><div class="prog"><i style="width:${100*(s.categories[c] || 0)/cmax}%"></i></div>`).join('')}</div>
      </div>
    </div>
  </div>`;
}
