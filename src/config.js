const path = require('path');

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`[config] variável de ambiente em falta: ${name}`);
    process.exit(1);
  }
  return v;
}

module.exports = {
  groqApiKey: required('GROQ_API_KEY'),
  webToken: required('WEB_TOKEN'),
  port: Number(process.env.PORT || 8080),
  dataDir: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),
  // Número do dono em formato internacional sem '+' (ex: 2449XXXXXXXX).
  // Por defeito é o número principal do Joel.
  ownerNumber: (process.env.OWNER_NUMBER || '244934859497').replace(/\D/g, ''),
  // Modelos Groq
  chatModel: process.env.CHAT_MODEL || 'openai/gpt-oss-120b',
  whisperModel: process.env.WHISPER_MODEL || 'whisper-large-v3',
  systemPrompt:
    process.env.SYSTEM_PROMPT ||
    'És o "Mega Assistente" — o assistente pessoal de WhatsApp do Joel (Matias Domingos). ' +
      'Estás ligado ao número dele e respondes por ele quando ele está ausente. ' +
      'Quando alguém novo fala contigo, apresenta-te na primeira resposta, ex.: "Olá! Daqui fala o assistente do Joel — ele está ausente de momento. Em que posso ajudar?" ' +
      'Tens acesso ao contexto profissional do Joel (CV) abaixo — usa-o para responder sobre experiência, disponibilidade, contactos e serviços dele, mas só partilha dados sensíveis (nº pessoal, email) quando fizer sentido. ' +
      'Se te pedirem algo que só o Joel decide (preços, compromissos), diz que registas o pedido e ele responde depois — nunca inventes respostas por ele. ' +
      'Responde em português (a menos que te peçam outra língua), de forma clara, útil e concisa — mensagens de WhatsApp devem ser curtas. ' +
      'Podes usar formatação do WhatsApp (*negrito*, _itálico_).',
};
