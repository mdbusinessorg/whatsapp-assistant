// Corre vários assistentes (ex.: pessoal + business) num só serviço, cada um no seu caminho:
//   INSTANCES="pessoal:personal,business:business"  ->  /pessoal/  e  /business/
const { fork } = require('child_process');
const http = require('http');
const path = require('path');

const port = Number(process.env.PORT || 8080);
const baseData = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const instances = (process.env.INSTANCES || 'pessoal:personal,business:business')
  .split(',')
  .map((s, i) => {
    const [name, mode] = s.trim().split(':');
    return { name, mode: mode || name, port: port + 1 + i };
  });

for (const inst of instances) {
  const prefix = inst.name.toUpperCase() + '_';
  const overrides = {};
  for (const [k, v] of Object.entries(process.env)) if (k.startsWith(prefix)) overrides[k.slice(prefix.length)] = v;
  const run = () => {
    const child = fork(path.join(__dirname, 'index.js'), {
      env: {
        ...process.env,
        ASSISTANT_MODE: inst.mode,
        PORT: String(inst.port),
        DATA_DIR: path.join(baseData, inst.name),
        SYNC_INSTANCE: inst.name,
        ...overrides,
      },
    });
    inst.child = child;
    child.on('exit', (code) => {
      console.error(`[multi] ${inst.name} saiu (${code}); a reiniciar em 5s`);
      setTimeout(run, 5000);
    });
  };
  run();
}

const shutdown = () => {
  for (const i of instances) i.child?.removeAllListeners('exit').kill('SIGTERM');
  setTimeout(() => process.exit(0), 8000);
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);

http
  .createServer((req, res) => {
    if (req.url === '/healthz') return res.end('ok');
    const inst = instances.find((i) => req.url === `/${i.name}` || req.url.startsWith(`/${i.name}/`) || req.url.startsWith(`/${i.name}?`));
    if (!inst) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(instances.map((i) => `<p><a href="/${i.name}/">${i.name}</a></p>`).join(''));
    }
    let rest = req.url.slice(inst.name.length + 1);
    if (!rest.startsWith('/')) {
      res.writeHead(302, { Location: `/${inst.name}/${rest}` });
      return res.end();
    }
    const up = http.request(
      { host: '127.0.0.1', port: inst.port, path: rest, method: req.method, headers: req.headers },
      (r) => {
        const headers = { ...r.headers };
        if (headers.location?.startsWith('/')) headers.location = `/${inst.name}${headers.location}`;
        res.writeHead(r.statusCode, headers);
        r.pipe(res);
      }
    );
    up.on('error', () => {
      res.statusCode = 502;
      res.end('a arrancar…');
    });
    req.pipe(up);
  })
  .listen(port, () => console.log(`[multi] proxy em :${port} -> ${instances.map((i) => '/' + i.name).join(', ')}`));

const selfUrl = process.env.KEEPALIVE_URL || process.env.RENDER_EXTERNAL_URL;
if (selfUrl) setInterval(() => fetch(`${selfUrl}/healthz`).catch(() => {}), 10 * 60000);
