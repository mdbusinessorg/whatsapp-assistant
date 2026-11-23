// Persistência opcional do DATA_DIR no Supabase (para hosts sem disco persistente).
// Ativa com SUPABASE_URL + SUPABASE_SERVICE_KEY; SYNC_INSTANCE separa vários assistentes na mesma tabela.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
const instance = process.env.SYNC_INSTANCE || config.mode;
const enabled = !!(url && key);
const known = new Map(); // path relativo -> hash

function headers(extra = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra };
}

function listFiles(dir, base = dir) {
  let out = [];
  for (const e of fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(listFiles(p, base));
    else if (!e.name.endsWith('.tmp')) out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

const hash = (buf) => crypto.createHash('sha1').update(buf).digest('hex');

async function restore() {
  if (!enabled) return;
  fs.mkdirSync(config.dataDir, { recursive: true });
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const res = await fetch(
      `${url}/rest/v1/wa_files?instance=eq.${encodeURIComponent(instance)}&select=path,content&order=path&limit=500&offset=${offset}`,
      { headers: headers() }
    );
    if (!res.ok) throw new Error(`restore ${res.status}: ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < 500) break;
  }
  for (const r of rows) {
    const buf = Buffer.from(r.content, 'base64');
    const file = path.join(config.dataDir, r.path);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buf);
    known.set(r.path, hash(buf));
  }
  console.log(`[sync] ${rows.length} ficheiros restaurados do Supabase (${instance})`);
}

let current = null;
function push() {
  if (!enabled) return Promise.resolve();
  if (!current) current = doPush().finally(() => (current = null));
  return current;
}

async function doPush() {
  try {
    const files = listFiles(config.dataDir);
    const upserts = [];
    for (const rel of files) {
      let buf;
      try {
        buf = fs.readFileSync(path.join(config.dataDir, rel));
      } catch {
        continue;
      }
      if (rel.endsWith('.json')) {
        try {
          JSON.parse(buf.toString('utf8'));
        } catch {
          continue; // ficheiro a meio de ser escrito; fica para o próximo ciclo
        }
      }
      const h = hash(buf);
      if (known.get(rel) !== h) upserts.push({ rel, h, row: { instance, path: rel, content: buf.toString('base64'), updated_at: new Date().toISOString() } });
    }
    for (let i = 0; i < upserts.length; i += 200) {
      const batch = upserts.slice(i, i + 200);
      const res = await fetch(`${url}/rest/v1/wa_files?on_conflict=instance,path`, {
        method: 'POST',
        headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify(batch.map((u) => u.row)),
      });
      if (!res.ok) throw new Error(`push ${res.status}: ${await res.text()}`);
      batch.forEach((u) => known.set(u.rel, u.h));
    }
    const current = new Set(files);
    const gone = [...known.keys()].filter((k) => !current.has(k));
    for (const rel of gone) {
      const res = await fetch(`${url}/rest/v1/wa_files?instance=eq.${encodeURIComponent(instance)}&path=eq.${encodeURIComponent(rel)}`, { method: 'DELETE', headers: headers() });
      if (res.ok) known.delete(rel);
    }
  } catch (e) {
    console.error(`[sync] ${e.message}`);
  }
}

function start() {
  if (!enabled) return;
  setInterval(push, 20000);
  const flush = () => (current || Promise.resolve()).then(push).finally(() => process.exit(0));
  process.once('SIGTERM', flush);
  process.once('SIGINT', flush);
}

module.exports = { enabled, restore, push, start };
