const wa = require('./whatsapp');
const web = require('./web');

async function main() {
  web.start();
  await wa.connect();
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
