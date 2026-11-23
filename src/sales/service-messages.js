const profiles = require('./profiles');
const st = require('../state');

const templates = Object.freeze({
  acompanhamento: 'Sobre o teu pedido anterior à MD Business: ainda precisas de ajuda? Se não quiseres receber mais mensagens, é só dizer.',
  entrega: 'Podes confirmar se já recebeste a tua encomenda?',
  atendimento: 'Preferes continuar este atendimento por aqui ou falar com uma pessoa da equipa?',
});
function textFor(template) {
  if (typeof template !== 'string' || !Object.hasOwn(templates, template)) throw new Error('Escolhe um modelo de serviço válido. Texto livre não é permitido.');
  return templates[template];
}
async function send(num, template) {
  const text = textFor(template);
  const p = profiles.inboundByNum(num);
  if (!p) throw new Error('O número indicado ainda não iniciou uma conversa privada confirmada.');
  if (p.optOut || p.declined) throw new Error('O cliente pediu para não ser contactado.');
  const res = await require('../whatsapp').send(p.jid, text);
  if (res?.key?.id) {
    st.pushHistory(p.jid, 'assistant', text);
    st.saveHistories();
    p.lastBotAt = Date.now();
    profiles.save();
  }
  return { to: p.num, verified: !!res?.key?.id, messageId: res?.key?.id || null };
}
module.exports = { templates, textFor, send };
