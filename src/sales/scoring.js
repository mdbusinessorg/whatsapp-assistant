// Lead scoring 0–100 explicável. Só usa sinais da conversa (nunca características pessoais sensíveis).
const STAGE_PTS = {
  initial_contact: 0, discovery: 5, qualification: 10, recommendation: 15,
  value_presentation: 15, objection_handling: 15, conversion: 25, confirmation: 30, post_sale: 30,
};
const INTENT_PTS = { purchase: 25, quote: 20, info: 8, support: 5, browsing: 0, decline: -30, other: 0 };

function score(p, a = {}) {
  const reasons = [];
  let s = 0;
  const add = (n, why) => {
    if (!n) return;
    s += n;
    reasons.push(`${n > 0 ? '+' : ''}${n} ${why}`);
  };
  add(INTENT_PTS[a.intent] || 0, `intenção: ${a.intent || 'n/d'}`);
  add(Math.min(p.buyingSignals, 3) * 8, `sinais de compra (${p.buyingSignals})`);
  add(STAGE_PTS[p.stage] || 0, `estágio: ${p.stage}`);
  add(Math.min(p.messages, 6) * 2, `envolvimento (${p.messages} mensagens)`);
  const facts = ['need', 'businessType', 'budget', 'deadline'].filter((k) => p.facts[k]);
  add(facts.length * 4, `qualificação (${facts.join(', ') || 'nenhum dado'})`);
  if (p.products.length) add(6, `interesse em ${p.products.slice(0, 2).join(', ')}`);
  if (a.urgency === 'high') add(10, 'urgência alta');
  else if (a.urgency === 'medium') add(4, 'alguma urgência');
  const open = p.objections.filter((o) => !o.resolved).length;
  if (open) add(-5 * Math.min(open, 3), `${open} objeção(ões) por resolver`);
  if (p.declined) add(-40, 'cliente recusou');
  if (p.status === 'won') {
    s = 100;
    reasons.push('venda fechada');
  }
  s = Math.max(0, Math.min(100, Math.round(s)));
  const category = p.status === 'won' || s >= 80 ? 'ready' : s >= 60 ? 'hot' : s >= 40 ? 'qualified' : s >= 20 ? 'developing' : 'cold';
  return { score: s, category, reasons };
}

const CATEGORY_LABEL = { cold: 'Frio', developing: 'Em desenvolvimento', qualified: 'Qualificado', hot: 'Quente', ready: 'Pronto a comprar' };

module.exports = { score, CATEGORY_LABEL };
