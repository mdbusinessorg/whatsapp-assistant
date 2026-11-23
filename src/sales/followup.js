// Recuperação de vendas: follow-ups contextuais a clientes interessados que deixaram de responder.
// Regras: só leads com interesse real (score mínimo), nunca após recusa/opt-out, intervalos configuráveis, máximo N, horário 8h–20h.
const policy = require('./policy');

function dueLeads(leads, now = Date.now(), pol = policy.get()) {
  const hours = pol.followUpHours || [24, 72, 168];
  const max = Math.min(pol.maxFollowUps ?? 3, hours.length);
  return leads.filter((l) => {
    if (l.status !== 'open' || l.optOut || l.declined) return false;
    if (l.score < (pol.followUpMinScore ?? 30)) return false;
    if (!(l.lastBotAt > l.lastCustomerAt)) return false; // a bola está do lado do cliente
    const n = l.followUps.filter((f) => f.at > l.lastCustomerAt).length;
    if (n >= max) return false;
    return now - l.lastCustomerAt >= hours[n] * 3600e3;
  });
}

function inBusinessHours(now = Date.now()) {
  const h = (new Date(now).getUTCHours() + 1) % 24; // Angola UTC+1
  return h >= 8 && h < 20;
}

module.exports = { dueLeads, inBusinessHours };
