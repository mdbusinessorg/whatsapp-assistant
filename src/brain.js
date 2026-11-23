const Groq = require('groq-sdk');
const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('./config');

const groq = new Groq({ apiKey: config.groqApiKey });
const { state } = require('./state');

const CONTEXT_FILE = path.join(config.dataDir, 'context.txt');

function buildSystem() {
  let ctx = '';
  try {
    ctx = fs.readFileSync(CONTEXT_FILE, 'utf8').trim();
  } catch {}
  if (!ctx && config.defaultContextFile) {
    try {
      ctx = fs.readFileSync(config.defaultContextFile, 'utf8').trim();
    } catch {}
  }
  const label = config.mode === 'business' ? `Informação da ${config.businessName} (serviços, preços, FAQ)` : `Contexto sobre o ${config.ownerName} (CV/notas)`;
  const extra = ctx ? `\n\n${label}:\n${ctx.slice(0, 8000)}` : '';
  const note = state.ownerNote
    ? `\n\nNota atual do ${config.ownerName} (${new Date(state.ownerNoteAt).toLocaleString('pt-PT')}): ${state.ownerNote}\nUsa esta nota para dizer onde ele está / quando volta, mas resume — não copies à letra se tiver dados privados.`
    : '';
  return config.systemPrompt + extra + note;
}

async function chat(history) {
  const res = await groq.chat.completions.create({
    model: config.chatModel,
    messages: [{ role: 'system', content: buildSystem() }, ...history],
    temperature: 0.6,
    max_tokens: 800,
  });
  return (res.choices[0]?.message?.content || '').trim();
}

// Chamada genérica (usada pelo motor de vendas)
async function complete({ model, messages, temperature = 0.5, max_tokens = 600, json = false, reasoning }) {
  const res = await groq.chat.completions.create({
    model: model || config.chatModel,
    messages,
    temperature,
    max_tokens,
    ...(json ? { response_format: { type: 'json_object' } } : {}),
    ...(reasoning && /gpt-oss/.test(model || config.chatModel) ? { reasoning_effort: reasoning } : {}),
  });
  return (res.choices[0]?.message?.content || '').trim();
}

// Pergunta solta (fora de uma conversa) — usado para relatórios
async function ask(prompt) {
  const res = await groq.chat.completions.create({
    model: config.chatModel,
    messages: [
      { role: 'system', content: buildSystem() },
      { role: 'user', content: prompt },
    ],
    temperature: 0.3,
    max_tokens: 1000,
  });
  return (res.choices[0]?.message?.content || '').trim();
}

// buffer de áudio (ogg/opus do WhatsApp) -> texto via Whisper na Groq
async function transcribe(audioBuffer, mimetype = 'audio/ogg') {
  const ext = mimetype.includes('mpeg') ? 'mp3' : mimetype.includes('mp4') || mimetype.includes('m4a') ? 'm4a' : 'ogg';
  const file = path.join(os.tmpdir(), `wa-audio-${Date.now()}.${ext}`);
  fs.writeFileSync(file, audioBuffer);
  try {
    const res = await groq.audio.transcriptions.create({
      file: fs.createReadStream(file),
      model: config.whisperModel,
      language: 'pt',
    });
    return (res.text || '').trim();
  } finally {
    fs.unlink(file, () => {});
  }
}

module.exports = { chat, ask, transcribe, complete, buildSystem, groq };
