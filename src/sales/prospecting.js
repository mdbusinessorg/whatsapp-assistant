const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const directory = require('./shop-directory');
const { fold, sector, retailTags } = directory;
const sectorsOf = s => [...new Set(retailTags(s.tag).map(sector))];

const file = path.join(config.dataDir, 'roque-prospects.json');
let state = { shops: [], selected: [], filter: '', sectors: [] };
if (fs.existsSync(file)) state = { ...state, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
function save() {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(state));
  fs.renameSync(file + '.tmp', file);
}
const find = id => state.shops.find(s => s.id === id);
const draft = s => s.proposal || `Bom dia, equipa ${s.name}. Sou o Matias Domingos, da MD Business. Gostaríamos de convidar a vossa loja a apresentar uma pequena selecção de produtos no Roque Santeiro, um mercado digital para lojas angolanas. Podemos mostrar-vos como ficaria a vossa montra com três artigos à vossa escolha?\n\nDemonstração: https://roque-santeiro-express.netlify.app/\nMatias Domingos | MD Business`;
const summary = s => ({ id: s.id, name: s.name, sector: sectorsOf(s).join(' / '), region: s.region, source: s.source,
  proposal: draft(s), feedback: s.feedback || '', requestsServed: Object.values(s.requests || {}).filter(v => v.status === 'accepted').length });
const status = () => ({ filter: state.filter, shops: state.selected.map(find).filter(Boolean).map(summary),
  sectors: [...new Set([...Object.keys(directory.groups), ...Object.values(directory.groups).flat(), ...state.sectors.filter(directory.isRetail)])].sort((a, b) => a.localeCompare(b, 'pt')) });

const tags = entries => [...new Set(entries.flatMap(s => retailTags(s.tag)))].sort();
async function refreshSectors(load = directory.shops) {
  const next = tags(await load());
  if (JSON.stringify(next) !== JSON.stringify(state.sectors)) { state.sectors = next; save(); }
}

const newSelection = () => ({ filters: new Set(), ids: [] });
async function discover(filter = '', load = directory.shops, selection = newSelection()) {
  const key = fold(filter);
  const all = ['', 'all', 'todas', 'todas as lojas'].includes(key);
  const entries = await load();
  const known = new Set(state.shops.map(s => fold(s.name)));
  const knownIds = new Set(state.shops.map(s => s.id));
  const weights = new Map();
  for (const s of state.shops) {
    for (const category of sectorsOf(s)) weights.set(category, (weights.get(category) || 0) + ({ relevant: 1, dismiss: -1 }[s.feedback] || 0));
  }
  const candidates = entries.map(shop => {
    const matched = retailTags(shop.tag).filter(t => all || fold(t) === key || fold(sector(t)) === key);
    const sectors = [...new Set(matched.map(sector))];
    return { shop, sectors, weight: Math.max(...sectors.map(v => weights.get(v) || 0)) };
  }).filter(c => c.sectors.length);
  candidates.sort((a,b) => b.weight - a.weight);
  const chosen = [], used = new Set();
  function select(diversify) {
    for (const { shop: s, sectors } of candidates) {
      if (chosen.length === 3) break;
      if (knownIds.has(s.id) || known.has(fold(s.name)) || (diversify && sectors.every(v => used.has(v)))) continue;
      chosen.push(s); sectors.forEach(v => used.add(v)); known.add(fold(s.name));
      knownIds.add(s.id);
    }
  }
  select(all); select(false);
  state.shops.push(...chosen);
  selection.filters.add(all ? '' : String(filter));
  selection.ids.push(...chosen.map(s => s.id));
  state.filter = selection.filters.has('') ? '' : [...selection.filters].join(' / ');
  state.selected = [...selection.ids];
  state.sectors = tags(entries);
  save();
  return { count: chosen.length, shops: chosen.map(summary), sent: 0 };
}
function feedback(id, value) {
  const s = find(id);
  if (!s || !['relevant','dismiss','neutral'].includes(value)) throw new Error('Loja ou avaliação inválida.');
  s.feedback = value;
  save();
  return { verified: true, id, feedback: value };
}
function proposal(id) {
  const s = find(id);
  if (!s) throw new Error('Loja não encontrada nesta campanha.');
  return summary(s);
}
function list(query = '') {
  const rows = state.shops.filter(s => fold(`${s.name} ${s.id} ${s.tag} ${sectorsOf(s).join(' ')}`).includes(fold(query)));
  return rows.slice(-20).map(s => ({ id: s.id, name: s.name, sector: sectorsOf(s).join(' / '), feedback: s.feedback || '' }));
}

// A pesquisa não recolhe números. O único destinatário é o chat privado que pediu este texto.
const chatKey = jid => crypto.createHash('sha256').update(jid).digest('hex');
function forgetChat(jid, num) {
  const keys = [chatKey(jid)];
  if (num) keys.push(chatKey(`${num}@s.whatsapp.net`));
  let changed = false;
  for (const s of state.shops) for (const key of keys) {
    if (s.requests?.[key]) { delete s.requests[key]; changed = true; }
  }
  if (changed) save();
}
async function onRequest({ text, jid, num, blocked, send }) {
  const match = /^quero a proposta roque santeiro ([a-z0-9-]{1,64})$/i.exec(text.trim());
  if (!match || !/@(s\.whatsapp\.net|lid)$/.test(jid)) return false;
  const s = find(match[1].toLowerCase());
  if (!s || blocked || s.feedback === 'dismiss') return true;
  const key = chatKey(num ? `${num}@s.whatsapp.net` : jid);
  s.requests ||= {};
  if (s.requests[key]) return true;
  const request = s.requests[key] = { at: Date.now(), status: 'pending' };
  save(); // reserva antes de enviar: reconexão/duplicado não repete uma entrega incerta
  try {
    const msg = await send(jid, draft(s));
    request.status = msg?.key?.id ? 'accepted' : 'unverified';
    if (msg?.key?.id) request.messageId = msg.key.id;
  } catch {
    request.status = 'unverified';
  }
  save();
  require('../agent/audit').record({ instruction: 'Pedido de proposta no chat de origem', tool: 'shop_proposal',
    args: { shop: s.id }, status: request.status === 'accepted' ? 'completed' : 'unverified' });
  return true;
}

module.exports = { status, discover, newSelection, refreshSectors, feedback, proposal, list, onRequest, forgetChat };
