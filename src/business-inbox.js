const phone = jid => /^(\d+)(?::\d+)?@s\.whatsapp\.net$/.exec(jid || '')?.[1] || '';
const lid = jid => /^(\d+)(?::\d+)?@lid$/.exec(jid || '')?.[1] || '';

function businessOwner(value) {
  const n = String(value || '').replace(/[\s()-]/g, '').replace(/^\+/, '');
  if (/^9\d{8}$/.test(n)) return '244' + n;
  return /^[1-9]\d{7,14}$/.test(n) ? n : '';
}

function createInbox(ownerNumber, lookup) {
  let mapping, expires = 0;
  async function ownerLid() {
    if (!mapping || Date.now() >= expires) {
      expires = Date.now() + 60000;
      mapping = Promise.resolve().then(() => lookup(`${ownerNumber}@s.whatsapp.net`)).then(rows => {
        const value = rows?.find(r => r.exists && phone(r.jid) === ownerNumber)?.lid;
        const id = lid(value) || (/^\d+$/.test(value || '') ? value : '');
        if (id) expires = Date.now() + 3600000;
        return id;
      }).catch(() => '');
    }
    return mapping;
  }
  return async key => {
    const jid = key?.remoteJid;
    if (!jid || key.fromMe) return null;
    if (jid.endsWith('@g.us')) return { role: 'group', num: phone(key.participant) || phone(key.participantPn) };
    const pn = phone(jid), opaque = lid(jid);
    if (!pn && !opaque) return null;
    let num = pn || phone(key.senderPn) || (/^\d+$/.test(key.senderPn || '') ? key.senderPn : '') || phone(key.remoteJidAlt);
    if (!num && ownerNumber && opaque === await ownerLid()) num = ownerNumber;
    return { role: ownerNumber && num === ownerNumber ? 'owner' : 'customer', num };
  };
}

module.exports = { businessOwner, createInbox };
