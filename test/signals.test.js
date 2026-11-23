process.env.GROQ_API_KEY ||= 'test';
process.env.WEB_TOKEN ||= 'test';
process.env.ASSISTANT_MODE = 'business';
process.env.DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'wa-test-'));
const test = require('node:test');
const assert = require('node:assert');
const { detect } = require('../src/sales/signals');

const OBJECTIONS = [
  ['Está muito caro.', 'price'], ['Achei bué caro', 'price'], ['O preço não me convence', 'price'], ['Não vale a pena esse valor', 'price'], ['Tem mais barato?', 'price'],
  ['Vou pensar.', 'think'], ['Deixa-me pensar e depois digo', 'think'], ['Preciso pensar melhor', 'think'],
  ['Vou falar com o meu marido', 'partner'], ['Tenho de falar com a minha esposa primeiro', 'partner'], ['Vou consultar o meu sócio', 'partner'],
  ['Não tenho dinheiro agora', 'no_money'], ['Estou sem kumbu este mês', 'no_money'], ['Só no fim do mês', 'no_money'],
  ['Talvez mais tarde', 'later'], ['Vou voltar a contactar', 'later'], ['Depois falamos', 'later'],
  ['Vou comparar com outras lojas', 'compare'], ['Vou pedir outros orçamentos', 'compare'],
  ['Não confio', 'trust'], ['Como sei que vocês são de confiança?', 'trust'], ['Têm portfólio? Quero ver trabalhos anteriores', 'trust'],
  ['Como sei que não é fraude?', 'fraud'], ['Isso não é burla?', 'fraud'],
  ['Não preciso disso agora', 'not_needed'], ['Já tenho site', 'not_needed'],
  ['Não estou interessado', 'not_interested'],
  ['Só estou a consultar', 'browsing'],
  ['Manda mais informações', 'more_info'],
  ['Não tenho a certeza', 'unsure'],
  ['Já tenho outro fornecedor', 'other_supplier'],
  ['Não quero pagar adiantado', 'prepayment'], ['Prefiro pagar só no fim', 'prepayment'],
  ['Vou esperar', 'wait'],
];

test(`${OBJECTIONS.length} objeções classificadas`, () => {
  const miss = OBJECTIONS.filter(([t, type]) => !detect(t).objections.some((o) => o.type === type));
  assert.deepStrictEqual(miss, []);
});

const BUYING = [
  'Como faço para comprar?', 'Como faço para contratar?', 'Onde estão localizados?', 'Aceitam Multicaixa?', 'Aceitam multicaixa express?',
  'Quanto custa a entrega?', 'Tem disponível esta semana?', 'Pode reservar para mim?', 'Posso pagar hoje?', 'Quero pagar, manda o IBAN',
  'Qual é o tamanho?', 'Como recebo?', 'Quanto tempo demora?', 'Qual é o prazo?', 'Quero avançar com a landing de 35 mil',
  'Vamos fechar', 'Pode começar amanhã?', 'Envia a proposta', 'Quando fica pronto?', 'Posso pagar por transferência?',
];
test(`${BUYING.length} sinais de compra`, () => {
  assert.deepStrictEqual(BUYING.filter((t) => !detect(t).buyingSignals), []);
});

const DECLINES = ['Pare de me mandar mensagens', 'Não me contacte mais', 'Não quero mais mensagens', 'Remove o meu número', 'STOP', 'Deixa de me enviar isso', 'Não mande mais nada', 'Não quero mais contacto', 'para de me contactar', 'Não envie mais'];
test(`${DECLINES.length} recusas explícitas (opt-out)`, () => {
  assert.deepStrictEqual(DECLINES.filter((t) => !detect(t).optOut), []);
});

const FRUSTRATED = ['Estou farto de esperar', 'Que mau atendimento', 'Ninguém responde aqui', 'Já disse isso 3 vezes', 'Não percebes o que eu digo?', 'Isto é ridículo', 'Absurdo, ainda nada', 'Estou chateado com isto', 'Tou irritado', 'Que péssimo atendimento'];
test(`${FRUSTRATED.length} clientes frustrados`, () => {
  assert.deepStrictEqual(FRUSTRATED.filter((t) => !detect(t).frustrated), []);
});

test('pedidos de apagar dados e de falar com humano', () => {
  assert.ok(detect('Apaga os meus dados por favor').deletion);
  assert.ok(detect('Quero falar com uma pessoa').wantsHuman);
  assert.ok(!detect('Bom dia, quero um site').optOut);
});
