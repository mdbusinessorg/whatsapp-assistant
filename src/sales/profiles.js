// Memória estruturada por cliente (modo business): factos, estágio, objeções, score e follow-ups.
const fs = require('fs');
const path = require('path');
const config = require('../config');

const FILE = path.join(config.dataDir, 'leads.json');
let leads = {};
try {
  leads = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch {}

function blank(jid) {
  return {
    jid,
    num: '',
    name: '',
    facts: {}, // businessType, need, budget, deadline, location, preferences…
    products: [], // produtos/planos discutidos
    questions: [], // perguntas feitas (últimas)
    objections: [], // {type, kind, at, resolved}
    stage: 'initial_contact',
    status: 'open', // open | won | lost
    style: 'neutral',
    score: 0,
    category: 'cold',
    scoreReasons: [],
    buyingSignals: 0,
    messages: 0,
    lastCustomerAt: 0,
    lastBotAt: 0,
    optOut: false,
    declined: false,
    followUps: [], // {at, n}
    recovered: false,
    usedStrategies: [],
    createdAt: Date.now(),
  };
}

const get = (jid) => (leads[jid] = leads[jid] || blank(jid));
const all = () => Object.values(leads);
const save = () => {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE + '.tmp', JSON.stringify(leads));
  fs.renameSync(FILE + '.tmp', FILE);
};
const remove = (jid) => {
  require('./prospecting').forgetChat(jid, leads[jid]?.num);
  delete leads[jid];
  save();
};
const findByNum = (num) => all().find((l) => l.num === String(num).replace(/\D/g, ''));
const chatNumber = p => {
  const m = /^(\d+)(?::\d+)?@(s\.whatsapp\.net|lid)$/.exec(p.jid);
  return m && (m[2] === 'lid' ? p.inboundNum : m[1]);
};
// Nos LID antigos o número guardado só pode bloquear contacto, nunca autorizá-lo.
const suppressionNumber = p => chatNumber(p) || (/^\d+(?::\d+)?@lid$/.test(p.jid) ? (p.legacyNum ?? p.num) : '');
const editNumber = (p, num) => {
  if (p.legacyNum == null && !chatNumber(p)) p.legacyNum = p.num;
  p.num = num;
};
const inboundByNum = (num, jid) => {
  const n = String(num || '').replace(/\D/g, '');
  const candidates = jid == null ? all() : [leads[jid]];
  return n && candidates.filter(p => p && p.num === n && p.lastCustomerAt && chatNumber(p) === n)
    .sort((a, b) => b.lastCustomerAt - a.lastCustomerAt)[0];
};
const contactBlocked = (num, jid) => {
  const n = String(num || '').replace(/\D/g, '');
  const current = leads[jid];
  const renewedAt = current && chatNumber(current) === n ? current.renewedInterestAt || 0 : 0;
  return all().some(p => (p.jid === jid || (n && suppressionNumber(p) === n)) &&
    (p.optOut || (p.declined && (p.jid === jid || (p.declinedAt ?? p.lastCustomerAt ?? 0) >= renewedAt))));
};

// Resumo compacto para o prompt (em vez de reenviar tudo)
function summary(p) {
  const f = Object.entries(p.facts)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
  const openObj = p.objections.filter((o) => !o.resolved).map((o) => o.type);
  return [
    p.name && `Nome: ${p.name}`,
    f && `Factos já recolhidos (NÃO voltes a perguntar): ${f}`,
    p.products.length && `Produtos/planos discutidos: ${p.products.join(', ')}`,
    `Estágio: ${p.stage} · Lead: ${p.category} (${p.score}/100)`,
    openObj.length && `Objeções por resolver: ${[...new Set(openObj)].join(', ')}`,
    p.status !== 'open' && `Estado da venda: ${p.status}`,
    p.style !== 'neutral' && `Estilo do cliente: ${p.style}`,
  ]
    .filter(Boolean)
    .join('\n');
}

module.exports = { get, all, save, remove, findByNum, inboundByNum, chatNumber, editNumber, contactBlocked, summary, blank };
