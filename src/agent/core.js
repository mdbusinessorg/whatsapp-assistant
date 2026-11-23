// AUTONOMOUS EXECUTION & INTELLIGENCE CORE — o dono dá ordens em linguagem natural (texto ou voz);
// o modelo escolhe ferramentas, o motor verifica permissões, executa, verifica e reporta. Memória da tarefa persistente.
const fs = require('fs');
const path = require('path');
const config = require('../config');
const brain = require('../brain');
const { T, schemas } = require('./tools');
const permissions = require('./permissions');
const audit = require('./audit');

const FILE = path.join(config.dataDir, 'agent-state.json');
let S = { memory: [], pending: null, chat: [] };
try {
  S = { ...S, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
} catch {}
const save = () => fs.writeFileSync(FILE, JSON.stringify(S));

const MODELS = [process.env.AGENT_MODEL || config.chatModel, ...(process.env.AGENT_FALLBACK_MODELS || 'openai/gpt-oss-20b').split(',')].filter(Boolean);

const SYSTEM = () => `És o agente executivo da ${config.businessName}, às ordens do dono (${config.ownerName === 'Joel' ? 'Matias' : config.ownerName}). Ele fala contigo por WhatsApp (texto ou voz, português de Angola).
Como trabalhas:
- Percebe o objectivo, identifica os clientes/alvos (usa a memória da conversa para "esse cliente", "o segundo", "os de ontem") e EXECUTA com as ferramentas. Não peças confirmação para passos óbvios.
- Se houver vários alvos possíveis e a ordem for ambígua, pergunta só o essencial.
- Nunca inventes clientes, pagamentos, entregas ou resultados: só reportas o que as ferramentas devolveram. Se verified=false ou erro, diz que falhou.
- Para mensagens a clientes, prefere reply_pending/assign_lead (o motor de vendas personaliza). send_message só com texto já claro.
- Se uma acção ficar "waiting_approval", explica em 1 frase o que vai acontecer e pede "sim" para confirmar.
- Anúncios/Meta Ads ainda não estão ligados: diz isso se te pedirem.
- No fim, resume em poucas linhas o que foi feito (números concretos), em português, sem markdown pesado. Hoje: ${new Date(Date.now() + 3600e3).toISOString().slice(0, 16).replace('T', ' ')} (Luanda).`;

async function callModel(messages) {
  let last;
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await brain.groq.chat.completions.create({ model, messages, tools: schemas(), tool_choice: 'auto', temperature: 0.2, max_tokens: 1500 });
        return res.choices[0].message;
      } catch (e) {
        last = e;
        if (e.status === 429) await new Promise((r) => setTimeout(r, 4000));
        else break;
      }
    }
  }
  throw last;
}

async function execute(name, args, instruction, approved = false) {
  const t = T[name];
  if (!t) return { status: 'failed', error: `ferramenta desconhecida: ${name}` };
  const lvl = permissions.level(name);
  const over = t.checkLimits?.(args);
  if (!approved && (lvl === 'approval' || over)) {
    S.pending = { tool: name, args, reason: over || 'requer aprovação', instruction, at: Date.now() };
    save();
    audit.record({ instruction, tool: name, args, level: lvl, status: 'waiting_approval', reason: S.pending.reason });
    return { status: 'waiting_approval', reason: S.pending.reason };
  }
  const t0 = Date.now();
  try {
    const result = await t.run(args || {});
    const verified = result?.verified !== false;
    audit.record({ instruction, tool: name, args, level: lvl, status: verified ? 'completed' : 'unverified', ms: Date.now() - t0, result: JSON.stringify(result).slice(0, 600), approved });
    return { status: verified ? 'completed' : 'unverified', result };
  } catch (e) {
    audit.record({ instruction, tool: name, args, level: lvl, status: 'failed', error: e.message, ms: Date.now() - t0 });
    return { status: 'failed', error: e.message };
  }
}

function trim() {
  S.memory = S.memory.slice(-30);
  while (S.memory.length && S.memory[0].role !== 'user') S.memory.shift();
}

// conversa visível no CRM (ordens e respostas, sem detalhes das ferramentas)
async function run(text, via = 'whatsapp') {
  S.chat = [...(S.chat || []), { role: 'user', text, via, at: Date.now() }].slice(-60);
  let reply;
  try {
    reply = await runInner(text);
  } catch (e) {
    reply = `⚠️ Erro: ${e.message}`;
  }
  S.chat = [...S.chat, { role: 'assistant', text: reply, at: Date.now() }].slice(-60);
  save();
  return reply;
}

async function runInner(text) {
  // aprovação pendente
  if (S.pending && Date.now() - S.pending.at < 30 * 60000) {
    if (/^\s*(sim|confirmo|confirma|ok|pode|avan[çc]a|aprovado|faz)\b/i.test(text)) {
      const p = S.pending;
      S.pending = null;
      save();
      const r = await execute(p.tool, p.args, p.instruction, true);
      S.memory.push({ role: 'user', content: text }, { role: 'assistant', content: `Executei ${p.tool} após aprovação: ${JSON.stringify(r).slice(0, 800)}` });
      trim();
      save();
      return r.status === 'completed' ? `✅ Feito (${p.tool}).\n${summarize(r.result)}` : `⚠️ ${p.tool}: ${r.status}${r.error ? ` — ${r.error}` : ''}`;
    }
    if (/^\s*(n[ãa]o|cancela|esquece)\b/i.test(text)) {
      audit.record({ instruction: S.pending.instruction, tool: S.pending.tool, args: S.pending.args, status: 'cancelled' });
      S.pending = null;
      save();
      return 'Ok, cancelado.';
    }
  }
  S.memory.push({ role: 'user', content: text });
  for (let i = 0; i < 8; i++) {
    const msg = await callModel([{ role: 'system', content: SYSTEM() }, ...S.memory]);
    const calls = msg.tool_calls || [];
    S.memory.push({ role: 'assistant', content: msg.content || '', ...(calls.length ? { tool_calls: calls } : {}) });
    if (!calls.length) {
      trim();
      save();
      return require('../sales/quality').toWhatsApp(msg.content || '✅');
    }
    for (const c of calls) {
      let args = {};
      try {
        args = JSON.parse(c.function.arguments || '{}');
      } catch {}
      const r = await execute(c.function.name, args, text);
      S.memory.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(r).slice(0, 3000) });
    }
    save();
  }
  trim();
  save();
  return 'Executei vários passos mas não terminei — diz-me se queres que continue.';
}

function summarize(r) {
  if (!r) return '';
  if (r.sent != null) return `Mensagens enviadas: ${r.sent}`;
  if (r.verified != null) return r.verified ? 'Verificado.' : 'Não verificado.';
  return '';
}

const status = () => ({ pending: S.pending, audit: audit.recent(40), chat: (S.chat || []).slice(-40), models: MODELS, tools: Object.keys(T) });

module.exports = { run, execute, status };
