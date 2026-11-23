// Painel remoto via Supabase (para hosts sem HTTP de entrada, ex.: GitHub Actions):
// publica o estado/QR em wa_panel e executa comandos da tabela wa_cmds.
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const config = require('./config');
const wa = require('./whatsapp');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
const instance = process.env.SYNC_INSTANCE || config.mode;
const CONTEXT_FILE = path.join(config.dataDir, 'context.txt');
const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

function readCtx() {
  for (const f of [CONTEXT_FILE, config.defaultContextFile]) {
    try {
      const c = f && fs.readFileSync(f, 'utf8');
      if (c) return c;
    } catch {}
  }
  return '';
}

let lastJson = '';
let lastAt = 0;
let lastQr = null;
let qrImg = null;
let lastReply = null;

async function publish() {
  const s = wa.status();
  if (s.qr !== lastQr) {
    lastQr = s.qr;
    qrImg = s.qr ? await QRCode.toDataURL(s.qr, { width: 280 }) : null;
  }
  const data = {
    title: config.title,
    mode: config.mode,
    ownerName: config.ownerName,
    connected: s.connected,
    selfNum: s.selfNum,
    paused: s.paused,
    replyGroups: s.replyGroups,
    mutedChats: s.mutedChats,
    reminders: s.reminders,
    pendingUrgent: s.pendingUrgent,
    ownerNote: s.ownerNote,
    qr: qrImg,
    context: readCtx(),
    logs: s.logs.slice(-80),
    sales: config.mode === 'business' ? require('./sales').dashboard() : null,
    agent: config.mode === 'business' ? { ...require('./agent/core').status(), lastReply } : null,
  };
  const json = JSON.stringify(data);
  if (json === lastJson && Date.now() - lastAt < 60000) return;
  const res = await fetch(`${url}/rest/v1/wa_panel?on_conflict=instance`, {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ instance, data, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`wa_panel ${res.status}: ${await res.text()}`);
  lastJson = json;
  lastAt = Date.now();
}

async function poll() {
  const res = await fetch(`${url}/rest/v1/wa_cmds?instance=eq.${encodeURIComponent(instance)}&order=id`, { headers: H });
  if (!res.ok) throw new Error(`wa_cmds ${res.status}`);
  for (const c of await res.json()) {
    await fetch(`${url}/rest/v1/wa_cmds?id=eq.${c.id}`, { method: 'DELETE', headers: H });
    if (c.cmd === 'toggle') await wa.setPaused(!wa.status().paused);
    else if (c.cmd === 'context') {
      fs.writeFileSync(CONTEXT_FILE, c.arg || '');
      wa.log('contexto atualizado via painel');
    } else if (c.cmd === 'outcome' && config.mode === 'business') {
      const { num, status } = JSON.parse(c.arg || '{}');
      if (['won', 'lost', 'open'].includes(status)) require('./sales').markOutcome(num, status);
    } else if (c.cmd === 'agent' && config.mode === 'business') {
      const reply = await require('./agent/core').run(String(c.arg || ''), 'painel');
      lastReply = { text: c.arg, reply, at: Date.now() };
      await wa.send(`${config.ownerNumber}@s.whatsapp.net`, `🖥️ Ordem do painel: ${c.arg}

${reply}`).catch(() => {});
    } else if (c.cmd === 'send') {
      const { to, text } = JSON.parse(c.arg || '{}');
      const num = String(to || '').replace(/\D/g, '');
      if (num && text) {
        await wa.send(`${num}@s.whatsapp.net`, String(text).slice(0, 4000));
        wa.log(`manual: enviado para ${num}`);
      }
    }
    lastAt = 0;
  }
}

function start() {
  if (!url || !key) return;
  const guard = (fn, name) => () => fn().catch((e) => console.error(`[remote] ${name}: ${e.message}`));
  setInterval(guard(publish, 'publish'), 5000);
  setInterval(guard(poll, 'poll'), 4000);
}

module.exports = { start };
