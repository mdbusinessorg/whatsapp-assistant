// Registo de auditoria de todas as acções do agente.
const fs = require('fs');
const path = require('path');
const config = require('../config');

const FILE = path.join(config.dataDir, 'audit.json');
let log = [];
try {
  log = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch {}

function record(entry) {
  const e = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at: Date.now(), ...entry };
  log.push(e);
  while (log.length > 500) log.shift();
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(log));
  return e;
}

const recent = (n = 40) => log.slice(-n).reverse();

module.exports = { record, recent };
