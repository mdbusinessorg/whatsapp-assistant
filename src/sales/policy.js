const fs = require('fs');
const path = require('path');
const config = require('../config');

const DEFAULT_FILE = path.join(__dirname, '..', '..', 'context', 'sales-policy.json');
const DATA_FILE = path.join(config.dataDir, 'sales-policy.json'); // sobrepõe a política por defeito, se existir

function get() {
  for (const f of [DATA_FILE, DEFAULT_FILE]) {
    try {
      return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch {}
  }
  return { maxDiscountPct: 0, paymentOptions: [], paymentTerms: '', negotiationBoundaries: '', followUpHours: [24, 72, 168], maxFollowUps: 3, followUpMinScore: 30 };
}

module.exports = { get };
