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
let paused = false;
const waPath = path.join(__dirname, '..', 'src', 'whatsapp.js');
require.cache[waPath] = { id: waPath, filename: waPath, loaded: true, exports: {
  send: async (jid, text) => (sent.push({ jid, text }), { key: { id: 'MSG' + sent.length } }),
  status: () => ({ paused }), setPaused: async value => { paused = value; }, log: () => {},
} };
const profiles = require('../src/sales/profiles');
const core = require('../src/agent/core');
const permissions = require('../src/agent/permissions');

const lead = (jid, o) => Object.assign(profiles.get(jid), o);
lead('244911111111@s.whatsapp.net', { num: '244911111111', name: 'Ana', score: 70, category: 'hot', lastCustomerAt: Date.now() - 30 * 3600e3, lastBotAt: Date.now() - 29 * 3600e3, products: ['Landing Page Comercial'] });
lead('244922222222@s.whatsapp.net', { num: '244922222222', name: 'Bruno', score: 20, category: 'developing', optOut: true, lastCustomerAt: Date.now() - 50 * 3600e3, lastBotAt: Date.now() - 49 * 3600e3 });
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
  const m = await core.execute('send_message', { num: '244911111111', template: 'entrega' }, 'envia');
  assert.strictEqual(m.result.verified, true);
  assert.strictEqual(sent.at(-1).jid, '244911111111@s.whatsapp.net');
});

test('opt-out é respeitado pelas ferramentas', async () => {
  const r = await core.execute('send_message', { num: '244922222222', template: 'entrega' }, 'envia');
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
test('só os modelos fixos passam em ordens de envio, mesmo com aprovação', async () => {
  const recipient = '244911111111';
  const before = sent.length;
  const args = { num:recipient, text:'Gostariam de pôr os vossos produtos na nossa plataforma?' };
  for (const tool of ['send_message','broadcast']) {
    for (const a of [args,{...args,template:'entrega'},{template:'constructor'}]) {
      assert.equal((await core.execute(tool,a,'envia',true)).status,'failed');
    }
  }
  assert.equal((await core.execute('send_message',{num:'244900088877',template:'entrega'},'envia')).status,'failed');
  assert.equal(sent.length,before);
  assert.equal((await core.execute('send_message',{num:recipient,template:'entrega'},'envia')).status,'completed');
  assert.equal(sent.at(-1).text,require('../src/sales/service-messages').templates.entrega);
});
test('uma ordem mista executa todas as ferramentas sem expor fichas ao modelo', async () => {
  const api = require('../src/brain').groq.chat.completions;
  const original = api.create;
  const contexts = [];
  api.create = async ({messages}) => {
    contexts.push(JSON.stringify(messages));
    return { choices: [{ message: contexts.length === 1 ? { tool_calls: [
      { id:'listar', type:'function', function:{name:'list_shops',arguments:'{}'} },
      { id:'pausar', type:'function', function:{name:'set_bot_paused',arguments:'{"paused":true}'} }
    ] } : {content:'Bot pausado.'} }] };
  };
  try {
    const reply = await core.run('Lista as lojas e pausa o bot');
    assert.equal(paused,true);
    assert.match(reply,/Etiqueta externa de teste/);
    assert.match(reply,/Bot pausado/);
    assert.match(contexts[1],/node-910/);
    assert.doesNotMatch(contexts.join(''),/Etiqueta externa de teste/);
  } finally { api.create = original; paused = false; }
});
test('alterar o número no CRM não autoriza enviar ao chat antigo nem ao novo', async () => {
  const service = require('../src/sales/service-messages');
  const first = '244900012340', next = '244900012341', jid = '9012340@lid';
  lead(jid,{num:first,inboundNum:first,lastCustomerAt:Date.now()});
  await core.execute('update_lead',{num:first,new_num:next},'corrige o número');
  const before = sent.length;
  await assert.rejects(service.send(next,'entrega'), /conversa privada/);
  assert.equal(sent.length,before);
  lead(`${next}@s.whatsapp.net`,{num:next,lastCustomerAt:Date.now()});
  await service.send(next,'entrega');
  assert.equal(sent.at(-1).jid,`${next}@s.whatsapp.net`);
});

test('duas pesquisas na mesma ordem conservam todas as fichas na selecção do CRM', async t => {
  const dir = require('../src/sales/shop-directory');
  t.mock.method(dir, 'shops', async () => [
    {id:'node-980',name:'Loja A',tag:'clothes'}, {id:'node-981',name:'Loja B',tag:'books'}]);
  const api = require('../src/brain').groq.chat.completions;
  t.mock.method(api, 'create', async () => ({choices:[{message:{tool_calls:['Moda','Papelaria'].map((sector,i) =>
    ({id:'s'+i,type:'function',function:{name:'discover_shops',arguments:JSON.stringify({sector})}}))}}]}));
  await core.run('Procura lojas de moda e papelarias');
  const { shops, filter } = core.status().prospecting;
  assert.deepEqual(shops.map(s => s.id), ['node-980','node-981']);
  assert.equal(filter,'Moda / Papelaria');
  await core.run('Pesquisar lojas: moda');
  assert.deepEqual(core.status().prospecting.shops, []);
});
test('um acompanhamento manual adia o automático mesmo num pedido antigo', async () => {
  const { dueLeads } = require('../src/sales/followup');
  const n = '244900099999', h = 3600e3, now = Date.now();
  const p = lead(`${n}@s.whatsapp.net`,{num:n,score:70,lastCustomerAt:now-200*h,lastBotAt:now-199*h});
  assert.equal(dueLeads([p]).length,1);
  const r = await core.execute('send_message',{num:n,template:'acompanhamento'},'acompanha');
  assert.equal(r.status,'completed');
  assert.equal(p.followUps.length,1);
  assert.equal(dueLeads([p],p.lastBotAt+30*60000).length,0);
  assert.equal(dueLeads([p],p.lastBotAt+48*h).length,1);
});
