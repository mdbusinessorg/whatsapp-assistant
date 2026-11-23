const chip = (t, light) => `<span class="chip ${light ? 'l' : ''}">${esc(t)}</span>`;
function leadRow(l) {
  return `<tr class="click" onclick="openLead('${l.jid}')"><td><span class="row">${face(l)}<span>${esc(l.name || '—')}<br><span class="muted small">+${esc(l.num)}</span></span></span></td>
  <td><b>${l.score}</b> <span class="muted small">${CAT[l.category] || ''}</span></td><td>${STAGE[l.stage] || ''}</td><td>${STATUS[l.status] || l.status}</td>
  <td class="small">${esc(l.facts?.need || '')}</td><td class="small muted">${ago(l.lastCustomerAt)}</td></tr>`;
}
const table = (rows) => rows.length ? `<table><tr><th>Cliente</th><th>Score</th><th>Estágio</th><th>Estado</th><th>Necessidade</th><th>Última msg</th></tr>${rows.map(leadRow).join('')}</table>` : '<div class="empty">Sem leads para mostrar.</div>';
function renderLeads() {
  const q = ($('q').value || '').toLowerCase();
  const F = [['', 'Todos'], ['hot', 'Quentes'], ['qualified', 'Qualificados'], ['open', 'Abertos'], ['won', 'Vendidos'], ['lost', 'Perdidos']];
  const rows = S().leads.filter((l) => {
    if (leadFilter === 'hot' && !['hot', 'ready'].includes(l.category)) return false;
    if (leadFilter === 'qualified' && !['qualified', 'hot', 'ready'].includes(l.category)) return false;
    if (['open', 'won', 'lost'].includes(leadFilter) && l.status !== leadFilter) return false;
    return !q || JSON.stringify([l.name, l.num, l.facts, l.products]).toLowerCase().includes(q);
  });
  $('v-leads').innerHTML = `<h1>Leads</h1><div class="tabs" style="margin-bottom:14px">${F.map(([k, t]) => `<button class="${leadFilter === k ? 'on' : ''}" onclick="go('leads','${k}')">${t}</button>`).join('')}</div><div class="card">${table(rows)}</div>`;
}
function renderFunnel() {
  const open = S().leads.filter((l) => l.status === 'open');
  $('v-funnel').innerHTML = `<h1>Funil</h1><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px">${Object.entries(STAGE).map(([k, t]) => {
    const ls = open.filter((l) => l.stage === k);
    return `<div class="card"><div class="row between"><b style="font-weight:500">${t}</b>${chip(ls.length)}</div><div class="files">${ls.map((l) => `<div class="file" onclick="openLead('${l.jid}')"><span class="ic">${l.score}</span>${esc(l.name || '+' + l.num)}</div>`).join('') || '<div class="empty">—</div>'}</div></div>`;
  }).join('')}</div>`;
}
function renderFollow() {
  const s = S(), sent = s.leads.filter((l) => l.followUps);
  $('v-follow').innerHTML = `<h1>Pendentes</h1><div class="grid" style="grid-template-columns:1fr 1fr">
  <div class="card"><b style="font-weight:500">À espera de resposta do cliente</b><p class="small muted">O bot envia follow-ups automáticos (24h, 72h, 7 dias) só a leads com interesse, nunca a quem recusou, e só das 8h às 20h.</p>${table(s.pending)}</div>
  <div class="card"><b style="font-weight:500">Follow-ups enviados</b><p class="small muted">${s.followUpsSent} enviados · ${s.recovered} clientes voltaram a responder</p>${table(sent)}</div></div>`;
}
function renderObj() {
  const s = S(), max = Math.max(1, ...s.topObjections.map((o) => o[1]));
  $('v-obj').innerHTML = `<h1>Objeções & insights</h1><div class="grid" style="grid-template-columns:1fr 1fr">
  <div class="card"><b style="font-weight:500">Objeções mais comuns</b>${s.topObjections.map(([k, n]) => `<div class="row between small" style="margin-top:14px"><span>${OBJ[k] || k}</span><span>${n}</span></div><div class="prog" style="width:100%"><i style="width:${(n / max) * 100}%"></i></div>`).join('') || '<div class="empty">Ainda sem objeções.</div>'}
  <p style="margin-top:22px"><b style="font-weight:500">Produtos mais procurados</b></p>${s.topProducts.map(([k, n]) => chip(`${k} · ${n}`, true)).join('') || '<div class="empty">—</div>'}</div>
  <div class="dark"><b style="font-weight:500">Recomendações</b>${s.insights.map((i) => `<p class="small">💡 ${esc(i)}</p>`).join('') || '<p class="small muted">Os insights aparecem quando houver conversas suficientes.</p>'}</div></div>`;
}
function renderWa() {
  const on = online(), ta = $('ctx');
  const keep = ta && (ta.dataset.dirty || document.activeElement === ta) ? ta.value : null;
  $('v-wa').innerHTML = `<h1>WhatsApp</h1><div class="grid" style="grid-template-columns:1fr 1fr">
  <div class="dark">${D?.qr && on ? `<img class="qr" src="${D.qr}">` : `<div class="orb ${on && D?.connected ? '' : 'off'}"></div>`}
    <p class="small">${on ? (D.connected ? `Ligado como +${esc(D.selfNum)}` : 'À espera do QR (Aparelhos ligados → Ligar aparelho)') : 'Servidor offline — reinicia sozinho em minutos'}</p>
    <button class="btn l" onclick="cmd('toggle')">${D?.paused ? '▶ Retomar' : '⏸ Pausar'} o bot</button></div>
  <div class="card"><b style="font-weight:500">Enviar mensagem</b><p><input class="in" id="to" placeholder="Número (ex.: 244923000000)"></p><p><textarea id="msg" rows="3" placeholder="Mensagem"></textarea></p>
    <button class="btn" onclick="sendTo($('to').value,$('msg').value)">Enviar</button></div>
  <div class="card" style="grid-column:span 2"><b style="font-weight:500">Informação da empresa (serviços, preços, FAQ)</b><p class="small muted">O bot só usa esta informação — preços fora daqui são bloqueados.</p>
    <textarea id="ctx" rows="14" oninput="this.dataset.dirty=1"></textarea><p><button class="btn" onclick="cmd('context',$('ctx').value);$('ctx').dataset.dirty=''">Guardar</button></p></div>
  <div class="card" style="grid-column:span 2"><b style="font-weight:500">Log</b><pre>${esc((D?.logs || []).join('\n') || '(vazio)')}</pre></div></div>`;
  $('ctx').value = keep ?? (D?.context || '');
  if (keep != null) $('ctx').dataset.dirty = 1;
}
function sendTo(to, text) { if (!to || !text) return toast('Falta número ou mensagem'); cmd('send', JSON.stringify({ to, text })); }
function openLead(jid) {
  const l = S().leads.find((x) => x.jid === jid); if (!l) return;
  const facts = Object.entries(l.facts || {}).filter(([, v]) => v);
  $('lead').innerHTML = `<div class="row between"><span class="row">${face(l)}<span><b>${esc(l.name || 'Sem nome')}</b><br><span class="muted small">+${esc(l.num)}</span></span></span><button class="circ light" onclick="closeLead()">✕</button></div>
  <p><span class="big">${l.score}</span>/100 · ${CAT[l.category]} · ${STAGE[l.stage] || ''} · ${STATUS[l.status] || l.status}</p>
  <p class="small"><b>Porquê este score:</b><br>${(l.reasons || []).map(esc).join('<br>')}</p>
  ${facts.length ? `<p class="small"><b>Dados recolhidos:</b><br>${facts.map(([k, v]) => `${esc(k)}: ${esc(v)}`).join('<br>')}</p>` : ''}
  ${l.products?.length ? `<p>${l.products.map((p) => chip(p, true)).join('')}</p>` : ''}
  ${l.objections?.length ? `<p class="small"><b>Objeções por resolver:</b> ${l.objections.map((o) => OBJ[o] || o).join(', ')}</p>` : ''}
  <p class="small muted">${l.messages} mensagens · ${l.followUps} follow-ups · última mensagem há ${ago(l.lastCustomerAt)}${l.optOut ? ' · pediu para não ser contactado' : ''}</p>
  <p class="row" style="flex-wrap:wrap"><button class="btn" onclick="outcome('${l.num}','won')">✓ Vendido</button><button class="btn l" onclick="outcome('${l.num}','lost')">Perdido</button><button class="btn l" onclick="outcome('${l.num}','open')">Reabrir</button><a class="btn l" style="text-decoration:none" target="_blank" href="https://wa.me/${esc(l.num)}">Abrir no WhatsApp</a></p>
  <p><textarea id="lmsg" rows="3" placeholder="Mensagem para este cliente"></textarea></p><button class="btn" onclick="sendTo('${l.num}',$('lmsg').value)">Enviar mensagem</button>`;
  $('modal').classList.add('on');
}
function closeLead() { $('modal').classList.remove('on'); }
function outcome(num, status) { cmd('outcome', JSON.stringify({ num, status })); closeLead(); }
if (localStorage.waTok) load(); else $('login').hidden = false;
setInterval(() => { if (localStorage.waTok && !$('app').hidden && !$('modal').classList.contains('on')) load(); }, 6000);
