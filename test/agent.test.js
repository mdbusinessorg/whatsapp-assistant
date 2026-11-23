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
test('recusa num perfil LID antigo também impede envios ao perfil de telefone', async () => {
  const n='244900033300', phone=`${n}@s.whatsapp.net`;
  lead(phone,{num:n,lastCustomerAt:Date.now()});
  const legacy = lead('900033300@lid',{num:n,optOut:true});
  const before=sent.length;
  for (const flag of ['optOut','declined']) {
    legacy.optOut=false; legacy[flag]=true;
    await assert.rejects(require('../src/sales/service-messages').send(n,'entrega'),/não ser contactado/);
    assert.ok(profiles.contactBlocked(n,phone));
  }
  assert.equal(sent.length,before);
});
test('um filtro não pode redireccionar o envio a outro cliente com o mesmo número no CRM', async () => {
  const num='244900066611';
  lead('244900066600@s.whatsapp.net',{num,name:'FiltroUnico',lastCustomerAt:11,lastBotAt:12});
  lead(`${num}@s.whatsapp.net`,{num,name:'Outro',lastCustomerAt:11});
  const before=sent.length;
  for (const tool of ['broadcast','reply_pending']) {
    const r = await core.execute(tool,{query:'FiltroUnico',template:'entrega'},'envia',true);
    assert.equal(r.result.sent,0);
    assert.equal(r.result.results.length,1);
  }
  assert.equal(sent.length,before);
});
test('editar um número nunca transfere a recusa para outro cliente', async () => {
  for (const [i, suffix] of ['@s.whatsapp.net', '@lid'].entries()) {
    const old = '24490007000'+i, other = '24490007001'+i;
    const blocked = lead(old+suffix, {num:old,optOut:true,lastCustomerAt:1});
    const permitted = lead(other+'@s.whatsapp.net', {num:other,lastCustomerAt:1});
    await core.execute('update_lead',{num:old,new_num:other},'actualiza');
    assert.equal(blocked.num,other);
    assert.ok(profiles.contactBlocked(old, old+'@s.whatsapp.net'));
    assert.ok(!profiles.contactBlocked(other, permitted.jid));
    assert.ok((await require('../src/sales/service-messages').send(other,'entrega')).verified);
  }
});
test('novo pedido de compra supera a recusa comercial antiga, mas nunca um opt-out', async t => {
  const n='244900079990', jid=n+'@s.whatsapp.net';
  const old = lead('990079990@lid',{num:n,inboundNum:n,declined:true,lastCustomerAt:10});
  lead(jid,{num:n,lastCustomerAt:20});
  const service = require('../src/sales/service-messages');
  await assert.rejects(service.send(n,'entrega'),/não ser contactado/);
  const text = 'Quero avançar';
  t.mock.method(require('../src/sales/analyzer'),'analyze',async () => ({intent:'purchase'}));
  t.mock.method(require('../src/brain'),'complete',async () => 'Qual é o produto?');
  const {profile} = await require('../src/sales').respond({jid,num:n,text,history:[{role:'user',content:text}]});
  assert.ok((await service.send(n,'entrega')).verified);
  assert.equal(sent.at(-1).jid,jid);
  old.optOut=true;
  await assert.rejects(service.send(n,'entrega'),/não ser contactado/);
  old.optOut=false; old.declinedAt=profile.renewedInterestAt+1;
  await assert.rejects(service.send(n,'entrega'),/não ser contactado/);
});
test('perguntas de apoio e análise indisponível não anulam a recusa', async t => {
  const n='244900079991', jid=n+'@s.whatsapp.net', text='Quando fica pronto?';
  lead('990079991@lid',{num:n,declined:true,lastCustomerAt:1});
  const analyse=t.mock.method(require('../src/sales/analyzer'),'analyze',async () => ({intent:'support'}));
  t.mock.method(require('../src/brain'),'complete',async () => 'Vou confirmar o estado do pedido.');
  for (const unavailable of [false,true]) {
    if (unavailable) analyse.mock.mockImplementation(async () => {throw Error('indisponível')});
    await require('../src/sales').respond({jid,num:n,text,history:[{role:'user',content:text}]});
    assert.ok(profiles.contactBlocked(n,jid));
  }
});
test('uma recusa repetida por objeção prevalece sobre a compra entre as duas recusas', async t => {
  const n='244900079992', phone=n+'@s.whatsapp.net', lid='990079992@lid';
  const old=lead(lid,{num:n,inboundNum:n,lastCustomerAt:10,declinedAt:10,declined:true});
  lead(phone,{num:n,lastCustomerAt:20,renewedInterestAt:20});
  assert.ok(!profiles.contactBlocked(n,phone));
  t.mock.method(require('../src/sales/analyzer'),'analyze',async () => ({intent:'info',objection:{type:'not_interested'}}));
  t.mock.method(require('../src/brain'),'complete',async () => 'Obrigado por avisares.');
  const text='Não tenho interesse.';
  await require('../src/sales').respond({jid:lid,num:n,text,history:[{role:'user',content:text}]});
  assert.ok(old.declinedAt>20);
  assert.ok(profiles.contactBlocked(n,phone));
});
