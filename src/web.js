const express = require('express');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const config = require('./config');
const wa = require('./whatsapp');

const CONTEXT_FILE = path.join(config.dataDir, 'context.txt');

const app = express();
app.use(express.urlencoded({ extended: false }));

// Auth por ?token= ou cookie
app.use((req, res, next) => {
  const t = req.query.token || req.headers.cookie?.match(/wa_token=([^;]+)/)?.[1];
  if (t !== config.webToken) {
    return res.status(401).send(`<!doctype html><html lang="pt"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${config.title} — Login</title>
<style>body{font-family:system-ui;background:#0f1115;color:#e8eaed;display:flex;min-height:90vh;align-items:center;justify-content:center;margin:0}
.card{background:#1a1d24;border-radius:12px;padding:24px;max-width:360px;text-align:center}
input{width:100%;padding:10px;border-radius:8px;border:1px solid #333;background:#111318;color:#fff;margin:12px 0;box-sizing:border-box}
button{width:100%;padding:10px;border:0;border-radius:8px;background:#34d399;font-weight:600;cursor:pointer}</style></head>
<body><div class="card"><h2>🤖 ${config.title}</h2><p>Insere o token de acesso:</p>
<form method="get" action=""><input name="token" placeholder="WEB_TOKEN" autofocus><button>Entrar</button></form></div></body></html>`);
  }
  res.setHeader('Set-Cookie', `wa_token=${t}; Path=/; HttpOnly; Max-Age=31536000`);
  next();
});

app.get('/', async (req, res) => {
  const s = wa.status();
  const qrImg = s.qr ? await QRCode.toDataURL(s.qr, { width: 280 }) : null;
  let ctx = '';
  try {
    ctx = fs.readFileSync(CONTEXT_FILE, 'utf8');
  } catch {}
  if (!ctx && config.defaultContextFile) {
    try {
      ctx = fs.readFileSync(config.defaultContextFile, 'utf8');
    } catch {}
  }
  res.send(`<!doctype html><html lang="pt"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="10">
<title>${config.title}</title>
<style>
body{font-family:system-ui;background:#0f1115;color:#e8eaed;margin:0;padding:24px;max-width:720px;margin:auto}
h1{font-size:22px}.card{background:#1a1d24;border-radius:12px;padding:16px;margin:12px 0}
.badge{display:inline-block;padding:3px 10px;border-radius:99px;font-size:13px}
.on{background:#12351f;color:#6ee7a0}.off{background:#3d1c1c;color:#ff9c9c}
button{padding:8px 16px;border:0;border-radius:8px;font-weight:600;cursor:pointer}
.stop{background:#ff5c5c;color:#fff}.go{background:#34d399;color:#06281c}
pre{background:#111318;padding:12px;border-radius:8px;font-size:12px;max-height:280px;overflow:auto;white-space:pre-wrap}
img{background:#fff;padding:10px;border-radius:8px}
a{color:#8ab4ff}
</style></head><body>
<h1>🤖 ${config.title}</h1>
<div class="card">
  Estado: <span class="badge ${s.connected ? 'on' : 'off'}">${s.connected ? `Ligado (${s.selfNum})` : 'Desligado'}</span>
  <span class="badge ${s.paused ? 'off' : 'on'}">${s.paused ? 'Em pausa' : 'A responder'}</span>
  <br><br>
  <form method="post" action="toggle" style="display:inline">
    <button class="${s.paused ? 'go' : 'stop'}">${s.paused ? '▶ Retomar' : '⏸ Pausar'}</button>
  </form>
</div>
${qrImg ? `<div class="card"><b>Escaneia com o WhatsApp</b> (Aparelhos ligados → Ligar aparelho):<br><br><img src="${qrImg}"></div>` : ''}
<div class="card">
  Grupos: ${s.replyGroups ? 'responde' : 'só quando chamado'} · Chats mudos: ${s.mutedChats} · Lembretes: ${s.reminders} · Urgentes pendentes: ${s.pendingUrgent}
  ${s.ownerNote ? `<br>📝 <b>Nota do ${config.ownerName}:</b> ${s.ownerNote.replace(/</g, '&lt;')}` : ''}
</div>
<div class="card"><b>Contexto do assistente</b> (CV, notas, instruções — entra no prompt de todas as conversas)
<form method="post" action="context">
<textarea name="context" rows="10" style="width:100%;background:#111318;color:#e8eaed;border:1px solid #333;border-radius:8px;padding:10px;box-sizing:border-box">${ctx.replace(/</g, '&lt;')}</textarea>
<button class="go">💾 Guardar contexto</button>
</form></div>
<div class="card"><b>Log</b><pre>${s.logs.join('\n') || '(vazio)'}</pre></div>
</div>
</body></html>`);
});

app.post('/send', async (req, res) => {
  const to = String(req.body.to || '').replace(/\D/g, '');
  const text = String(req.body.text || '').slice(0, 4000);
  if (!to || !text) return res.status(400).send('Falta "to" e/ou "text".');
  const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
  try {
    await wa.send(jid, text);
    wa.log(`manual: enviado para ${jid}`);
    res.json({ ok: true, to: jid });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/context', (req, res) => {
  fs.writeFileSync(CONTEXT_FILE, String(req.body.context || ''));
  wa.log('contexto atualizado via painel');
  res.redirect('./');
});

app.post('/toggle', async (req, res) => {
  await wa.setPaused(!wa.status().paused);
  res.redirect('./');
});

app.get('/healthz', (req, res) => res.send('ok'));

function start() {
  app.listen(config.port, () => console.log(`[web] painel em http://0.0.0.0:${config.port}`));
}

module.exports = { start };
