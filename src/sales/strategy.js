// Estratégia de vendas: decide a próxima acção e gera directivas curtas para o modelo (não um prompt gigante).
const policy = require('./policy');

// Biblioteca de objeções: várias abordagens por tipo, rodadas para não repetir o mesmo guião.
const OBJECTION_PLAYS = {
  price: [
    'Reconhece; ancora no valor (o que o cliente ganha: mais clientes/credibilidade) e só depois compara com o plano mais acessível que ainda resolve o problema.',
    'Pergunta o que é mais importante para ele (preço, resultado, prazo) e ajusta o âmbito ao orçamento, sem baixar o preço do mesmo plano.',
    'Mostra a diferença prática entre planos (o que inclui a mais) e explica o retorno (um cliente novo paga o investimento).',
  ],
  no_money: [
    'Mostra empatia; explica o pagamento faseado 50%/50% e propõe começar pelo plano mais simples ou reservar para quando for possível.',
    'Pergunta, sem pressão, quando faria sentido avançar e oferece deixar a proposta preparada.',
  ],
  think: [
    'Respeita; pergunta com leveza se há alguma dúvida específica (preço, prazo, confiança) que possas esclarecer já.',
    'Resume em 2 linhas o que ele ganha e oferece enviar um resumo claro para decidir com calma.',
  ],
  partner: [
    'Apoia a decisão conjunta; oferece um resumo curto (plano, preço, prazo, pagamento) fácil de partilhar.',
    'Pergunta o que a outra pessoa costuma valorizar para preparares a informação certa.',
  ],
  later: [
    'Aceita sem pressão; pergunta se pode voltar a falar numa data que lhe dê jeito.',
    'Deixa a porta aberta com um benefício concreto e confirma se prefere ser contactado mais tarde.',
  ],
  wait: ['Respeita; pergunta o que está à espera de acontecer e se há algo que possa ajudar a decidir.'],
  compare: [
    'Incentiva a comparar e dá critérios objectivos (o que está incluído, suporte, prazos, mobile-first, SEO) para comparar bem.',
    'Pergunta o que encontrou noutros sítios para comparar âmbito, não só preço.',
  ],
  trust: [
    'Reduz o risco: pagamento 50% só no início e 50% na entrega aprovada, acompanhamento de cada etapa, contactos oficiais. Oferece falar com o responsável.',
    'Sê transparente: indica o site oficial e os contactos; não inventes testemunhos nem números.',
  ],
  fraud: ['Leva a sério; explica o modelo 50/50 com aprovação, os contactos oficiais e oferece chamada com o responsável. Nunca pressionar.'],
  not_needed: [
    'Faz uma pergunta de diagnóstico (SPIN: implicação) sobre como recebe clientes hoje; se de facto não precisa, respeita.',
    'Partilha um insight útil (ex.: clientes procuram no telemóvel) sem insistir.',
  ],
  not_interested: ['Respeita imediatamente; agradece, deixa contacto para o futuro e não tentes vender mais.'],
  browsing: ['Ajuda sem pressão: responde ao que perguntou e oferece-te para recomendar o plano certo se ele quiser.'],
  more_info: ['Dá a informação concreta pedida (plano, inclui, preço, pagamento) de forma curta e pergunta qual opção se aproxima mais do que precisa.'],
  unsure: ['Simplifica: recomenda UMA opção com o porquê, e pergunta o que falta para ter certeza.'],
  other_supplier: ['Respeita; pergunta se está satisfeito ou se há algo que gostaria de melhorar, sem criticar o concorrente.'],
  prepayment: ['Explica que só paga 50% para iniciar e o restante após aprovar a entrega; se continuar desconfortável, passa para a equipa.'],
};

const STAGE_GOALS = {
  initial_contact: 'Acolhe de forma natural e percebe o que o trouxe cá.',
  discovery: 'Descobre a necessidade (SPIN: situação/problema) com UMA pergunta de cada vez.',
  qualification: 'Qualifica (tipo de negócio, objectivo, prazo, orçamento) sem interrogar — só o que falta.',
  recommendation: 'Recomenda o plano mais adequado e explica porquê se ajusta a ele.',
  value_presentation: 'Traduz funcionalidades em benefícios práticos para o caso dele.',
  objection_handling: 'Trata a objeção principal com empatia e factos.',
  conversion: 'Guia para o próximo passo prático (confirmar plano, dados, pagamento 50%).',
  confirmation: 'Confirma detalhes (plano, prazo, pagamento, próximos passos) e diz que a equipa vai contactar.',
  post_sale: 'Dá apoio, confirma satisfação e só sugere algo complementar se for relevante.',
};

function pick(list, used) {
  const fresh = list.filter((x) => !used.includes(x));
  return (fresh.length ? fresh : list)[0];
}

function plan(profile, analysis, det, pol = { ...policy.get(), ...(profile.override || {}) }) {
  const d = [];
  if (det.optOut || analysis.declined) {
    return {
      action: 'respect_decline',
      directives: ['O cliente recusou/pediu para não ser contactado: agradece numa frase, confirma que não voltas a insistir e não vendas mais nada.'],
    };
  }
  if (det.frustrated || analysis.sentiment === 'frustrated') {
    d.push('Cliente frustrado: pede desculpa brevemente, resolve o problema dele primeiro, sem vender. Oferece passar a um responsável.');
  }
  let action = 'advance';
  const readyToBuy = det.buyingSignals > 0 || analysis.intent === 'purchase';
  if (readyToBuy) {
    action = 'close';
    d.push(`Sinal de compra: reduz explicações e guia para o próximo passo prático. Pagamento: ${pol.paymentOptions.join(', ')}; ${pol.paymentTerms} Pergunta só o dado que falta para avançar (nome, plano, ou o que é o projecto). Diz que a equipa confirma os dados de pagamento.`);
  }
  const obj = analysis.objection?.type && OBJECTION_PLAYS[analysis.objection.type] ? analysis.objection : det.objections[0];
  if (obj && OBJECTION_PLAYS[obj.type]) {
    action = action === 'close' ? 'close' : 'handle_objection';
    const play = pick(OBJECTION_PLAYS[obj.type], profile.usedStrategies);
    profile.usedStrategies = [...profile.usedStrategies.slice(-20), play];
    d.push(`Objeção (${obj.type}, ${obj.kind || 'n/d'}): ${play}`);
    if (obj.type === 'not_interested') action = 'respect_decline';
  }
  if (analysis.asksDiscount) {
    d.push(pol.maxDiscountPct > 0
      ? `Desconto máximo autorizado: ${pol.maxDiscountPct}%. Antes de descontar, oferece alternativas (âmbito/plano).`
      : `Não há descontos autorizados. ${pol.negotiationBoundaries} Nunca prometas desconto.`);
  }
  if (action === 'advance') d.push(STAGE_GOALS[profile.stage] || STAGE_GOALS.discovery);
  if (analysis.style === 'brief') d.push('O cliente escreve curto: responde em 1–2 frases.');
  if (analysis.style === 'technical') d.push('O cliente quer detalhe técnico: podes explicar com mais precisão.');
  if (analysis.style === 'confused') d.push('O cliente está confuso: simplifica e dá um passo de cada vez.');
  if (analysis.style === 'enthusiastic') d.push('O cliente está entusiasmado: mantém o ritmo e avança.');
  return { action, directives: d };
}

module.exports = { plan, OBJECTION_PLAYS, STAGE_GOALS };
