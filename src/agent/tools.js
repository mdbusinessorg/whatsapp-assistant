// Registo de ferramentas do agente do dono: nome, descrição, schema, execução e verificação. Acesso mínimo (sem shell/BD livre).
const config = require('../config');
const st = require('../state');
const permissions = require('./permissions');

const sales = () => require('../sales');
const wa = () => require('../whatsapp');
const num = (n) => String(n || '').replace(/\D/g, '');
const jidOf = (n) => `${num(n)}@s.whatsapp.net`;
const ago = (t) => (t ? `${Math.round((Date.now() - t) / 3600e3)}h` : '—');
const brief = (l) => ({ num: l.num, name: l.name, score: l.score, category: l.category, stage: l.stage, status: l.status, declined: l.declined, optOut: l.optOut, priority: !!l.priority, need: l.facts?.need || '', products: l.products, openObjections: [...new Set(l.objections.filter((o) => !o.resolved).map((o) => o.type))], lastCustomer: ago(l.lastCustomerAt), waitingCustomerReply: l.lastBotAt > l.lastCustomerAt });
function find(n) {
  const p = sales().profiles.findByNum(n);
  if (!p) throw new Error(`Cliente +${num(n)} não existe no CRM.`);
  return p;
}
function match(l, q) {
  if (!q) return true;
  const hay = JSON.stringify([l.name, l.num, l.facts, l.products, l.questions, l.objections.map((o) => o.type)]).toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

const T = {};
function tool(name, description, props, required, run) {
  T[name] = { name, description, parameters: { type: 'object', properties: props, required }, run };
}

tool('search_leads', 'Procura clientes/leads no CRM por texto livre (nome, número, produto, necessidade, objeção) e filtros.', {
  query: { type: 'string' }, category: { type: 'string', enum: ['cold', 'developing', 'qualified', 'hot', 'ready'] }, status: { type: 'string', enum: ['open', 'won', 'lost'] },
  waiting_reply: { type: 'boolean', description: 'só os que não responderam à última mensagem do bot' }, since_hours: { type: 'number', description: 'com actividade nas últimas N horas' }, limit: { type: 'number' },
}, [], (a) => {
  const rows = sales().profiles.all().filter((l) => match(l, a.query) && (!a.category || l.category === a.category) && (!a.status || l.status === a.status)
    && (a.waiting_reply == null || (l.lastBotAt > l.lastCustomerAt) === a.waiting_reply) && (!a.since_hours || Date.now() - l.lastCustomerAt < a.since_hours * 3600e3));
  return { count: rows.length, leads: rows.sort((x, y) => y.score - x.score).slice(0, a.limit || 15).map(brief) };
});

tool('get_lead', 'Ficha completa de um cliente + últimas mensagens da conversa.', { num: { type: 'string' } }, ['num'], (a) => {
  const p = find(a.num);
  return { ...brief(p), facts: p.facts, scoreReasons: p.scoreReasons, followUps: p.followUps.length, notes: p.notes || [], override: p.override || null, managed: p.managed || null,
    lastMessages: st.getHistory(p.jid).filter((h) => h.role !== 'system').slice(-10).map((h) => `${h.role === 'user' ? 'cliente' : 'bot'}: ${h.content.slice(0, 300)}`) };
});

tool('get_conversation', 'Últimas mensagens trocadas com um número.', { num: { type: 'string' }, limit: { type: 'number' } }, ['num'], (a) => ({
  messages: st.getHistory(jidOf(a.num)).filter((h) => h.role !== 'system').slice(-(a.limit || 20)).map((h) => `${h.role === 'user' ? 'cliente' : 'bot'}: ${h.content.slice(0, 400)}`),
}));

tool('update_lead', 'Actualiza a ficha de um cliente: nome, prioridade, nota, estado (open/won/lost), parar contacto, novo número.', {
  num: { type: 'string' }, name: { type: 'string' }, priority: { type: 'boolean' }, note: { type: 'string' }, status: { type: 'string', enum: ['open', 'won', 'lost'] },
  stop_contact: { type: 'boolean' }, new_num: { type: 'string' },
}, ['num'], (a) => {
  const p = find(a.num);
  if (a.name) p.name = a.name;
  if (a.priority != null) p.priority = a.priority;
  if (a.note) p.notes = [...(p.notes || []), { at: Date.now(), text: a.note }].slice(-20);
  if (a.stop_contact != null) p.optOut = a.stop_contact;
  if (a.new_num) p.num = num(a.new_num);
  if (a.status) sales().markOutcome(p.num, a.status);
  sales().profiles.save();
  const after = sales().profiles.findByNum(p.num);
  return { verified: !!after && (!a.status || after.status === a.status) && (a.stop_contact == null || after.optOut === a.stop_contact), lead: brief(after) };
});

tool('list_pending', 'Clientes pendentes: interessados que não responderam à última mensagem, ordenados por score.', { min_score: { type: 'number' } }, [], (a) => {
  const rows = sales().profiles.all().filter((l) => l.status === 'open' && !l.declined && !l.optOut && l.lastBotAt > l.lastCustomerAt && l.score >= (a.min_score || 0));
  return { count: rows.length, leads: rows.sort((x, y) => y.score - x.score).slice(0, 30).map(brief) };
});

async function sendTo(n, text) {
  const jid = jidOf(n);
  const res = await wa().send(jid, text);
  st.pushHistory(jid, 'assistant', text);
  st.saveHistories();
  const p = sales().profiles.findByNum(n);
  if (p) {
    p.lastBotAt = Date.now();
    sales().profiles.save();
  }
  return { to: num(n), verified: !!res?.key?.id, messageId: res?.key?.id || null };
}

tool('send_message', 'Envia uma mensagem de WhatsApp a um cliente (texto exacto, já redigido).', { num: { type: 'string' }, text: { type: 'string' } }, ['num', 'text'], async (a) => {
  const p = sales().profiles.findByNum(a.num);
  if (p?.optOut) throw new Error(`+${num(a.num)} pediu para não ser contactado.`);
  return sendTo(a.num, a.text);
});

tool('reply_pending', 'Responde/recupera clientes pendentes com mensagens personalizadas geradas pelo motor de vendas (respeita opt-out e recusas). Pode filtrar por texto (ex.: produto).', {
  query: { type: 'string' }, nums: { type: 'array', items: { type: 'string' } }, limit: { type: 'number' },
}, [], async (a) => {
  const max = Math.min(a.limit || 10, permissions.limits().maxMessagesPerRun || 20);
  let rows = sales().profiles.all().filter((l) => l.status === 'open' && !l.declined && !l.optOut && match(l, a.query));
  rows = a.nums?.length ? rows.filter((l) => a.nums.map(num).includes(l.num)) : rows.filter((l) => l.lastBotAt > l.lastCustomerAt);
  const results = [];
  for (const p of rows.sort((x, y) => y.score - x.score).slice(0, max)) {
    try {
      const text = await sales().composeFollowUp(p, st.getHistory(p.jid));
      const r = await sendTo(p.num, text);
      p.followUps.push({ at: Date.now(), n: p.followUps.length + 1, manual: true });
      sales().profiles.save();
      results.push({ ...r, name: p.name, text });
    } catch (e) {
      results.push({ to: p.num, verified: false, error: e.message });
    }
  }
  return { attempted: results.length, sent: results.filter((r) => r.verified).length, results };
});

tool('assign_lead', 'O agente assume a gestão de um cliente para fechar a venda, com limite de desconto autorizado (%). Opcionalmente envia já uma mensagem.', {
  num: { type: 'string' }, max_discount_pct: { type: 'number' }, goal: { type: 'string' }, send_now: { type: 'boolean' },
}, ['num'], async (a) => {
  const p = find(a.num);
  p.override = { ...(p.override || {}), maxDiscountPct: a.max_discount_pct || 0 };
  p.managed = { goal: a.goal || 'concluir a venda', at: Date.now() };
  sales().profiles.save();
  let sent = null;
  if (a.send_now && !p.optOut) sent = await sendTo(p.num, await sales().composeFollowUp(p, st.getHistory(p.jid)));
  return { verified: sales().profiles.findByNum(p.num)?.managed?.goal === p.managed.goal, lead: brief(p), maxDiscountPct: p.override.maxDiscountPct, sent };
});
T.assign_lead.checkLimits = (a) => {
  const max = permissions.limits().maxDiscountPct ?? 0;
  return (a.max_discount_pct || 0) > max ? `desconto de ${a.max_discount_pct}% acima do limite configurado (${max}%)` : null;
};

tool('sales_report', 'Relatório de vendas (hoje/semana/tudo): leads, quentes, vendidos, conversão, objeções, pendentes. send_to_owner=true envia para o WhatsApp do dono.', {
  period: { type: 'string', enum: ['today', 'week', 'all'] }, send_to_owner: { type: 'boolean' },
}, [], async (a) => {
  const span = { today: 864e5, week: 7 * 864e5 }[a.period || 'today'];
  const d = sales().dashboard();
  const active = sales().profiles.all().filter((l) => !span || Date.now() - l.lastCustomerAt < span);
  const report = { period: a.period || 'today', activeLeads: active.length, newLeads: active.filter((l) => !span || Date.now() - l.createdAt < span).length, total: d.total, hot: d.hot, won: d.won, lost: d.lost, conversionRate: d.conversionRate, pending: d.pending.length, followUpsSent: d.followUpsSent, recovered: d.recovered, topObjections: d.topObjections, insights: d.insights, hotLeads: active.filter((l) => ['hot', 'ready'].includes(l.category)).map(brief).slice(0, 8) };
  if (a.send_to_owner) {
    const txt = `📊 *Relatório (${report.period})*\nLeads activos: ${report.activeLeads} (novos ${report.newLeads}) · Quentes: ${report.hot}\nVendidos: ${report.won} · Perdidos: ${report.lost} · Conversão: ${report.conversionRate}%\nPendentes: ${report.pending} · Follow-ups: ${report.followUpsSent} (${report.recovered} recuperados)` + (report.hotLeads.length ? `\n\n🔥 ${report.hotLeads.map((l) => `+${l.num}${l.name ? ` ${l.name}` : ''} (${l.score})`).join('\n🔥 ')}` : '');
    report.sent = (await sendTo(config.ownerNumber, txt)).verified;
  }
  return report;
});

tool('set_bot_paused', 'Pausa ou retoma as respostas automáticas do bot aos clientes.', { paused: { type: 'boolean' } }, ['paused'], async (a) => {
  await wa().setPaused(a.paused);
  return { verified: wa().status().paused === a.paused, paused: wa().status().paused };
});

tool('schedule_reminder', 'Agenda um lembrete para o dono no WhatsApp daqui a N minutos.', { minutes: { type: 'number' }, text: { type: 'string' } }, ['minutes', 'text'], (a) => {
  const r = { id: Date.now().toString(36), jid: jidOf(config.ownerNumber), at: Date.now() + a.minutes * 60000, text: a.text };
  st.addReminder(r);
  return { verified: st.reminders().some((x) => x.id === r.id), at: new Date(r.at).toISOString() };
});

tool('delete_lead', 'Apaga definitivamente um cliente e a conversa (irreversível).', { num: { type: 'string' } }, ['num'], (a) => {
  const p = find(a.num);
  sales().profiles.remove(p.jid);
  st.clearHistory(p.jid);
  st.saveHistories();
  return { verified: !sales().profiles.findByNum(a.num) };
});

tool('broadcast', 'Envia o MESMO texto a vários clientes que correspondem ao filtro (exclui quem pediu para não ser contactado).', { query: { type: 'string' }, text: { type: 'string' }, limit: { type: 'number' } }, ['text'], async (a) => {
  const rows = sales().profiles.all().filter((l) => !l.optOut && !l.declined && match(l, a.query)).slice(0, Math.min(a.limit || 20, permissions.limits().maxMessagesPerRun || 20));
  const results = [];
  for (const p of rows) results.push(await sendTo(p.num, a.text).catch((e) => ({ to: p.num, verified: false, error: e.message })));
  return { sent: results.filter((r) => r.verified).length, results };
});

module.exports = { T, schemas: () => Object.values(T).map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })) };
