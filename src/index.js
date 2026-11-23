const sync = require('./sync');

async function main() {
  await sync.restore();
  const wa = require('./whatsapp');
  const web = require('./web');
  web.start();
  sync.start();
  await wa.connect();
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
