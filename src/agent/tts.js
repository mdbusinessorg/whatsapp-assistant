// Síntese de voz com abstração de fornecedor. TTS_PROVIDER=edge (grátis, vozes neurais pt-PT) | none.
// Saída: ogg/opus (nota de voz) se houver ffmpeg, senão mp3.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const provider = process.env.TTS_PROVIDER || 'edge';
const voice = process.env.TTS_VOICE || 'pt-PT-DuarteNeural';

async function edgeMp3(text) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(text);
  const chunks = [];
  await new Promise((resolve, reject) => {
    audioStream.on('data', (c) => chunks.push(c));
    audioStream.on('end', resolve);
    audioStream.on('close', resolve);
    audioStream.on('error', reject);
  });
  tts.close?.();
  return Buffer.concat(chunks);
}

function toOgg(mp3) {
  return new Promise((resolve) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-'));
    const src = path.join(dir, 'a.mp3');
    const dst = path.join(dir, 'a.ogg');
    fs.writeFileSync(src, mp3);
    execFile('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-c:a', 'libopus', '-b:a', '32k', '-ac', '1', dst], (err) => {
      const out = !err && fs.existsSync(dst) ? fs.readFileSync(dst) : null;
      fs.rm(dir, { recursive: true, force: true }, () => {});
      resolve(out);
    });
  });
}

const clean = (t) => String(t).replace(/[*_~`#>]/g, '').replace(/https?:\/\/\S+/g, '').replace(/\n+/g, '. ').slice(0, 1500);

async function synth(text) {
  if (provider === 'none') throw new Error('TTS desactivado');
  const mp3 = await edgeMp3(clean(text));
  if (!mp3.length) throw new Error('TTS sem áudio');
  const ogg = await toOgg(mp3);
  return ogg ? { buffer: ogg, mimetype: 'audio/ogg; codecs=opus', ptt: true } : { buffer: mp3, mimetype: 'audio/mpeg', ptt: false };
}

module.exports = { synth, provider };
