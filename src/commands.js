const { state, saveState, addReminder, reminders, removeReminder, clearHistory, contactsSince } = require('./state');
const brain = require('./brain');
const config = require('./config');

const HELP = `*${config.title}* 🤖 — comandos:

*!ajuda* — esta mensagem
*!limpar* — apagar a memória desta conversa
*!lembrete <min> <texto>* — lembrar-te daqui a X minutos
*!lembretes* — listar lembretes ativos
*!apagar-lembrete <id>* — remover lembrete
*!pausa* / *!retomar* — pausar/retomar o assistente (dono)
*!mudo* / *!voz* — silenciar/ativar o assistente neste chat (dono)
*!grupos on|off* — responder em grupos (dono)
*!status* — estado do assistente
*!nota <texto>* — definir a tua nota/rotina atual (dono)
*!hoje* — relatório de quem falou hoje e o que queria (dono)

Também entendo *mensagens de voz* 🎙️ — envia um áudio e eu transcrevo e respondo.`;

function jidNum(jid) {
  return jid.split('@')[0].replace(/:\d+$/, '');
}

function isOwner(jid, fromMe, ownerNumber, selfNum) {
  const n = jidNum(jid);
  if (ownerNumber) return n === ownerNumber;
  return fromMe || n === selfNum;
}

// Devolve string de resposta (já enviável) ou null se não era comando.
// ctx: { jid, isGroup, fromMe, owner, selfNum }
async function handle(text, ctx) {
  const t = text.trim();
  if (!t.startsWith('!')) return null;
  const [cmd, ...rest] = t.slice(1).split(/\s+/);
  const arg = rest.join(' ');
  const owner = ctx.owner;

  switch (cmd.toLowerCase()) {
    case 'ajuda':
    case 'help':
      return HELP;
    case 'limpar':
      clearHistory(ctx.jid);
      return '🧹 Memória desta conversa apagada.';
    case 'lembrete': {
      const min = parseInt(rest[0], 10);
      const msg = rest.slice(1).join(' ');
      if (!min || min <= 0 || !msg) return 'Uso: *!lembrete <minutos> <texto>*';
      const r = { id: Math.random().toString(36).slice(2, 8), jid: ctx.jid, at: Date.now() + min * 60000, text: msg };
      addReminder(r);
      return `⏰ Lembrete criado (id ${r.id}) para daqui a ${min} min.`;
    }
    case 'lembretes': {
      const mine = reminders().filter((r) => r.jid === ctx.jid);
      if (!mine.length) return 'Sem lembretes ativos neste chat.';
      return mine
        .map((r) => `• *${r.id}* — em ${Math.max(0, Math.round((r.at - Date.now()) / 60000))} min: ${r.text}`)
        .join('\n');
    }
    case 'apagar-lembrete': {
      if (!arg) return 'Uso: *!apagar-lembrete <id>*';
      removeReminder(arg);
      return `Lembrete ${arg} removido (se existia).`;
    }
    case 'pausa':
      if (!owner) return '⛔ Só o dono pode pausar.';
      state.paused = true;
      saveState();
      return '⏸️ Assistente em pausa.';
    case 'retomar':
      if (!owner) return '⛔ Só o dono pode retomar.';
      state.paused = false;
      saveState();
      return '▶️ Assistente ativo.';
    case 'mudo':
      if (!owner) return '⛔ Só o dono.';
      if (!state.chatsMuted.includes(ctx.jid)) state.chatsMuted.push(ctx.jid);
      saveState();
      return '🔇 Assistente silenciado neste chat.';
    case 'voz':
      if (!owner) return '⛔ Só o dono.';
      state.chatsMuted = state.chatsMuted.filter((j) => j !== ctx.jid);
      saveState();
      return '🔊 Assistente ativo neste chat.';
    case 'grupos': {
      if (!owner) return '⛔ Só o dono.';
      const on = /^on|ligar|true$/i.test(arg);
      state.replyGroups = on;
      saveState();
      return `👥 Responder em grupos: ${on ? 'ON' : 'OFF'} (off = só quando me chamam).`;
    }
    case 'nota': {
      if (!owner) return '⛔ Só o dono.';
      if (!arg) return 'Uso: *!nota <texto>* — ex.: !nota em reunião até às 18h';
      state.ownerNote = arg.slice(0, 500);
      state.ownerNoteAt = Date.now();
      saveState();
      return '📝 Anotado — passei a usar isto como tua nota atual.';
    }
    case 'hoje':
    case 'relatorio': {
      if (!owner) return '⛔ Só o dono.';
      const dayStart = Date.parse(new Date(Date.now() + 3600000).toISOString().slice(0, 10) + 'T00:00:00Z') - 3600000;
      const today = contactsSince(dayStart);
      if (!today.length) return '📋 Hoje ainda ninguém falou comigo.';
      const lines = today
        .map((c) => `+${c.num}${c.name ? ` (${c.name})` : ''}: ${c.text.slice(0, 120)}${c.urgent ? ' [URGENTE]' : ''}`)
        .join('\n');
      const summary = await brain
        .ask(`Resume em bullets quem ${config.mode === 'business' ? `contactou a ${config.businessName}` : `procurou o ${config.ownerName}`} hoje e o que cada um queria. Sê direto.\n\n${lines}`)
        .catch(() => null);
      return `📋 *Resumo de hoje*\n\n${summary || lines}`;
    }
    case 'status':
      return (
        `*Estado:* ${state.paused ? '⏸️ pausado' : '▶️ ativo'}\n` +
        `*Grupos:* ${state.replyGroups ? 'respondo' : 'só quando chamado'}\n` +
        `*Chats silenciados:* ${state.chatsMuted.length}\n` +
        `*Lembretes ativos:* ${reminders().length}`
      );
    default:
      return 'Comando desconhecido. *!ajuda* para a lista.';
  }
}

module.exports = { handle, HELP };
