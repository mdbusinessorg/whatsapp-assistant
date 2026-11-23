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
const { state, saveState, getHistory, pushHistory, saveHistories, reminders, removeReminder, logContact, contactsSince } = require('./state');
const brain = require('./brain');
const commands = require('./commands');
const sales = config.mode === 'business' ? require('./sales') : null;
const agent = config.mode === 'business' ? require('./agent/core') : null;
const { clearHistory } = require('./state');

const logger = pino({ level: process.env.LOG_LEVEL || 'warn' });
const AUTH_DIR = path.join(config.dataDir, 'auth');

let sock = null;
let followUpsStarted = false;
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
  if (!sock) throw new Error('WhatsApp desligado');
  return sock.sendMessage(jid, { text });
}

async function sendAudio(jid, { buffer, mimetype, ptt }) {
  if (!sock) throw new Error('WhatsApp desligado');
  return sock.sendMessage(jid, { audio: buffer, mimetype, ptt });
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

// Modo business: pedido de orçamento/contratação ou de falar com uma pessoa → avisa o dono
const LEAD_RE = /or[çc]amento|pre[çc]o|quanto custa|valor|contratar|proposta|reuni[ãa]o|encomendar|quero (um|uma|fazer|criar)|falar com (algu[ée]m|uma pessoa|o respons[áa]vel|humano)/i;
function wantsHumanOrQuote(text) {
  return LEAD_RE.test(text);
}

async function notifyLead(jid, num, name, text, extra = '') {
  const last = state.leadsNotified[jid] || 0;
  if (Date.now() - last < 6 * 3600000) return;
  state.leadsNotified[jid] = Date.now();
  saveState();
  const convo = getHistory(jid)
    .filter((h) => h.role !== 'system')
    .slice(-6)
    .map((h) => `${h.role === 'user' ? '👤' : '🤖'} ${h.content.slice(0, 200)}`)
    .join('\n');
  await send(
    `${config.ownerNumber}@s.whatsapp.net`,
    `💼 *Novo cliente — ${config.businessName}*\n+${num}${name ? ` (${name})` : ''}\n"${text.slice(0, 300)}"${extra ? `\n${extra}` : ''}\n\n${convo}\n\nwa.me/${num}`
  ).catch((e) => log(`aviso de lead falhou: ${e.message}`));
}

async function handleIncoming(msg) {
  const jid = msg.key.remoteJid;
  if (!jid || jid === 'status@broadcast' || jid.endsWith('@newsletter')) return;
  const isGroup = jid.endsWith('@g.us');
  const fromMe = !!msg.key.fromMe;
  const text = extractText(msg).trim();
  const audio = msg.message?.audioMessage;

  // Identidade do remetente: o WhatsApp pode entregar como @lid — o nº real vem em remoteJidAlt/participantAlt
  const senderNum = jidNum(
    msg.key.remoteJidAlt ||
      msg.key.senderPn ||
      msg.key.participantPn ||
      msg.key.participantAlt ||
      msg.key.participant ||
      jid
  );
  const owner =
    senderNum === config.ownerNumber || jidNum(jid) === config.ownerNumber || (!config.ownerNumber && (fromMe || jidNum(jid) === selfNum));
  log(`msg de +${senderNum}${owner ? ' (dono)' : ''} jid=${jid}`);

  if (fromMe && !owner && !text.startsWith('!')) return;

  if (text.startsWith('!')) {
    const reply = await commands.handle(text, { jid, isGroup, fromMe, owner, selfNum });
    if (reply) await send(jid, reply);
    return;
  }

  // Mensagem do dono: resolve urgentes pendentes e segue para resposta normal da IA
  if (owner && !isGroup && text) {
    for (const [pjid, ts] of Object.entries(state.pendingUrgent)) {
      if (Date.now() - ts < 30 * 60000) {
        await send(pjid, config.mode === 'business'
            ? '✅ Um responsável da equipa já está a tratar do teu pedido e entra em contacto contigo em breve.'
            : `✅ O teu assunto é importante — o ${config.ownerName} está disponível. Fala com ele diretamente: +244 ${config.ownerNumber.slice(3)}`).catch(() => {});
      }
      delete state.pendingUrgent[pjid];
    }
    saveState();
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

    if (!owner && !fromMe) {
      logContact({
        ts: Date.now(),
        jid,
        num: senderNum,
        name: msg.pushName || '',
        text: userText.slice(0, 500),
        urgent: /urgente|urg[êe]ncia|emerg[êe]ncia|\basap\b/i.test(userText),
      });
    }

    // Primeira interação neste chat: o modelo deve apresentar-se
    if (!state.introduced[jid]) {
      pushHistory(
        jid,
        'system',
        config.mode === 'business'
          ? `Esta é a primeira mensagem desta pessoa neste chat. Dá-lhe as boas-vindas à ${config.businessName} e apresenta-te como o assistente virtual antes de responder.`
          : `Esta é a primeira mensagem desta pessoa neste chat. Apresenta-te como o assistente do ${config.ownerName} (ele está ausente) antes de responder.`
      );
      state.introduced[jid] = true;
      saveState();
    }

    pushHistory(jid, 'user', userText);

    // Assunto urgente: avisa o dono no número principal
    if (!isGroup && config.ownerNumber && /urgente|urg[êe]ncia|emerg[êe]ncia|\basap\b/i.test(userText)) {
      state.pendingUrgent[jid] = Date.now();
      saveState();
      await send(
        `${config.ownerNumber}@s.whatsapp.net`,
        `🚨 Mensagem URGENTE de +${jidNum(jid)}:\n"${userText.slice(0, 300)}"\n\nResponde aqui (qualquer texto) e eu dou-lhe o teu contacto principal.`
      ).catch((e) => log(`aviso urgente falhou: ${e.message}`));
      await send(
        jid,
        config.mode === 'business'
          ? '⚡ Percebi que é urgente — já avisei a equipa.'
          : `⚡ Percebi que é urgente — já avisei o ${config.ownerName} no número principal dele.`
      );
    }

    let reply;
    if (sales && !isGroup && !owner) {
      const r = await sales.respond({ jid, num: senderNum, name: msg.pushName || '', text: userText, history: getHistory(jid) });
      reply = r.reply;
      if (r.deleted) clearHistory(jid);
      const p = r.profile;
      if (p) {
        log(`vendas +${senderNum}: ${r.analysis?.intent || '?'} · ${p.stage} · ${p.category} ${p.score}/100 · ${r.plan?.action}${r.issues?.length ? ` · QC: ${r.issues.join('; ')}` : ''}`);
        if (config.ownerNumber && !state.pendingUrgent[jid] && (wantsHumanOrQuote(userText) || r.detected?.wantsHuman || ['hot', 'ready'].includes(p.category))) {
          const extra = `📊 Lead ${p.category} (${p.score}/100) · ${p.stage}${p.facts.need ? ` · precisa: ${p.facts.need}` : ''}`;
          await notifyLead(jid, senderNum, msg.pushName, userText, extra);
        }
      }
    } else if (agent && owner && !isGroup) {
      reply = await agent.run(userText);
      if (audio && reply) {
        await require('./agent/tts')
          .synth(reply)
          .then((v) => sendAudio(jid, v))
          .catch((e) => log(`resposta em voz falhou: ${e.message}`));
      }
    } else {
      reply = await brain.chat(getHistory(jid));
    }
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
    browser: [config.title, 'Chrome', '1.0'],
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
      if (sales && !followUpsStarted) {
        followUpsStarted = true;
        sales.startFollowUps({ send, getHistory, pushHistory, saveHistories, log });
      }
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

// Resumo diário automático para o dono — 19h em Luanda (18h UTC)
let lastDigestDay = '';
setInterval(async () => {
  if (!config.ownerNumber || !sock?.user) return;
  const luanda = new Date(Date.now() + 3600000); // UTC+1
  const day = luanda.toISOString().slice(0, 10);
  if (luanda.getUTCHours() !== 19 || lastDigestDay === day) return;
  const dayStart = Date.parse(`${day}T00:00:00Z`) - 3600000;
  const today = contactsSince(dayStart);
  if (!today.length) return;
  lastDigestDay = day;
  const lines = today
    .map((c) => `+${c.num}${c.name ? ` (${c.name})` : ''}: ${c.text.slice(0, 120)}${c.urgent ? ' [URGENTE]' : ''}`)
    .join('\n');
  const summary = await brain
    .ask(`Resume em bullets quem ${config.mode === 'business' ? `contactou a ${config.businessName}` : `procurou o ${config.ownerName}`} hoje e o que cada um queria. Sê direto.\n\n${lines}`)
    .catch(() => lines);
  await send(`${config.ownerNumber}@s.whatsapp.net`, `📋 *Resumo do dia*\n\n${summary}`).catch(() => {});
}, 60000);

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
    ownerNote: state.ownerNote,
    pendingUrgent: Object.keys(state.pendingUrgent).length,
    qr: latestQr,
    logs: panelLogs.slice(-100),
  };
}

async function setPaused(p) {
  state.paused = p;
  saveState();
}

module.exports = { connect, send, sendAudio, status, setPaused, log };
