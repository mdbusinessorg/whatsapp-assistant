// Motor de permissões configurável: autonomous | limits | approval (context/agent-permissions.json, sobreposto por data/agent-permissions.json)
const fs = require('fs');
const path = require('path');
const config = require('../config');

const FILES = [path.join(config.dataDir, 'agent-permissions.json'), path.join(__dirname, '..', '..', 'context', 'agent-permissions.json')];

function get() {
  for (const f of FILES) {
    try {
      return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch {}
  }
  return { levels: { autonomous: [], limits: [], approval: [] }, limits: {} };
}

function level(tool) {
  const { levels } = get();
  for (const l of ['approval', 'limits', 'autonomous']) if ((levels[l] || []).includes(tool)) return l;
  return 'approval'; // desconhecido = pede confirmação
}

const limits = () => get().limits || {};

module.exports = { get, level, limits };
