const fs = require('fs');
const path = require('path');
const config = require('./config');

const STATE_FILE = path.join(config.dataDir, 'state.json');
const REMINDERS_FILE = path.join(config.dataDir, 'reminders.json');
const HISTORY_FILE = path.join(config.dataDir, 'history.json');
const CONTACTS_FILE = path.join(config.dataDir, 'contacts.json');

const defaults = {
  paused: false, // assistente em pausa global
  replyGroups: false, // responder em grupos só quando mencionado/chamado
  chatsMuted: [], // jids onde o assistente não responde
  introduced: {}, // jid -> true quando o assistente já se apresentou
  ownerNote: '', // última nota/rotina deixada pelo dono
  ownerNoteAt: 0,
  pendingUrgent: {}, // jid -> ts de pedido urgente à espera do dono
};

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}

const state = { ...defaults, ...readJson(STATE_FILE, {}) };
let reminders = readJson(REMINDERS_FILE, []);
let histories = readJson(HISTORY_FILE, {}); // jid -> [{role, content}]
let contactsLog = readJson(CONTACTS_FILE, []); // {ts, jid, num, name, text, urgent}

const MAX_HISTORY = 20;

module.exports = {
  state,
  saveState: () => writeJson(STATE_FILE, state),

  reminders: () => reminders,
  addReminder(r) {
    reminders.push(r);
    writeJson(REMINDERS_FILE, reminders);
  },
  removeReminder(id) {
    reminders = reminders.filter((r) => r.id !== id);
    writeJson(REMINDERS_FILE, reminders);
  },

  getHistory: (jid) => histories[jid] || [],
  pushHistory(jid, role, content) {
    const h = (histories[jid] = histories[jid] || []);
    h.push({ role, content });
    while (h.length > MAX_HISTORY) h.shift();
  },
  clearHistory(jid) {
    delete histories[jid];
  },
  saveHistories() {
    writeJson(HISTORY_FILE, histories);
  },

  logContact(entry) {
    contactsLog.push(entry);
    while (contactsLog.length > 2000) contactsLog.shift();
    writeJson(CONTACTS_FILE, contactsLog);
  },
  contactsSince(ms) {
    return contactsLog.filter((c) => c.ts >= ms);
  },
};
