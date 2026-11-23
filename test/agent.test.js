process.env.GROQ_API_KEY ||= 'test';
process.env.WEB_TOKEN ||= 'test';
process.env.ASSISTANT_MODE = 'business';
process.env.OWNER_NUMBER = '244926115429';
process.env.DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'wa-test-'));
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

// WhatsApp simulado: regista mensagens "enviadas"
const sent = [];
const waPath = path.join(__dirname, '..', 'src', 'whatsapp.js');
require.cache[waPath] = { id: waPath, filename: waPath, loaded: true, exports: {
  send: async (jid, text) => (sent.push({ jid, text }), { key: { id: 'MSG' + sent.length } }),
  status: () => ({ paused: false }), setPaused: async () => {}, log: () => {},
} };
const profiles = require('../src/sales/profiles');
const core = require('../src/agent/core');
const permissions = require('../src/agent/permissions');

const lead = (jid, o) => Object.assign(profiles.get(jid), o);
lead('a@s.whatsapp.net', { num: '244911111111', name: 'Ana', score: 70, category: 'hot', lastCustomerAt: Date.now() - 30 * 3600e3, lastBotAt: Date.now() - 29 * 3600e3, products: ['Landing Page Comercial'] });
lead('b@s.whatsapp.net', { num: '244922222222', name: 'Bruno', score: 20, category: 'developing', optOut: true, lastCustomerAt: Date.now() - 50 * 3600e3, lastBotAt: Date.now() - 49 * 3600e3 });
profiles.save();

test('permissões configuráveis', () => {
  assert.strictEqual(permissions.level('search_leads'), 'autonomous');
  assert.strictEqual(permissions.level('assign_lead'), 'limits');
  assert.strictEqual(permissions.level('delete_lead'), 'approval');
  assert.strictEqual(permissions.level('ferramenta_nova'), 'approval');
});

test('ferramentas autónomas executam e verificam', async () => {
  const r = await core.execute('search_leads', { query: 'landing' }, 'procura');
  assert.strictEqual(r.status, 'completed');
  assert.strictEqual(r.result.count, 1);
  const u = await core.execute('update_lead', { num: '244911111111', priority: true, note: 'cliente VIP' }, 'marca prioritário');
  assert.strictEqual(u.status, 'completed');
  assert.ok(profiles.findByNum('244911111111').priority);
  const m = await core.execute('send_message', { num: '244911111111', text: 'Olá Ana' }, 'envia');
  assert.strictEqual(m.result.verified, true);
  assert.strictEqual(sent.at(-1).jid, '244911111111@s.whatsapp.net');
});

test('opt-out é respeitado pelas ferramentas', async () => {
  const r = await core.execute('send_message', { num: '244922222222', text: 'promo' }, 'envia');
  assert.strictEqual(r.status, 'failed');
  assert.match(r.error, /não ser contactado/);
});

test('limites: desconto acima do limite pede aprovação; dentro do limite executa', async () => {
  const over = await core.execute('assign_lead', { num: '244911111111', max_discount_pct: 25 }, 'negocia');
  assert.strictEqual(over.status, 'waiting_approval');
  assert.strictEqual(core.status().pending.tool, 'assign_lead');
  const ok = await core.execute('assign_lead', { num: '244911111111', max_discount_pct: 10, goal: 'fechar landing' }, 'assume');
  assert.strictEqual(ok.status, 'completed');
  assert.strictEqual(profiles.findByNum('244911111111').override.maxDiscountPct, 10);
});

test('aprovação: "sim" executa a acção pendente; "não" cancela', async () => {
  await core.execute('delete_lead', { num: '244922222222' }, 'apaga o bruno');
  assert.strictEqual(core.status().pending.tool, 'delete_lead');
  const out = await core.run('não');
  assert.match(out, /cancelado/);
  assert.ok(profiles.findByNum('244922222222'));
  await core.execute('delete_lead', { num: '244922222222' }, 'apaga o bruno');
  const out2 = await core.run('sim');
  assert.match(out2, /Feito/);
  assert.ok(!profiles.findByNum('244922222222'));
});

test('auditoria regista cada acção com estado', () => {
  const st = core.status().audit.map((e) => e.status);
  for (const s of ['completed', 'failed', 'waiting_approval', 'cancelled']) assert.ok(st.includes(s), s);
});

test('o modelo privilegiado não recebe nomes, rascunhos nem resultados externos', async () => {
  const pipeline = require('../src/sales/prospecting');
  await pipeline.discover('', async () => [{id:'node-910',name:'Etiqueta externa de teste',tag:'computer',region:'Luanda',source:'https://www.openstreetmap.org/node/910'}]);
  const api = require('../src/brain').groq.chat.completions;
  const original = api.create;
  const contexts = [];
  api.create = async ({messages}) => {
    contexts.push(JSON.stringify(messages));
    return { choices: [{ message: contexts.length === 1 ? { tool_calls: [{function:{name:'list_shops',arguments:'{}'}}] } : {content:'Ok'} }] };
  };
  try {
    assert.match(await core.run('Lista as lojas'), /Etiqueta externa de teste/);
    await core.run('Qual era o ID?');
    assert.equal(contexts.length, 2);
    assert.match(contexts[1], /node-910/);
    assert.doesNotMatch(contexts.join(''), /Etiqueta externa de teste/);
  } finally { api.create = original; }
});
