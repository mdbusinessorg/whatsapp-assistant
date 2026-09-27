# Mega Assistente WhatsApp 🤖

Assistente pessoal de WhatsApp sempre ligado: responde com IA (Groq), transcreve e responde a **mensagens de voz** (Whisper), tem comandos de produtividade e um painel web protegido por token.

## Funcionalidades

- 🧠 **IA Groq** (llama-3.3-70b) com memória por conversa
- 🎙️ **Áudio**: voice notes são transcritas (whisper-large-v3) e respondidas
- ⏰ **Lembretes** por chat
- 👥 **Grupos**: responde só quando chamado/mencionado (configurável)
- ⏸️ **Pausar/retomar** global ou por chat
- 🖥️ **Painel web** com QR code de ligação, estado e logs

## Comandos

Envia `!ajuda` em qualquer chat para a lista. Destaques: `!lembrete 30 ligar ao banco`, `!limpar`, `!pausa`, `!mudo`, `!grupos on|off`, `!status`.

## Stack

Node.js 20 · [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) (WhatsApp Web via QR) · groq-sdk (chat + Whisper) · Express.

## Correr localmente

```bash
npm install
cp .env.example .env   # preencher GROQ_API_KEY e WEB_TOKEN
npm start
# abre http://localhost:8080/?token=WEB_TOKEN e escaneia o QR com o WhatsApp
```

A sessão fica em `data/auth` — só precisas de escanear o QR uma vez.

## Deploy (Fly.io)

```bash
flyctl apps create whatsapp-assistant-mdm
flyctl volumes create wa_data --size 1 --region gru
flyctl secrets set GROQ_API_KEY=... WEB_TOKEN=...
flyctl deploy
```

Depois abre `https://whatsapp-assistant-mdm.fly.dev/?token=WEB_TOKEN` e escaneia o QR.

## Variáveis

| Var | Descrição |
|---|---|
| `GROQ_API_KEY` | chave Groq (chat + Whisper) — obrigatória |
| `WEB_TOKEN` | token do painel web — obrigatório |
| `OWNER_NUMBER` | nº do dono intl sem `+` (default: o próprio número ligado) |
| `CHAT_MODEL` / `WHISPER_MODEL` | modelos Groq |
| `SYSTEM_PROMPT` | personalidade do assistente |
| `DATA_DIR` | onde guardar auth/state/reminders |
