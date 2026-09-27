const path = require('path');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  jidNormalizedUser,
} = require('@whiskeysockets/baileys');

const config = require('./config');
const { state, saveState, getHistory, pushHistory, saveHistories, reminders, removeReminder } = require('./state');
const brain = require('./brain');
const commands = require('./commands');

const logger = pino({ level: process.env.LOG_LEVEL || 'warn' });
const AUTH_DIR = path.join(config.dataDir, 'auth');

let sock = null;
let latestQr = null;
let selfNum = null;
const panelLogs = [];
const MAX_PANEL_LOGS = 200;

function log(line) {
  const entry = `${new Date().toISOString().slice(11, 19)} ${line}`;
  panelLogs.push(entry);
  if (panelLogs.length > MAX_PANEL_LOGS) panelLogs.shift();
  console.log(entry);
}

async function send(jid, text) {
  if (!sock) return;
  await sock.sendMessage(jid, { text });
}

function extractText(msg) {
  const m = msg.message || {};
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    ''
  );
}

function mentionedMe(msg) {
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  return selfNum && mentioned.some((j) => jidNum(jidNormalizedUser(j)) === selfNum);
}

function jidNum(jid) {
  return jid.split('@')[0].replace(/:\d+$/, '');
}

async function handleIncoming(msg) {
  const jid = msg.key.remoteJid;
  if (!jid || jid === 'status@broadcast' || jid.endsWith('@newsletter')) return;
  const isGroup = jid.endsWith('@g.us');
  const fromMe = !!msg.key.fromMe;
  const text = extractText(msg).trim();
  const audio = msg.message?.audioMessage;

  // Comandos (inclui os enviados pelo dono, fromMe)
  const owner = jidNum(jid) === config.ownerNumber || (!config.ownerNumber && (fromMe || jidNum(jid) === selfNum));
  if (fromMe && !owner && !text.startsWith('!')) return;

  if (text.startsWith('!')) {
    const reply = await commands.handle(text, {
      jid,
      isGroup,
      fromMe,
      ownerNumber: config.ownerNumber,
      selfNum,
    });
    if (reply) await send(jid, reply);
    return;
  }

  if (state.paused || state.chatsMuted.includes(jid)) return;
  if (isGroup && !state.replyGroups && !mentionedMe(msg)) return;

  await sock.sendPresenceUpdate('composing', jid).catch(() => {});

  try {
    let userText = text;
    if (audio && !userText) {
      const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
      const transcript = await brain.transcribe(buffer, audio.mimetype || 'audio/ogg');
      if (!transcript) {
        await send(jid, '🎙️ Não consegui transcrever o áudio.');
        return;
      }
      userText = transcript;
      await send(jid, `🎙️ _Transcrição:_ ${transcript}`);
    }
    if (!userText) return;

    // Primeira interação neste chat: o modelo deve apresentar-se como assistente do Joel
    if (!state.introduced[jid]) {
      pushHistory(jid, 'system', 'Esta é a primeira mensagem desta pessoa neste chat. Apresenta-te como o assistente do Joel (ele está ausente) antes de responder.');
      state.introduced[jid] = true;
      saveState();
    }

    pushHistory(jid, 'user', userText);
    const reply = await brain.chat(getHistory(jid));
    if (reply) {
      pushHistory(jid, 'assistant', reply);
      saveHistories();
      await send(jid, reply);
    }
  } catch (e) {
    log(`erro a responder: ${e.message}`);
    await send(jid, '⚠️ Erro interno — tenta outra vez.').catch(() => {});
  } finally {
    await sock.sendPresenceUpdate('paused', jid).catch(() => {});
  }
}

async function connect() {
  const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: authState,
    logger,
    printQRInTerminal: false,
    browser: ['Mega Assistente', 'Chrome', '1.0'],
    markOnlineOnConnect: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      latestQr = qr;
      log('QR code pronto — abre o painel para escanear.');
    }
    if (connection === 'open') {
      latestQr = null;
      selfNum = jidNum(jidNormalizedUser(sock.user.id));
      log(`ligado como ${sock.user?.name || ''} (${selfNum})`);
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      log(`conexão fechada (code=${code})`);
      if (code !== DisconnectReason.loggedOut) {
        setTimeout(connect, 5000);
      } else {
        log('sessão terminada (logout) — apaga data/auth e faz novo QR.');
      }
    }
  });

  // Histórico sincronizado pelo WhatsApp (últimas mensagens de cada conversa)
  sock.ev.on('messaging-history.set', ({ messages }) => {
    let seeded = 0;
    for (const msg of messages || []) {
      const jid = msg.key?.remoteJid;
      if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') continue;
      const text = extractText(msg).trim();
      if (!text) continue;
      const role = msg.key.fromMe ? 'assistant' : 'user';
      const h = getHistory(jid);
      if (h.length >= 10) continue;
      pushHistory(jid, role, `[histórico] ${text.slice(0, 300)}`);
      seeded++;
    }
    if (seeded) {
      saveHistories();
      log(`histórico sincronizado: ${seeded} mensagens importadas`);
    }
  });

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      handleIncoming(msg).catch((e) => log(`handleIncoming: ${e.message}`));
    }
  });
}

// Lembretes: verifica a cada 15s
setInterval(async () => {
  const due = reminders().filter((r) => r.at <= Date.now());
  for (const r of due) {
    removeReminder(r.id);
    await send(r.jid, `⏰ *Lembrete:* ${r.text}`).catch(() => {});
  }
}, 15000);

function status() {
  return {
    connected: !!sock?.user,
    selfNum,
    paused: state.paused,
    replyGroups: state.replyGroups,
    mutedChats: state.chatsMuted.length,
    reminders: reminders().length,
    qr: latestQr,
    logs: panelLogs.slice(-100),
  };
}

async function setPaused(p) {
  state.paused = p;
  saveState();
}

module.exports = { connect, send, status, setPaused, log };
