// Compreensão da conversa: intenção, estágio, objeção, sinais, estilo e factos — numa chamada JSON curta a um modelo rápido.
const brain = require('../brain');
const { OBJECTION_TYPES } = require('./signals');

const STAGES = ['initial_contact', 'discovery', 'qualification', 'recommendation', 'value_presentation', 'objection_handling', 'conversion', 'confirmation', 'post_sale'];

const SYSTEM = `És o analista de vendas de um agente de WhatsApp em Angola. Analisa a ÚLTIMA mensagem do cliente no contexto da conversa e devolve APENAS JSON:
{"intent":"purchase|quote|info|support|browsing|decline|other",
"stage":"${STAGES.join('|')}",
"sentiment":"positive|neutral|negative|frustrated",
"style":"brief|neutral|technical|confused|enthusiastic",
"urgency":"low|medium|high",
"objection":{"type":"${OBJECTION_TYPES.join('|')}","kind":"genuine|emotional|financial|informational|trust|polite_refusal"} ou null,
"declined":bool (recusa clara ou pedido para não contactar),
"asksDiscount":bool,
"products":["planos/serviços mencionados"],
"facts":{"name":"","businessType":"","need":"","budget":"","deadline":"","location":""},
"resolvedObjections":["tipos de objeções anteriores que esta mensagem resolve"]}
Regras: identifica a objeção real por trás das palavras ("vou pensar" pode ser preço ou confiança). Factos só se o cliente os disse; senão "". Português de Angola (kumbu/guita = dinheiro, bué = muito).`;

async function analyze(history, text, profileSummary) {
  const convo = history
    .filter((h) => h.role !== 'system')
    .slice(-8)
    .map((h) => `${h.role === 'user' ? 'Cliente' : 'Agente'}: ${h.content.slice(0, 400)}`)
    .join('\n');
  const out = await brain.complete({
    model: process.env.SALES_ANALYZER_MODEL || 'openai/gpt-oss-20b',
    json: true,
    temperature: 0,
    max_tokens: 900,
    reasoning: 'low',
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Perfil conhecido:\n${profileSummary || '(novo)'}\n\nConversa:\n${convo}\n\nÚLTIMA mensagem do cliente: ${text}` },
    ],
  });
  const a = JSON.parse(out);
  if (!STAGES.includes(a.stage)) delete a.stage;
  if (a.objection && !OBJECTION_TYPES.includes(a.objection.type)) a.objection = null;
  return a;
}

module.exports = { analyze, STAGES };
