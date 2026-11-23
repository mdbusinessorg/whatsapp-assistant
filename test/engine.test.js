process.env.GROQ_API_KEY ||= 'test';
process.env.WEB_TOKEN ||= 'test';
process.env.ASSISTANT_MODE = 'business';
process.env.DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'wa-test-'));
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { check } = require('../src/sales/quality');
const { score } = require('../src/sales/scoring');
const { plan } = require('../src/sales/strategy');
const { blank } = require('../src/sales/profiles');
const { detect } = require('../src/sales/signals');

const ctx = fs.readFileSync(path.join(__dirname, '..', 'context', 'business.txt'), 'utf8');
const pol = { maxDiscountPct: 0 };

test('QC: preços verificados contra a tabela', () => {
  assert.deepStrictEqual(check('A Landing Page Comercial custa 25.000 Kz.', { context: ctx, policy: pol }), []);
  assert.match(check('A Landing Page Comercial custa 20.000 Kz.', { context: ctx, policy: pol }).join(), /preço não verificado/);
  assert.match(check('O website sai por 120000 kz', { context: ctx, policy: pol }).join(), /preço não verificado/);
});
test('QC: sem falsa escassez, testemunhos ou descontos', () => {
  assert.match(check('Últimas vagas, só hoje!', { context: ctx, policy: pol }).join(), /escassez/);
  assert.match(check('Mais de 500 clientes satisfeitos confiam em nós', { context: ctx, policy: pol }).join(), /prova social/);
  assert.match(check('Posso fazer-te 10% de desconto', { context: ctx, policy: pol }).join(), /desconto/);
  assert.deepStrictEqual(check('Posso fazer-te 10% de desconto', { context: ctx, policy: { maxDiscountPct: 10 } }), []);
});
test('QC: saudação repetida, interrogatório, repetição, venda após recusa', () => {
  assert.match(check('Olá! Tudo bem?', { context: ctx, profile: { messages: 3 } }).join(), /saudação/);
  assert.match(check('Qual o negócio? Qual o prazo? Qual o orçamento?', { context: ctx }).join(), /perguntas/);
  assert.match(check('Temos o plano X para ti.', { context: ctx, lastReply: 'Temos o plano X para ti.' }).join(), /repete/);
  assert.match(check('Entendido. Mas aproveita o plano de 25.000 Kz', { context: ctx, action: 'respect_decline' }).join(), /recusou/);
});
test('scoring explicável e categorias', () => {
  const p = blank('a');
  assert.strictEqual(score(p, { intent: 'browsing' }).category, 'cold');
  Object.assign(p, { buyingSignals: 3, stage: 'conversion', messages: 6, facts: { need: 'site', businessType: 'loja', deadline: '2 semanas' }, products: ['Website Profissional'] });
  const s = score(p, { intent: 'purchase', urgency: 'high' });
  assert.ok(s.score >= 80, String(s.score));
  assert.strictEqual(s.category, 'ready');
  assert.ok(s.reasons.length >= 4);
  p.declined = true;
  assert.ok(score(p, { intent: 'decline' }).score < s.score);
});
test('estratégia: recusa respeitada, compra fecha, desconto não autorizado, sem repetir guião', () => {
  const p = blank('b');
  assert.strictEqual(plan(p, {}, detect('Pare de me mandar mensagens')).action, 'respect_decline');
  assert.strictEqual(plan(p, {}, detect('Não estou interessado')).action, 'respect_decline');
  assert.strictEqual(plan(p, {}, detect('Aceitam Multicaixa? Quero pagar hoje')).action, 'close');
  assert.match(plan(p, { asksDiscount: true }, detect('Faz desconto?')).directives.join(), /Não há descontos autorizados/);
  const a1 = plan(p, {}, detect('Está muito caro')).directives.join();
  const a2 = plan(p, {}, detect('Está muito caro')).directives.join();
  assert.notStrictEqual(a1, a2);
});
