const sync = require('./sync');

async function main() {
  await sync.restore();
  if (require('./config').mode === 'business') {
    require('./sales/prospecting').refreshSectors().catch(e => console.warn(`[directório] ${e.message}`));
  }
  const wa = require('./whatsapp');
  const web = require('./web');
  web.start();
  require('./remote').start();
  sync.start();
  await wa.connect();
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
