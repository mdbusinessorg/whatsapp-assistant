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
  // Se vazio, o dono é o próprio número ligado (mensagens fromMe contam como comandos do dono).
  ownerNumber: (process.env.OWNER_NUMBER || '').replace(/\D/g, ''),
  // Modelos Groq
  chatModel: process.env.CHAT_MODEL || 'llama-3.3-70b-versatile',
  whisperModel: process.env.WHISPER_MODEL || 'whisper-large-v3',
  systemPrompt:
    process.env.SYSTEM_PROMPT ||
    'És o "Mega Assistente" pessoal do dono no WhatsApp. Responde em português (a menos que te peçam outra língua), ' +
      'de forma clara, útil e concisa — mensagens de WhatsApp devem ser curtas. ' +
      'Podes usar formatação do WhatsApp (*negrito*, _itálico_). Nunca inventes factos; se não souberes, diz.',
};
