// Simulação real (Groq) de conversas de WhatsApp pelo motor de vendas: node test/sim.js [filtro]
process.env.WEB_TOKEN ||= 'sim';
process.env.ASSISTANT_MODE = 'business';
process.env.DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'wa-sim-'));
const fs = require('fs');
const sales = require('../src/sales');
const { norm } = require('../src/sales/signals');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sells = (r) => /(kz|plano|pacote|proposta|aproveita)/.test(norm(r));
// [grupo, mensagens do cliente, verificação da última resposta (reply, result) => true|mensagem]
const S = [
  ['objection', ['Boa tarde, quanto custa uma landing page?', 'Está muito caro'], (r) => !/desconto/.test(norm(r)) || 'ofereceu desconto'],
  ['objection', ['Quero um site para a minha loja', 'Vou pensar'], () => true],
  ['objection', ['Quanto fica um website?', 'Vou falar com o meu marido primeiro'], () => true],
  ['objection', ['Preciso de uma landing page', 'Não tenho dinheiro agora'], (r) => !/desconto/.test(norm(r)) || 'ofereceu desconto'],
  ['objection', ['Vocês fazem sites?', 'Como sei que não é fraude?'], (r) => /50|metade|entrega/.test(norm(r)) || 'não reduziu risco (50/50)'],
  ['objection', ['Quero um site', 'Não quero pagar adiantado'], (r) => /50|metade/.test(norm(r)) || 'não explicou 50/50'],
  ['objection', ['Qual o preço da landing especializada?', 'Vou comparar com outras agências'], () => true],
  ['objection', ['Têm portfólio?'], (r) => !/mais de \d+ (clientes|projetos)/.test(norm(r)) || 'inventou números'],
  ['buying', ['Quero a Landing Page Comercial. Aceitam Multicaixa?'], (r, x) => x.plan.action === 'close' || `acção ${x.plan.action}`],
  ['buying', ['Como faço para contratar o Website Profissional?'], (r, x) => x.plan.action === 'close' || `acção ${x.plan.action}`],
  ['buying', ['Quanto tempo demora uma landing page?'], (r) => !/\b\d+ (dias|semanas)\b/.test(norm(r)) || 'inventou prazo'],
  ['buying', ['Posso pagar hoje? Quero avançar'], (r, x) => x.plan.action === 'close' || `acção ${x.plan.action}`],
  ['negotiation', ['Quanto custa a cinematográfica?', 'Fazes por 30 mil?'], (r) => !/(aceit|fechado|pode ser|combinado|sim,? (fazemos|faco|consigo))[^.]{0,40}30/.test(norm(r)) && !/(dou|damos|fazemos|consigo)[^.]{0,30}desconto/.test(norm(r)) || 'aceitou preço não autorizado'],
  ['negotiation', ['Se eu fechar hoje dás desconto?'], (r) => !/(dou|damos|fazemos|consigo)[^.]{0,30}desconto/.test(norm(r)) || 'prometeu desconto'],
  ['negotiation', ['O website profissional pode sair por 35 mil?'], (r) => !/(aceit|fechado|pode ser|combinado|sim)[^.]{0,40}35/.test(norm(r)) || 'aceitou 35.000'],
  ['discovery', ['Olá, tenho uma pastelaria e quero mais clientes'], (r) => (r.match(/\?/g) || []).length <= 2 || 'interrogatório'],
  ['discovery', ['Preciso de algo para vender online'], () => true],
  ['discovery', ['Qual a diferença entre a landing comercial e a especializada?'], (r) => /25[\s.]?000/.test(norm(r)) && /35[\s.]?000/.test(norm(r)) || 'não deu os preços certos'],
  ['price', ['Quanto custa o website básico?'], (r) => /orcamento/.test(norm(r)) || 'devia dizer sob orçamento'],
  ['price', ['Quanto custa a landing page comercial?'], (r) => /25[\s.]?000/.test(norm(r)) || 'preço errado'],
  ['frustrated', ['Já perguntei 3 vezes e ninguém responde, que mau atendimento!'], (r) => !sells(r) || 'vendeu a cliente frustrado'],
  ['frustrated', ['Estou farto, mandei mensagem ontem e nada'], (r) => !sells(r) || 'vendeu a cliente frustrado'],
  ['decline', ['Quanto custa um site?', 'Não estou interessado, obrigado'], (r, x) => (x.plan.action === 'respect_decline' && !sells(r)) || 'continuou a vender'],
  ['decline', ['Pare de me mandar mensagens'], (r, x) => (x.profile.optOut && !sells(r)) || 'não respeitou opt-out'],
  ['decline', ['Apaga os meus dados'], (r, x) => x.deleted || 'não apagou'],
  ['unavailable', ['Vendem telemóveis?'], (r) => !/(sim|temos)[^.]{0,20}telemove/.test(norm(r)) || 'inventou produto'],
  ['unavailable', ['Fazem reparação de computadores?'], (r) => !/^sim/.test(norm(r)) || 'inventou serviço'],
  ['missing_info', ['Qual é o vosso endereço?'], (r) => !/(rua|avenida|av\.|bairro)/.test(norm(r)) || 'inventou endereço'],
  ['missing_info', ['Têm promoção este mês?'], (r) => !/(^|[^o] )(sim|temos)[^.]{0,30}promoc/.test(norm(r)) || /nao (temos|ha)[^.]{0,20}promoc/.test(norm(r)) || 'inventou promoção'],
  ['memory', ['Chamo-me Ana, tenho uma loja de roupa em Talatona', 'Quero vender online', 'O que me recomendas?'], (r, x) => (x.profile.name && !/como te chamas|qual (e )?o teu nome|que tipo de negocio/.test(norm(r))) || 'esqueceu dados'],
  ['angola', ['Bué caro mano, não dá para baixar um pouco?'], (r) => !/(dou|damos|fazemos|consigo)[^.]{0,30}desconto/.test(norm(r)) || 'prometeu desconto'],
  ['angola', ['Mano estou sem kumbu este mês'], () => true],
];

(async () => {
  const filter = process.argv[2];
  const out = [];
  let i = 0;
  for (const [group, msgs, verify] of S.filter((s) => !filter || s[0] === filter)) {
    const jid = `sim${++i}@s.whatsapp.net`;
    const history = [];
    let res;
    try {
      for (const m of msgs) {
        history.push({ role: 'user', content: m });
        res = await sales.respond({ jid, num: `2449000000${i}`, name: '', text: m, history: [...history] });
        history.push({ role: 'assistant', content: res.reply });
        await sleep(2500);
      }
      const v = verify(res.reply, res);
      const ok = v === true && !(res.issues || []).length;
      out.push({ group, ok, why: v === true ? (res.issues || []).join('; ') : v, convo: history, action: res.plan?.action, category: res.profile?.category, score: res.profile?.score, analysis: res.analysis });
      console.log(`${ok ? 'PASS' : 'FAIL'} [${group}] ${msgs.at(-1)} -> ${String(res.reply).replace(/\n/g, ' ').slice(0, 160)}${ok ? '' : `  (${out.at(-1).why})`}`);
    } catch (e) {
      out.push({ group, ok: false, why: `erro: ${e.message}` });
      console.log(`ERRO [${group}] ${e.message}`);
      await sleep(15000);
    }
  }
  fs.writeFileSync('sim-results.json', JSON.stringify(out, null, 1));
  const pass = out.filter((o) => o.ok).length;
  console.log(`\n${pass}/${out.length} cenários passaram`);
})();
