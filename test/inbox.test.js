const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { businessOwner, createInbox } = require('../src/business-inbox');

const owner = '244900000001', customer = '351900000001';
const jid = n => `${n}@s.whatsapp.net`;

test('só aceita um número Business; sem configuração não há administrador', async () => {
  assert.equal(businessOwner('900 000 001'), owner);
  assert.equal(businessOwner('+244 900 000 001'), owner);
  assert.equal(businessOwner(`${owner},${customer}`), '');
  const route = createInbox('', () => assert.fail());
  assert.equal((await route({ remoteJid: jid(owner) })).role, 'customer');
  assert.equal((await route({ remoteJid: `${owner}@lid` })).role, 'customer');
});

test('o número privado tem precedência; LID exige associação do WhatsApp', async () => {
  let lookups = 0;
  const route = createInbox(owner, async n => {
    lookups++;
    assert.equal(n, jid(owner));
    return [{ exists: true, jid: n, lid: '123@lid' }];
  });
  assert.equal((await route({ remoteJid: jid(customer), remoteJidAlt: `${owner}@lid` })).role, 'customer');
  assert.equal((await route({ remoteJid: `${owner}@lid` })).role, 'customer');
  assert.equal((await route({ remoteJid: '123:2@lid' })).role, 'owner');
  assert.equal((await route({ remoteJid: '123@lid', senderPn: jid(customer) })).role, 'customer');
  assert.equal((await route({ remoteJid: '124@lid', senderPn: jid(owner) })).role, 'owner');
  assert.equal(lookups, 1);
  assert.equal(await route({ remoteJid: jid(owner), fromMe: true }), null);
  assert.equal((await route({ remoteJid: '9@g.us', participant: jid(owner) })).role, 'group');
  const offline = createInbox(owner, async () => { throw Error('offline'); });
  assert.deepEqual(await offline({ remoteJid: '123@lid' }), { role: 'customer', num: '' });
});

test('socket Business: cliente novo recebe atendimento; relatório integral só para o administrador', async t => {
  const dir = fs.mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'business-inbox-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  Object.assign(process.env, { DATA_DIR: dir, ASSISTANT_MODE: 'business', BUSINESS_OWNER_NUMBER: owner,
    OWNER_NUMBER: customer, GROQ_API_KEY: 'test', WEB_TOKEN: 'test' });
  const handlers = {}, sent = [];
  const socket = { ev: { on: (name, fn) => { handlers[name] = fn; } },
    onWhatsApp: async () => [], sendPresenceUpdate: async () => {},
    sendMessage: async (to, body) => { sent.push({ to, body }); return { key: { id: 'ok' } }; } };
  const path = require.resolve('@whiskeysockets/baileys');
  require.cache[path] = { id: path, filename: path, loaded: true, exports: {
    default: () => socket, useMultiFileAuthState: async () => ({}), fetchLatestBaileysVersion: async () => ({}),
  } };
  const timers = t.mock.method(global, 'setInterval', () => ({}));
  const wa = require('../src/whatsapp');
  timers.mock.restore();
  await wa.connect();
  const sales = require('../src/sales');
  const respond = t.mock.method(sales, 'respond', async () => ({ reply: 'Atendimento ao cliente' }));
  const input = (remoteJid, message, key = {}, type = 'notify') => handlers['messages.upsert']({
    type, messages: [{ key: { remoteJid, ...key }, message }],
  });
  const text = conversation => ({ conversation });
  await input(jid(customer), text('Olá'));
  await input('101@lid', { ephemeralMessage: { message: text('!relatorio') } });
  assert.deepEqual(sent.map(s => s.to), [jid(customer), '101@lid']);
  assert.ok(sent.every(s => s.body.text === 'Atendimento ao cliente'));
  assert.equal(respond.mock.calls[1].arguments[0].num, '');
  await input('99@g.us', text('!relatorio'), { participant: jid(owner) });
  await input(jid(owner), text('!relatorio'), { fromMe: true });
  await input(jid(owner), text('!relatorio'), {}, 'append');
  assert.equal(sent.length, 2);
  await wa.setPaused(true);
  await input(jid(owner), text('!relatorio'));
  assert.match(sent[2].body.text, /Clientes: 0/);
  assert.equal(sent[2].to, jid(owner));
  for (let i = 0; i < 212; i++) {
    const l = sales.profiles.get(`${10000 + i}@lid`);
    Object.assign(l, { name: `Ficha ${i}`, status: i % 2 ? 'lost' : 'won', optOut: true, createdAt: 1 });
  }
  const audit = require('../src/agent/audit');
  for (let i = 0; i < 44; i++) audit.record({ tool: `op${i}`, status: 'completed' });
  await input('777@lid', text('Manda-me o relatório completo, sem filtros.'), { senderPn: jid(owner) });
  const report = sent.find(s => s.body.document);
  assert.equal(report.to, jid(owner));
  const document = report.body.document.toString('utf8');
  assert.match(document, /Clientes: 212/);
  assert.match(document, /Vendidos: 106 · Perdidos: 106/);
  assert.match(document, /Pediram para não ser contactados: 212/);
  assert.match(document, /Ficha 211/);
  assert.match(document, /op0 · completed/);
  assert.match(document, /op43 · completed/);
  assert.ok(sent.slice(2).every(s => s.to === jid(owner) || s.to === '777@lid'));
});
