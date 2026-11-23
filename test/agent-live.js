// Teste real do agente do dono com a Groq (WhatsApp simulado): node test/agent-live.js
process.env.WEB_TOKEN ||= 'sim';
process.env.ASSISTANT_MODE = 'business';
process.env.OWNER_NUMBER = '244926115429';
process.env.DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'wa-agent-'));
const path = require('path');
const sent = [];
const waPath = path.join(__dirname, '..', 'src', 'whatsapp.js');
let paused = false;
require.cache[waPath] = { id: waPath, filename: waPath, loaded: true, exports: {
  send: async (jid, text) => (sent.push({ jid, text }), { key: { id: 'MSG' + sent.length } }),
  status: () => ({ paused }), setPaused: async (p) => (paused = p), log: () => {},
} };
const profiles = require('../src/sales/profiles');
const st = require('../src/state');
const core = require('../src/agent/core');
const H = 3600e3, now = Date.now();
const seed = (jid, o, msgs) => { Object.assign(profiles.get(jid), o); msgs.forEach(([r, c]) => st.pushHistory(jid, r, c)); };
seed('244911111111@s.whatsapp.net', { num: '244911111111', name: 'Ana', score: 68, category: 'hot', stage: 'objection_handling', facts: { businessType: 'loja de roupa', need: 'vender online' }, products: ['Landing Page Comercial'], objections: [{ type: 'price', resolved: false }], lastCustomerAt: now - 30 * H, lastBotAt: now - 29 * H, messages: 4 },
  [['user', 'Quanto custa a landing page comercial?'], ['assistant', 'A Landing Page Comercial custa 25.000 Kz e inclui integração WhatsApp.'], ['user', 'Está caro, vou pensar'], ['assistant', 'Entendo! Há alguma dúvida que possa esclarecer?']]);
seed('244922222222@s.whatsapp.net', { num: '244922222222', name: 'Bruno', score: 35, category: 'developing', stage: 'discovery', products: ['Website Profissional'], lastCustomerAt: now - 80 * H, lastBotAt: now - 79 * H, messages: 2 },
  [['user', 'Fazem websites?'], ['assistant', 'Sim! O Website Profissional custa 40.000 Kz. Para que negócio é?']]);
seed('244933333333@s.whatsapp.net', { num: '244933333333', name: 'Carla', score: 90, category: 'ready', stage: 'conversion', lastCustomerAt: now - 1 * H, lastBotAt: now - 0.9 * H, messages: 6 }, [['user', 'Quero avançar, aceitam Multicaixa?']]);
profiles.save();
st.saveHistories();

const ORDERS = [
  'Procura os leads que ainda não responderam',
  'Marca a Ana como prioritária',
  'Assume a gestão da Ana e tenta fechar a venda, desconto máximo 10%. Manda-lhe já mensagem.',
  'Responde aos clientes pendentes que perguntaram por websites',
  'Faz o resumo das vendas de hoje e envia para o meu WhatsApp',
  'Pausa o bot',
  'Apaga o Bruno do CRM',
  'sim',
  'Activa a campanha de anúncios do Facebook',
];
(async () => {
  for (const o of ORDERS) {
    const before = sent.length;
    const t0 = Date.now();
    try {
      const reply = await core.run(o);
      const acts = core.status().audit.filter((e) => e.at >= t0).map((e) => `${e.tool}:${e.status}`);
      console.log(`\n> ${o}\n  acções: ${acts.join(', ') || '—'}\n  enviadas: ${sent.slice(before).map((m) => `${m.jid.split('@')[0]}: ${m.text.replace(/\n/g, ' ').slice(0, 120)}`).join(' | ') || '—'}\n  resposta: ${reply.replace(/\n/g, ' ').slice(0, 300)}`);
    } catch (e) {
      console.log(`\n> ${o}\n  ERRO: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.log('\nestado final:', JSON.stringify({ paused, ana: profiles.findByNum('244911111111') && { priority: profiles.findByNum('244911111111').priority, override: profiles.findByNum('244911111111').override }, brunoExiste: !!profiles.findByNum('244922222222') }));
})();
