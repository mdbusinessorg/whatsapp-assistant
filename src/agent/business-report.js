const config = require('../config');
const profiles = require('../sales/profiles');
const { CATEGORY_LABEL } = require('../sales/scoring');
const audit = require('./audit');

const states = { open: 'Aberto', won: 'Vendido', lost: 'Perdido' };
const when = t => t ? new Date(t).toLocaleString('pt-PT', { timeZone: 'Africa/Luanda' }) : '—';

function build(leads, actions) {
  const count = predicate => leads.filter(predicate).length;
  const lines = [
    'Relatório completo da MD Business · todo o período',
    'Dados guardados no CRM. Não inclui mensagens que o bot não recebeu.',
    `Clientes: ${leads.length} · Abertos: ${count(l => l.status === 'open')} · Vendidos: ${count(l => l.status === 'won')} · Perdidos: ${count(l => l.status === 'lost')}`,
    `Quentes ou prontos a comprar: ${count(l => ['hot', 'ready'].includes(l.category))} · Conversão: ${leads.length ? Math.round(count(l => l.status === 'won') * 1000 / leads.length) / 10 : 0}%`,
    `Qualificados ou superiores: ${count(l => ['qualified', 'hot', 'ready'].includes(l.category))} · Recuperados: ${count(l => l.recovered)}`,
    `Sem resposta registada da equipa: ${count(l => l.lastCustomerAt > l.lastBotAt)} · Recusaram: ${count(l => l.declined)} · Pediram para não ser contactados: ${count(l => l.optOut)}`,
    `Acompanhamentos registados: ${leads.reduce((n, l) => n + l.followUps.length, 0)}`,
    '', 'Clientes — todos os estados e pontuações',
  ];
  for (const [i, l] of leads.entries()) {
    lines.push(`${i + 1}. ${l.name || 'Sem nome'} · ${l.num ? '+' + l.num : 'Número não partilhado'} · ${states[l.status] || l.status}`,
      `   ${CATEGORY_LABEL[l.category] || l.category} (${l.score}/100) · Etapa: ${l.stage} · Mensagens: ${l.messages} · Acompanhamentos: ${l.followUps.length}${l.declined ? ' · Recusou' : ''}${l.optOut ? ' · Não contactar' : ''}`,
      `   Última mensagem do cliente: ${when(l.lastCustomerAt)} · Última resposta registada: ${when(l.lastBotAt)}`);
    if (l.facts?.need) lines.push(`   Pedido: ${l.facts.need}`);
    if (l.scoreReasons.length) lines.push(`   Pontuação: ${l.scoreReasons.join('; ')}`);
    if (l.products.length) lines.push(`   Produtos: ${l.products.join(', ')}`);
    if (l.objections.length) lines.push(`   Objeções: ${l.objections.map(o => `${o.type}${o.resolved ? ' (resolvida)' : ''}`).join(', ')}`);
  }
  lines.push('', `Acções do agente guardadas: ${actions.length}`);
  for (const a of actions) lines.push(`${when(a.at)} · ${a.tool} · ${a.status}`);
  return lines.join('\n');
}

async function deliver() {
  if (config.mode !== 'business' || !config.ownerNumber) throw new Error('Administrador Business não configurado.');
  const leads = profiles.all();
  const text = build(leads, audit.all());
  const wa = require('../whatsapp');
  const to = config.ownerNumber + '@s.whatsapp.net';
  const message = text.length <= 3500 ? await wa.send(to, text)
    : await wa.sendDocument(to, Buffer.from(text, 'utf8'), 'relatorio-completo.txt');
  const verified = !!message?.key?.id;
  return { period: 'all', total: leads.length, sent: verified, verified };
}

function fullRequest(text) {
  const t = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[.!?,]+/g, ' ').trim();
  return /^(?:(?:manda|envia|mostra|da|gera|faz|quero)(?:-?me)?\s+)?(?:(?:o|um|todo o)\s+)?relatorio(?:\s+(?:de vendas|do crm|geral|total|completo|sem filtros?|de tudo|por favor))*$/.test(t);
}

module.exports = { build, deliver, fullRequest };
