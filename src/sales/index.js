// ELITE SALES & CONVERSION INTELLIGENCE ENGINE (modo business)
// pipeline: sinais determinísticos + análise IA -> memória estruturada -> scoring -> estratégia -> geração -> controlo de qualidade
const fs = require('fs');
const path = require('path');
const config = require('../config');
const brain = require('../brain');
const profiles = require('./profiles');
const signals = require('./signals');
const analyzer = require('./analyzer');
const scoring = require('./scoring');
const strategy = require('./strategy');
const quality = require('./quality');
const policy = require('./policy');
const followup = require('./followup');
const analytics = require('./analytics');

const RULES = `REGRAS DE VENDA (aplica com naturalidade, sem as mencionar):
- Diagnostica antes de recomendar (SPIN): no máximo UMA pergunta por mensagem e só sobre o que ainda não sabes.
- Consultivo/Challenger: recomenda o que serve ao cliente, explica porquê; corrige equívocos com respeito; não concordes com tudo.
- Valor antes de preço: traduz funcionalidades em benefícios (mais clientes, credibilidade, tempo poupado).
- Ética: nunca inventes preços, prazos, descontos, testemunhos, estatísticas, escassez ou urgência. Sem pressão.
- Se o cliente está pronto a comprar, pára de vender e guia o próximo passo.
- WhatsApp: mensagens curtas (2–5 linhas), português natural de Angola, emojis com moderação, sem cumprimentar outra vez.
- Adapta-te ao estilo do cliente (curto → curto; técnico → detalhe; confuso → simples; frustrado → resolver primeiro).`;

function readContext() {
  for (const f of [path.join(config.dataDir, 'context.txt'), config.defaultContextFile]) {
    try {
      const c = f && fs.readFileSync(f, 'utf8');
      if (c && c.trim()) return c;
    } catch {}
  }
  return '';
}

function merge(p, a, det, text) {
  for (const [k, v] of Object.entries(a.facts || {})) if (v && String(v).trim()) p.facts[k === 'name' ? 'name' : k] = String(v).slice(0, 200);
  if (p.facts.name && !p.name) p.name = p.facts.name;
  delete p.facts.name;
  p.products = [...new Set([...p.products, ...(a.products || []).map(String)])].slice(-10);
  if (/\?/.test(text)) p.questions = [...p.questions, text.slice(0, 200)].slice(-10);
  if (a.stage) p.stage = a.stage;
  const now = Date.now();
  const objs = [...(a.objection?.type ? [a.objection] : []), ...det.objections.filter((o) => o.type !== a.objection?.type)];
  for (const o of objs) p.objections.push({ type: o.type, kind: o.kind || '', at: now, resolved: false });
  p.objections = p.objections.slice(-30);
  for (const t of a.resolvedObjections || []) p.objections.filter((o) => o.type === t).forEach((o) => (o.resolved = true));
  p.buyingSignals += det.buyingSignals + (a.intent === 'purchase' ? 1 : 0);
  if (a.style) p.style = a.style;
  if (det.optOut) p.optOut = true;
  if (det.optOut || a.declined || a.intent === 'decline') p.declined = true;
  else if (det.buyingSignals || a.intent === 'purchase' || a.intent === 'quote') p.declined = false;
}

function fallbackAnalysis(det) {
  return {
    intent: det.optOut ? 'decline' : det.buyingSignals ? 'purchase' : 'info',
    objection: det.objections[0] || null,
    declined: det.optOut,
    sentiment: det.frustrated ? 'frustrated' : 'neutral',
    style: 'neutral',
    urgency: 'low',
    facts: {},
    products: [],
  };
}

async function respond({ jid, num, name, text, history }) {
  const p = profiles.get(jid);
  if (num) p.inboundNum = p.num = num;
  if (name && !p.name) p.name = name;
  if (p.followUps.some((f) => f.at > p.lastCustomerAt)) p.recovered = true; // respondeu depois de um follow-up
  p.messages += 1;
  p.lastCustomerAt = Date.now();

  const det = signals.detect(text);
  if (det.deletion) {
    profiles.remove(jid);
    return { reply: 'Feito ✅ Apaguei os teus dados e o histórico desta conversa. Se precisares de nós no futuro, é só escrever.', deleted: true, detected: det };
  }
  let a;
  try {
    a = await analyzer.analyze(history, text, profiles.summary(p));
  } catch (e) {
    a = fallbackAnalysis(det);
    a.error = e.message;
  }
  merge(p, a, det, text);
  const sc = scoring.score(p, a);
  Object.assign(p, { score: sc.score, category: sc.category, scoreReasons: sc.reasons });
  const pol = { ...policy.get(), ...(p.override || {}) }; // o dono pode dar limites por cliente (ex.: desconto máx.)
  const pl = strategy.plan(p, a, det, pol);
  if (p.managed) pl.directives.push(`O dono atribuiu-te este cliente: objectivo "${p.managed.goal || 'concluir a venda'}". Conduz até fechar, recusar ou pedir humano.`);
  if (pl.action === 'respect_decline' && !p.declined && a.objection?.type === 'not_interested') p.declined = true;

  const context = readContext();
  const system = [
    brain.buildSystem(),
    RULES,
    `PERFIL DO CLIENTE (memória):\n${profiles.summary(p)}`,
    `DIRECTIVAS PARA ESTA RESPOSTA:\n- ${pl.directives.join('\n- ')}`,
  ].join('\n\n');
  const msgs = [{ role: 'system', content: system }, ...history.filter((h) => h.role !== 'system' || h === history[history.length - 1]).slice(-14)];
  const lastReply = [...history].reverse().find((h) => h.role === 'assistant')?.content || '';
  const customerText = history.filter((h) => h.role === 'user').map((h) => h.content).join(' | ');

  let reply = await brain.complete({ messages: msgs, temperature: 0.6, max_tokens: 700 });
  let issues = quality.check(reply, { context, policy: pol, profile: p, lastReply, action: pl.action, customerText });
  if (issues.length) {
    const fixed = await brain.complete({
      messages: [...msgs, { role: 'assistant', content: reply }, { role: 'user', content: `[CONTROLO DE QUALIDADE — não é o cliente] Reescreve a tua última resposta corrigindo: ${issues.join('; ')}. Devolve só a nova mensagem.` }],
      temperature: 0.4,
      max_tokens: 700,
    });
    const issues2 = quality.check(fixed, { context, policy: pol, profile: p, lastReply, action: pl.action, customerText });
    if (fixed && issues2.length <= issues.length) {
      reply = fixed;
      issues = issues2;
    }
  }
  reply = quality.toWhatsApp(reply);
  p.lastBotAt = Date.now();
  profiles.save();
  return { reply, analysis: a, detected: det, plan: pl, profile: p, issues };
}

// Mensagem de follow-up contextual (recuperação de venda)
async function composeFollowUp(p, history) {
  const n = p.followUps.filter((f) => f.at > p.lastCustomerAt).length;
  const system = [
    brain.buildSystem(),
    RULES,
    `PERFIL DO CLIENTE:\n${profiles.summary(p)}`,
    `TAREFA: o cliente deixou de responder há ${Math.round((Date.now() - p.lastCustomerAt) / 3600e3)}h. Escreve UM follow-up curto (1–3 linhas), natural, que refira o interesse concreto dele e acrescente valor (uma informação útil ou resolver a dúvida/objeção pendente). ${n >= 1 ? 'Já houve follow-up antes: muda de abordagem e oferece claramente a opção de não receber mais mensagens.' : ''} Sem pressão, sem cumprimentar de novo, sem inventar promoções.`,
  ].join('\n\n');
  const msgs = [{ role: 'system', content: system }, ...history.filter((h) => h.role !== 'system').slice(-10)];
  let msg = await brain.complete({ messages: msgs, temperature: 0.7, max_tokens: 300 });
  const issues = quality.check(msg, { context: readContext(), policy: policy.get(), profile: p });
  if (issues.length) msg = await brain.complete({ messages: [...msgs, { role: 'assistant', content: msg }, { role: 'user', content: `[CONTROLO DE QUALIDADE] Corrige: ${issues.join('; ')}. Devolve só a mensagem.` }], temperature: 0.4, max_tokens: 300 });
  return quality.toWhatsApp(msg);
}

function startFollowUps({ send, getHistory, pushHistory, saveHistories, log }) {
  if (process.env.SALES_FOLLOWUPS === 'off') return;
  const tick = async () => {
    if (!followup.inBusinessHours()) return;
    const eligible = profiles.all().filter(p => p.num && profiles.chatNumber(p) === p.num);
    for (const p of followup.dueLeads(eligible).slice(0, 5)) {
      try {
        const msg = await composeFollowUp(p, getHistory(p.jid));
        if (!msg || !followup.dueLeads([p]).length || profiles.chatNumber(p) !== p.num) continue;
        await send(p.jid, msg);
        pushHistory(p.jid, 'assistant', msg);
        saveHistories();
        p.followUps.push({ at: Date.now(), n: p.followUps.length + 1 });
        p.lastBotAt = Date.now();
        profiles.save();
        log(`follow-up enviado a +${p.num} (${p.category}, ${p.score})`);
      } catch (e) {
        log(`follow-up falhou (+${p.num}): ${e.message}`);
      }
    }
  };
  setInterval(tick, 30 * 60000);
  setTimeout(tick, 60000);
}

function markOutcome(num, status) {
  const p = profiles.findByNum(num);
  if (!p) return null;
  p.status = status;
  const sc = scoring.score(p, {});
  Object.assign(p, { score: sc.score, category: sc.category, scoreReasons: sc.reasons });
  if (status === 'won') p.stage = 'post_sale';
  profiles.save();
  return p;
}

const dashboard = () => analytics.compute(profiles.all());

module.exports = { respond, composeFollowUp, startFollowUps, markOutcome, dashboard, profiles };
