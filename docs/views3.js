const ST = { completed: 'Concluído', failed: 'Falhou', unverified: 'Não verificado', waiting_approval: 'À espera de aprovação', cancelled: 'Cancelado' };
const TOOLN = { search_leads: 'Procurar leads', get_lead: 'Ver cliente', get_conversation: 'Ver conversa', update_lead: 'Actualizar cliente', list_pending: 'Listar pendentes', send_message: 'Enviar mensagem', reply_pending: 'Responder pendentes', assign_lead: 'Assumir cliente', sales_report: 'Relatório', set_bot_paused: 'Pausar/retomar bot', schedule_reminder: 'Lembrete', delete_lead: 'Apagar cliente', broadcast: 'Envio em massa' };
function renderAct() {
  const a = D?.agent || { audit: [], pending: null }, ta = $('ord');
  const keep = ta ? ta.value : '';
  $('v-act').innerHTML = `<h1>Agente</h1><div class="grid" style="grid-template-columns:1fr 1fr">
  <div class="card"><b style="font-weight:500">Dá uma ordem</b><p class="small muted">Em linguagem natural — também podes mandar texto ou áudio ao bot a partir do teu WhatsApp (926 115 429).</p>
    <textarea id="ord" rows="3" placeholder="Ex.: responde aos clientes pendentes que perguntaram por landing pages"></textarea>
    <p class="row" style="flex-wrap:wrap"><button class="btn" onclick="order($('ord').value)">Executar</button>
    ${['Faz o resumo das vendas de hoje e envia para o meu WhatsApp', 'Procura os leads que ainda não responderam', 'Responde aos clientes pendentes'].map((t) => `<button class="btn l" onclick="order('${t}')">${t}</button>`).join('')}</p>
    ${a.lastReply ? `<p class="small"><b>Última resposta</b> (${ago(a.lastReply.at)} atrás) — “${esc(a.lastReply.text)}”</p><pre>${esc(a.lastReply.reply)}</pre>` : ''}</div>
  <div class="dark"><b style="font-weight:500">Aprovação pendente</b>${a.pending ? `<p class="small">${esc(TOOLN[a.pending.tool] || a.pending.tool)} — ${esc(a.pending.reason)}</p><pre style="background:#111;color:#ddd">${esc(JSON.stringify(a.pending.args, null, 1))}</pre>
    <p class="row"><button class="btn l" onclick="order('sim')">✓ Aprovar</button><button class="btn l" onclick="order('não')">Cancelar</button></p>` : '<p class="small muted">Nada à espera de aprovação.</p>'}
    <div class="hr"></div><p class="small muted">Autónomo: ler, procurar, relatórios, responder clientes, actualizar fichas, pausar bot, lembretes.<br>Com limites: assumir cliente (desconto até ao limite).<br>Com aprovação: apagar clientes, envios em massa, desconto acima do limite.</p></div>
  <div class="card" style="grid-column:span 2"><b style="font-weight:500">Histórico de acções</b>${a.audit.length ? `<table><tr><th>Quando</th><th>Ordem</th><th>Acção</th><th>Estado</th><th>Resultado</th></tr>${a.audit.map((e) => `<tr><td class="small muted">${ago(e.at)}</td><td class="small">${esc((e.instruction || '').slice(0, 80))}</td><td>${esc(TOOLN[e.tool] || e.tool)}</td><td>${chip(ST[e.status] || e.status, e.status !== 'completed')}</td><td class="small muted">${esc((e.error || e.reason || e.result || '').slice(0, 140))}</td></tr>`).join('')}</table>` : '<div class="empty">Ainda sem acções.</div>'}</div></div>`;
  $('ord').value = keep;
}
function order(t) { if (!t || !t.trim()) return toast('Escreve a ordem'); cmd('agent', t.trim()); toast('Ordem enviada — o agente responde aqui e no teu WhatsApp'); }
