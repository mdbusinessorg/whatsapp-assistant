// Controlo de qualidade da resposta antes de enviar: preços verificados, sem falsa escassez/descontos/testemunhos,
// sem saudações repetidas, sem interrogatório, tamanho adequado ao WhatsApp.
const { norm } = require('./signals');

const SCARCITY = /ultimas vagas|so hoje|apenas hoje|vagas limitadas|oferta (limitada|termina|acaba)|promocao (termina|acaba|valida ate)|restam (apenas|so)|corre[ -]?ja|antes que acabe/;
const FAKE_PROOF = /mais de \d+ clientes|\d+ ?% dos (nossos )?clientes|centenas de clientes|milhares de clientes|clientes satisfeitos/;
const DISCOUNT = /\d+ ?% de desconto|(dou|damos|fazemos|faco|consigo|posso (te )?(dar|fazer)|oferecemos)[^.?!]{0,30}desconto/;
const GREETING = /^(ola|oi|bom dia|boa tarde|boa noite|seja bem[- ]vind|bem[- ]vind)/;
const GENERIC = /como (posso|te posso|o posso) ajudar\??$/;
const PRICE = /(\d{1,3}(?:[.\s]\d{3})+|\d{4,})\s*(kz|kwanzas|aoa)/g;

function prices(text) {
  return [...norm(text).matchAll(PRICE)].map((m) => m[1].replace(/[.\s]/g, ''));
}

function check(reply, { context = '', policy = {}, profile = {}, lastReply = '', action = '', customerText = '' } = {}) {
  const r = norm(reply);
  const ctx = norm(context);
  const ctxPrices = new Set([...prices(context), ...prices(customerText)]); // pode citar o valor que o cliente propôs
  const issues = [];
  if (!reply.trim()) issues.push('resposta vazia');
  if (reply.length > 750) issues.push('demasiado longa para WhatsApp (máx. ~5 linhas)');
  const bad = prices(reply).filter((p) => !ctxPrices.has(p));
  if (bad.length) issues.push(`preço não verificado na tabela: ${bad.join(', ')} Kz — usa só preços da tabela ou diz "sob orçamento"`);
  if (SCARCITY.test(r) && !SCARCITY.test(ctx)) issues.push('falsa escassez/urgência — remove');
  if (FAKE_PROOF.test(r) && !FAKE_PROOF.test(ctx)) issues.push('prova social/estatística não verificada — remove');
  if (DISCOUNT.test(r) && !(policy.maxDiscountPct > 0)) issues.push('promete desconto não autorizado — remove');
  if (profile.messages > 1 && GREETING.test(r)) issues.push('saudação repetida — não voltes a cumprimentar');
  if ((profile.messages > 1 || /\?/.test(customerText.split(' | ').pop() || '')) && /(em que|como) (posso|te posso|o posso) ajudar/.test(r)) issues.push('pergunta genérica "em que posso ajudar" quando o cliente já disse o que quer — responde directamente');
  if ((reply.match(/\?/g) || []).length > 2) issues.push('demasiadas perguntas — faz no máximo uma');
  if (lastReply && norm(lastReply).slice(0, 80) === r.slice(0, 80)) issues.push('repete a resposta anterior');
  if (action === 'respect_decline' && /(plano|kz|pacote|proposta|aproveita)/.test(r)) issues.push('o cliente recusou — não continues a vender');
  return issues;
}

// WhatsApp usa *negrito* (um asterisco) — converte markdown do modelo
const toWhatsApp = (t) => String(t || '').replace(/\*\*(.+?)\*\*/g, '*$1*').replace(/^#+\s*/gm, '').trim();

module.exports = { check, prices, toWhatsApp };
