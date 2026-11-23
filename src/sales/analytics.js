// Métricas de vendas calculadas só a partir dos dados reais dos leads (sem números inventados).
const { CATEGORY_LABEL } = require('./scoring');
const STAGES = ['initial_contact', 'discovery', 'qualification', 'recommendation', 'value_presentation', 'objection_handling', 'conversion', 'confirmation', 'post_sale'];

const row = (l) => ({
  jid: l.jid, num: l.num, name: l.name, score: l.score, category: l.category, stage: l.stage, status: l.declined && l.status === 'open' ? 'declined' : l.status,
  reasons: l.scoreReasons, facts: l.facts, products: l.products, objections: [...new Set(l.objections.filter((o) => !o.resolved).map((o) => o.type))],
  messages: l.messages, followUps: l.followUps.length, optOut: l.optOut, lastCustomerAt: l.lastCustomerAt, lastBotAt: l.lastBotAt, createdAt: l.createdAt,
});

function compute(leads) {
  const by = (f) => leads.filter(f).length;
  const total = leads.length;
  const won = by((l) => l.status === 'won');
  const lost = by((l) => l.status === 'lost' || l.declined);
  const followed = leads.filter((l) => l.followUps.length);
  const objections = {};
  const products = {};
  for (const l of leads) {
    for (const o of l.objections) objections[o.type] = (objections[o.type] || 0) + 1;
    for (const p of l.products) products[p] = (products[p] || 0) + (l.status === 'won' ? 3 : 1);
  }
  const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const categories = Object.fromEntries(Object.keys(CATEGORY_LABEL).map((c) => [c, by((l) => l.category === c)]));
  const insights = [];
  const [topObj] = top(objections);
  if (topObj) insights.push(`Objeção mais comum: ${topObj[0]} (${topObj[1]}x) — reforça essa informação no contexto/FAQ.`);
  const stalled = by((l) => l.status === 'open' && l.lastBotAt > l.lastCustomerAt && Date.now() - l.lastCustomerAt > 48 * 3600e3);
  if (stalled) insights.push(`${stalled} conversa(s) parada(s) há mais de 48h.`);
  if (total >= 10 && won === 0) insights.push('Ainda sem vendas marcadas: usa "!vendido <número>" para registar conversões e medir o que funciona.');
  return {
    total,
    qualified: by((l) => ['qualified', 'hot', 'ready'].includes(l.category)),
    hot: by((l) => ['hot', 'ready'].includes(l.category)),
    won,
    lost,
    conversionRate: total ? Math.round((won / total) * 1000) / 10 : 0,
    followUpsSent: followed.reduce((n, l) => n + l.followUps.length, 0),
    recovered: by((l) => l.recovered),
    followUpReplyRate: followed.length ? Math.round((followed.filter((l) => l.recovered).length / followed.length) * 100) : 0,
    categories,
    topObjections: top(objections),
    topProducts: top(products),
    insights,
    stages: Object.fromEntries(STAGES.map((s) => [s, by((l) => l.stage === s && l.status === 'open' && !l.declined)])),
    pending: leads
      .filter((l) => l.status === 'open' && !l.declined && l.lastBotAt > l.lastCustomerAt && Date.now() - l.lastCustomerAt > 3600e3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map(row),
    leads: leads
      .sort((a, b) => b.score - a.score || b.lastCustomerAt - a.lastCustomerAt)
      .slice(0, 200)
      .map(row),
  };
}

module.exports = { compute };
