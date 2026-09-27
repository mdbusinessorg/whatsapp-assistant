const Groq = require('groq-sdk');
const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('./config');

const groq = new Groq({ apiKey: config.groqApiKey });

const CONTEXT_FILE = path.join(config.dataDir, 'context.txt');

function buildSystem() {
  let ctx = '';
  try {
    ctx = fs.readFileSync(CONTEXT_FILE, 'utf8').trim();
  } catch {}
  const extra = ctx ? `\n\nContexto sobre o Joel (CV/notas):\n${ctx.slice(0, 8000)}` : '';
  return config.systemPrompt + extra;
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

module.exports = { chat, transcribe };
