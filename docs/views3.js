const ST = { completed: 'Concluído', failed: 'Falhou', unverified: 'Não verificado', waiting_approval: 'À espera de aprovação', cancelled: 'Cancelado' };
const TOOLN = { search_leads: 'Procurar leads', get_lead: 'Ver cliente', get_conversation: 'Ver conversa', update_lead: 'Actualizar cliente', list_pending: 'Listar pendentes', send_message: 'Enviar mensagem', reply_pending: 'Responder pendentes', assign_lead: 'Assumir cliente', sales_report: 'Relatório', set_bot_paused: 'Pausar/retomar bot', schedule_reminder: 'Lembrete', delete_lead: 'Apagar cliente', broadcast: 'Envio em massa' };
const SUGS = ['Faz o resumo das vendas de hoje', 'Quais leads ainda não responderam?', 'Responde aos clientes pendentes', 'Quem são os leads mais quentes?', 'Pausa o bot', 'Retoma o bot'];
let waiting = null; // ordem enviada à espera de resposta
const hhmm = (t) => { const d = new Date(t + 3600e3); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
const VIA = { painel: 'CRM', whatsapp: 'WhatsApp', voz: '🎙️ voz' };
Object.assign(TOOLN, { discover_shops: 'Prospectar lojas', list_shops: 'Consultar prospecção', shop_proposal: 'Proposta Roque Santeiro', rate_shop: 'Avaliar loja' });
function renderProspecting(p) {
  const root = $('prospecting');
  root.hidden = !p;
  if (!p) return;
  const select = $('sector'), options = JSON.stringify(p.sectors);
  if (select.dataset.options !== options) {
    const previous = select.value;
    select.replaceChildren(new Option('Todas as lojas', ''), ...p.sectors.map(s => new Option(s, s)));
    select.value = previous || '';
    select.dataset.options = options;
  }
  const key = JSON.stringify([p.shops, D.selfNum, D.connected, p.filter]);
  if ($('prospects').dataset.key === key) return;
  $('prospects').dataset.key = key;
  const number = /^\d{7,15}$/.test(D.selfNum) && D.connected ? D.selfNum : '';
  $('prospects').innerHTML = p.shops.length ? `<p class="small muted">Selecção actual: ${esc(p.filter || 'Todos os ramos')}</p>` + p.shops.map(s => {
    if (!/^[a-z0-9-]+$/.test(s.id)) return '';
    const text = `Quero a proposta Roque Santeiro ${s.id}`;
    return `<details><summary>${esc(s.name)} · ${esc(s.sector)}</summary>
      <p class="small">${esc(s.region)} · ${/^https:\/\//.test(s.source) ? `<a href="${esc(s.source)}" target="_blank" rel="noopener noreferrer">Fonte da ficha</a>` : 'Fonte não disponível'}</p>
      <p class="proposal">${esc(s.proposal)}</p>
      <p class="small">${number ? `<a href="https://wa.me/${number}?text=${encodeURIComponent(text)}" target="_blank" rel="noopener noreferrer">Ligação para a loja pedir esta proposta</a>` : `Quando o WhatsApp estiver ligado, a loja pode escrever: ${esc(text)}`} · Pedidos atendidos: ${Number(s.requestsServed) || 0}</p>
      <div class="row"><button class="btn l" onclick="order('Avaliar loja ${s.id}: relevant')">Boa escolha</button><button class="btn l" onclick="order('Avaliar loja ${s.id}: dismiss')">Descartar</button><span class="small">${esc(({relevant:'Marcada como relevante',dismiss:'Descartada'})[s.feedback] || '')}</span></div></details>`;
  }).join('') : '<p class="empty">Sem novas lojas nesta selecção.</p>';
}
function renderAct() {
  const a = D?.agent || { audit: [], pending: null, chat: [] };
  if (!$('ord')) {
    $('v-act').innerHTML = `<h1>Chat com o bot</h1><div class="grid chat-grid">
    <div class="card"><div class="row between"><b style="font-weight:500">Agente MD Business</b><span class="small muted">também no teu WhatsApp (926 115 429)</span></div>
      <div class="chat" id="chat"></div>
      <div class="sugs">${SUGS.map((t) => `<button class="btn l" onclick="order('${t}')">${t}</button>`).join('')}</div>
      <div class="composer"><textarea id="ord" rows="2" placeholder="Escreve uma ordem ou pergunta…" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();order(this.value)}"></textarea><button class="circ" onclick="order($('ord').value)" title="Enviar">➤</button></div></div>
    <div><div class="dark" id="appr"></div><div class="card" style="margin-top:18px"><b style="font-weight:500">Histórico de acções</b><div id="audit"></div></div></div>
    <section class="card wide" id="prospecting" hidden><h2>Prospecção de lojas</h2>
      <p class="small">Escolhe um ramo ou pesquisa todos. Cada pesquisa prepara até três propostas, sem contactar as lojas.</p>
      <div class="prospect-controls"><label for="sector">Ramo</label><select id="sector"></select><button class="btn" onclick="order('Pesquisar lojas: '+($('sector').value || 'todas'))">Procurar lojas</button></div>
      <div id="prospects"></div><p class="small muted">Directório de Angola: <a href="https://data.humdata.org/dataset/hotosm_ago_points_of_interest">HOT/HDX</a> · <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors (ODbL)</a>. Confirma a ficha antes de abordar a loja.</p>
    </section></div>`;
  }
  renderProspecting(a.prospecting);
  const chat = [...(a.chat || [])];
  if (waiting && !chat.some((m) => m.role === 'user' && m.text === waiting.text && m.at >= waiting.at - 60000)) chat.push({ role: 'user', text: waiting.text, via: 'painel', at: waiting.at });
  const lastUser = [...chat].reverse().find((m) => m.role === 'user');
  const thinking = waiting && (!lastUser || chat[chat.length - 1].role === 'user');
  if (waiting && !thinking) waiting = null;
  const box = $('chat'), atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  box.innerHTML = (chat.length ? chat.map((m) => `<div class="msg ${m.role === 'user' ? 'u' : 'a'}">${esc(m.text)}<small>${hhmm(m.at)}${m.via ? ' · ' + (VIA[m.via] || m.via) : ''}</small></div>`).join('') : '<div class="empty">Dá-me uma ordem: “responde aos pendentes”, “quem está quente?”, “manda o resumo de hoje”…</div>')
    + (thinking ? '<div class="msg a">A executar…</div>' : '');
  if (atBottom || thinking) box.scrollTop = box.scrollHeight;
  $('appr').innerHTML = `<b style="font-weight:500">Aprovação pendente</b>${a.pending ? `<p class="small">${esc(TOOLN[a.pending.tool] || a.pending.tool)} — ${esc(a.pending.reason)}</p><pre style="background:#111;color:#ddd">${esc(JSON.stringify(a.pending.args, null, 1))}</pre>
    <p class="row"><button class="btn l" onclick="order('sim')">✓ Aprovar</button><button class="btn l" onclick="order('não')">Cancelar</button></p>` : '<p class="small muted">Nada à espera de aprovação.</p>'}
    <div class="hr"></div><p class="small muted">Sozinho: ler, procurar, relatórios, responder clientes, actualizar fichas, pausar bot, lembretes.<br>Com limites: assumir cliente (desconto até ao limite).<br>Pede aprovação: apagar clientes, envios em massa, desconto acima do limite.</p>`;
  $('audit').innerHTML = a.audit.length ? `<table><tr><th>Quando</th><th>Acção</th><th>Estado</th></tr>${a.audit.slice(0, 15).map((e) => `<tr title="${esc(e.instruction || '')}"><td class="small muted">${ago(e.at)}</td><td>${esc(TOOLN[e.tool] || e.tool)}</td><td>${chip(ST[e.status] || e.status, e.status !== 'completed')}</td></tr>`).join('')}</table>` : '<div class="empty">Ainda sem acções.</div>';
}
async function order(t) {
  t = (t || '').trim();
  if (!t) return toast('Escreve a ordem');
  waiting = { text: t, at: Date.now() };
  $('ord').value = '';
  renderAct();
  try {
    await api({ action: 'cmd', instance: INSTANCE, cmd: 'agent', arg: t });
  } catch (e) {
    waiting = null;
    toast('Erro: ' + e.message);
  }
}
