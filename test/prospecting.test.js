const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-prospect-'));
process.env.DATA_DIR = dir;
process.env.WEB_TOKEN = process.env.GROQ_API_KEY = 'test';
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
const campaign = require('../src/sales/prospecting');
const permissions = require('../src/agent/permissions');
const catalog = ['clothes','clothes','furniture','computer','books','hairdresser','clothes','computer','gifts'].map((tag,i) =>
  ({ id: 'node-'+i, name: 'Loja de teste '+i, tag, source: 'https://www.openstreetmap.org/node/'+i, region: 'Luanda' }));
const load = async () => catalog;
test('o CRM oferece grupos e categorias individuais antes de prospectar', async () => {
  assert.ok(campaign.status().sectors.includes('computer'));
  await campaign.refreshSectors(load);
  const { sectors, shops, filter } = campaign.status();
  for (const option of ['Tecnologia','computer','gifts']) assert.ok(sectors.includes(option));
  assert.deepEqual(shops,[]);
  assert.equal(filter,'');
});
test('o directório rejeita imóveis vazios e fichas não comerciais', () => {
  const { isRetail } = require('../src/sales/shop-directory');
  for (const tag of ['vacant','no','closed','abandoned',null]) assert.equal(isRetail(tag),false);
  for (const tag of ['computer','gifts','mobile_phone']) assert.equal(isRetail(tag),true);
});

test('todas por defeito, resultados de ramos diferentes, sem envios', async () => {
  const r = await campaign.discover(undefined,load);
  assert.equal(r.count,3);
  assert.equal(r.sent,0);
  assert.equal(new Set(r.shops.map(s=>s.sector)).size,3);
  assert.equal(permissions.level('discover_shops'),'autonomous');
  assert.ok(campaign.status().sectors.includes('gifts'));
  campaign.feedback('node-0','relevant');
});
test('preferências influenciam a ordem sem eliminar os restantes ramos', async () => {
  const r = await campaign.discover('todas',load);
  assert.equal(r.shops[0].id,'node-1');
  assert.ok(r.shops.some(s=>s.sector!=='Moda'));
});
test('aceita filtro explícito e categorias fora dos grupos, sem repetir filiais', async () => {
  const similar = { ...catalog[0], id:'way-55', name:'LOJA DE TESTE 0' };
  const r = await campaign.discover('moda',async()=>[similar,...catalog]);
  assert.deepEqual(r.shops.map(s=>s.id),['node-6']);
  assert.equal((await campaign.discover('moda',load)).count,0);
  assert.equal((await campaign.discover('gifts',load)).shops[0].sector,'gifts');
  assert.equal(campaign.list('Loja de teste 6').length,1);
  await assert.rejects(campaign.discover('',async()=>{throw Error('fonte offline')}), /offline/);
  assert.equal(campaign.status().filter,'gifts');
});
test('pedido privado explícito: verifica ID de mensagem e não reenvia', async () => {
  let sends=0;
  const args={ text:'Quero a proposta Roque Santeiro node-6', jid:'001@s.whatsapp.net',
    send:async (jid,text)=>{sends++;assert.equal(jid,args.jid);assert.match(text,/Loja de teste 6/);return {key:{id:'test-1'}}} };
  assert.equal(await campaign.onRequest({...args,jid:'123@g.us'}),false);
  assert.equal(await campaign.onRequest({...args,text:'Sou uma loja'}),false);
  await campaign.onRequest({...args,blocked:true});
  assert.equal(sends,0);
  await Promise.all([campaign.onRequest(args),campaign.onRequest(args)]);
  assert.equal(sends,1);
  assert.equal(campaign.proposal('node-6').requestsServed,1);
  delete require.cache[require.resolve('../src/sales/prospecting')];
  const restored=require('../src/sales/prospecting');
  await restored.onRequest(args);
  assert.equal(sends,1);
});
test('resultado incerto não conta como envio nem provoca nova tentativa', async () => {
  let sends=0;
  const args={ text:'Quero a proposta Roque Santeiro node-6', jid:'002@lid', send:async()=>{sends++;throw Error('sem rede')} };
  await campaign.onRequest(args);await campaign.onRequest(args);
  assert.equal(sends,1);
  assert.equal(campaign.proposal('node-6').requestsServed,1);
  campaign.feedback('node-6','dismiss');
  await campaign.onRequest({...args,jid:'003@lid'});
  assert.equal(sends,1);
});

test('apagar os dados elimina também hash e recibo do pedido, incluindo via LID', async () => {
  const current = require('../src/sales/prospecting');
  const profiles = require('../src/sales/profiles');
  const jid = '456@lid', num = '244900000000';
  profiles.get(jid).num = num;
  await current.onRequest({text:'Quero a proposta Roque Santeiro node-0', jid, num, send:async()=>({key:{id:'recibo-apagar'}})});
  profiles.remove(jid);
  assert.equal(current.proposal('node-0').requestsServed,0);
  const persisted = fs.readFileSync(path.join(dir,'roque-prospects.json'),'utf8');
  assert.ok(!persisted.includes('recibo-apagar'));
});

test('uma loja de vários ramos aparece em qualquer dos filtros sem duplicação', async () => {
  const { retailTags } = require('../src/sales/shop-directory');
  const tag = 'hairdresser; clothes;no;clothes';
  assert.deepEqual(retailTags(tag), ['hairdresser','clothes']);
  for (const [i, filter] of ['todas','Beleza','Moda','hairdresser','clothes'].entries()) {
    const load = async () => [{ ...catalog[0], id:`way-${70+i}`, name:`Loja mista ${i}`, tag }];
    const r = await campaign.discover(filter, load);
    assert.equal(r.count,1);
    assert.equal(r.shops[0].sector,'Beleza / Moda');
    assert.equal((await campaign.discover('Moda',load)).count,0);
  }
});
