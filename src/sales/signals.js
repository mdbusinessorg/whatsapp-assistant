// Detectores determinísticos (rápidos e sem custo) — usados em conjunto com a análise da IA e como fallback.
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// categoria -> { kind: tipo de objeção, re }
const OBJECTIONS = {
  price: { kind: 'financial', re: /(muito|bue|mt|demasiado|bem) (caro|cara)|caro demais|esta caro|ta caro|preco (alto|elevado)|o preco nao me convence|nao (vale|compensa)|mais barat/ },
  no_money: { kind: 'financial', re: /nao tenho (dinheiro|guita|kumbu|bufunfa|cash|como pagar)|sem (dinheiro|guita|kumbu)|estou (liso|teso|sem dinheiro)|ainda nao recebi o salario|fim do mes/ },
  think: { kind: 'emotional', re: /vou pensar|deixa[- ]?me pensar|preciso (de )?pensar|vou ver (isso|depois)|vou analisar/ },
  partner: { kind: 'emotional', re: /consultar (o meu|a minha|o|a) (marido|esposa|mulher|socio|socia|chefe|patrao|familia|parceir)|(falar|conversar|consultar|ver) com (o meu|a minha|o|a) (marido|esposa|mulher|socio|socia|chefe|patrao|familia|parceir)/ },
  later: { kind: 'polite_refusal', re: /talvez (mais tarde|depois|outro dia)|mais para a frente|noutra altura|outro momento|depois falamos|vou voltar a (contactar|falar)|volto a contactar|entro em contacto depois/ },
  wait: { kind: 'emotional', re: /vou esperar|prefiro esperar|ainda nao e altura|quando tiver tempo/ },
  compare: { kind: 'informational', re: /comparar|ver (noutras|outras) (lojas|empresas|agencias)|outros orcamentos|pedir (outros|mais) orcamentos|encontrei mais barato|ha quem faca por menos/ },
  trust: { kind: 'trust', re: /nao confio|confianca|como (sei|posso saber)|e (de )?confianca|sao reais|e seguro|referencias|portfolio|trabalhos anteriores/ },
  fraud: { kind: 'trust', re: /fraude|burla|esquema|golpe|scam|enganar|roubar o meu dinheiro/ },
  not_needed: { kind: 'genuine', re: /nao preciso( disso)?( agora)?|nao me faz falta|nao e necessario|ja tenho (site|website|loja|pagina)/ },
  not_interested: { kind: 'polite_refusal', re: /nao (estou|to|tou) interessad|sem interesse|nao me interessa|nao quero( mais)?\b/ },
  browsing: { kind: 'informational', re: /so (estou|to|tou) a (consultar|ver|perguntar)|so curiosidade|so queria saber|apenas a ver/ },
  more_info: { kind: 'informational', re: /manda (mais )?(informac|detalhes|info)|envia (mais )?(informac|detalhes)|mais detalhes|tem (catalogo|brochura|pdf)/ },
  unsure: { kind: 'emotional', re: /nao tenho (a )?certeza|estou (em )?duvida|nao sei se|tenho duvidas|indecis/ },
  other_supplier: { kind: 'genuine', re: /ja tenho (outro )?(fornecedor|alguem|um programador|uma agencia|quem faca)|ja trabalho com/ },
  prepayment: { kind: 'trust', re: /nao (quero|vou) pagar (antes|adiantado|antecipad)|pagar (so )?no fim|pagamento antecipado|pagar (tudo )?depois de (ver|pronto|entregue)|adiantamento/ },
};

const BUYING = [
  /como (faco|fazemos|e que faco) para (comprar|contratar|avancar|comecar|pagar)/,
  /onde (estao|ficam) (localizad|situad)|qual (e )?(o )?endereco|onde fica/,
  /aceitam (multicaixa|express|transferencia|tpa|cartao|paypal)|posso pagar (com|por|via)/,
  /quanto custa a entrega|tem entrega|fazem entrega/,
  /(tem|esta|ha) disponivel|tem vaga|tem agenda/,
  /pode reservar|reserva(r)? (para|pra) mim|guarda(r)? para mim/,
  /posso pagar (hoje|agora|ja)|quero pagar|manda (os dados|o iban|a conta|a referencia)|qual (e )?o iban|dados (bancarios|de pagamento)/,
  /qual (e )?o tamanho|quantas paginas/,
  /como recebo|como (e )?a entrega|quando (fica|esta) pront/,
  /quanto tempo (demora|leva)|qual (e )?o prazo|em quantos dias/,
  /quero (avancar|fechar|contratar|comecar|esse|este|a landing|o site|o plano)|vamos (avancar|fechar|comecar)|fechado|pode(mos)? comecar/,
  /envia(r)? (a )?(proposta|fatura|factura|orcamento formal)/,
];

const DECLINE = /(para|pare|deixa) de (me )?(mandar|enviar|contactar)|nao (me )?(mande|envie|contacte)s? mais|nao quero (mais )?(mensagens|contacto)|remove o meu numero|apaga(r)? (os )?meus dados|\bstop\b|cancelar subscricao/;
const FRUSTRATION = /(estou|to|tou) (farto|chateado|irritado)|que (mau|pessimo) atendimento|ninguem responde|ja (disse|expliquei)|nao (entendes|percebes)|absurdo|ridiculo|\bfoda\b|merda/;
const DELETION = /apaga(r)? (os |todos os )?(meus )?dados|elimina(r)? (os )?(meus )?dados|remove(r)? (os )?meus dados|esquece (os )?meus dados/;
const HUMAN = /falar com (alguem|uma pessoa|o responsavel|humano|um atendente|o dono|o ceo)|quero (um )?humano|atendente/;

function detect(text) {
  const t = norm(text);
  const objections = Object.entries(OBJECTIONS)
    .filter(([, o]) => o.re.test(t))
    .map(([type, o]) => ({ type, kind: o.kind }));
  return {
    objections,
    buyingSignals: BUYING.filter((re) => re.test(t)).length,
    optOut: DECLINE.test(t),
    frustrated: FRUSTRATION.test(t),
    wantsHuman: HUMAN.test(t),
    deletion: DELETION.test(t),
  };
}

module.exports = { detect, norm, OBJECTION_TYPES: Object.keys(OBJECTIONS), OBJECTIONS };
