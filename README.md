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

## Modo Business (atendimento ao cliente)

Mesma base de código, segunda app Fly com `ASSISTANT_MODE=business` (ver `fly.business.toml`):

- Responde como assistente virtual da empresa (`BUSINESS_NAME`, default "MD Business"), usando só a info de `context/business.txt` (serviços, planos, preços, pagamentos) — editável no painel.
- Qualifica o pedido (nome, negócio, o que pretende, prazo, orçamento).
- Pedidos de orçamento/contratação ou de falar com uma pessoa → aviso "Novo cliente" ao `OWNER_NUMBER` com o resumo da conversa e link wa.me (no máx. 1 aviso por cliente a cada 6h). Urgências também avisam o dono.

```bash
flyctl apps create whatsapp-business-mdm
flyctl volumes create wa_biz_data --size 1 --region gru -c fly.business.toml
flyctl secrets set GROQ_API_KEY=... WEB_TOKEN=... -c fly.business.toml
flyctl deploy -c fly.business.toml
```

## Pessoal + Business num só serviço (hosts sem disco, ex.: Render free)

`src/multi.js` arranca vários assistentes no mesmo container, cada um no seu caminho (`/pessoal/`, `/business/`).
Variáveis com prefixo do nome (ex.: `BUSINESS_OWNER_NUMBER`) só se aplicam a essa instância.

```
INSTANCES=pessoal:personal,business:business
BUSINESS_OWNER_NUMBER=244926115429   # quem recebe os avisos de novos clientes
GROQ_API_KEY=...  WEB_TOKEN=...
SUPABASE_URL=https://<proj>.supabase.co  SUPABASE_SERVICE_KEY=...   # guarda a sessão WhatsApp (não perde o QR)
```

Tabela no Supabase:

```sql
create table public.wa_files (instance text not null, path text not null, content text not null,
  updated_at timestamptz not null default now(), primary key (instance, path));
alter table public.wa_files enable row level security;
```

O serviço faz ping a si próprio (`RENDER_EXTERNAL_URL`/`KEEPALIVE_URL`) a cada 10 min para não adormecer.

## Alojamento grátis: GitHub Actions + painel no GitHub Pages

### Prospecção Roque Santeiro

No CRM, **Leads → Prospectar lojas** abre a ferramenta do Chat. A pesquisa manual devolve até três lojas novas em Angola, com fonte e rascunho, de todos os ramos por defeito. Os filtros incluem grupos em português e categorias `shop` da fonte; «Boa escolha» / «Descartar» ajustam a ordem das pesquisas seguintes sem inferir interesse dos clientes. Também funciona por ordem do dono: “Pesquisa lojas de moda” ou “Mostra a proposta da última loja”.

O directório provém do [extracto HOT/HDX de Angola](https://data.humdata.org/dataset/hotosm_ago_points_of_interest), © [OpenStreetMap contributors, ODbL](https://www.openstreetmap.org/copyright). É uma fonte comunitária, não uma lista de clientes nem prova de que uma loja continua aberta. O worker lê o extracto no máximo uma vez por dia em funcionamento normal e não recolhe números de telefone. A selecção, a avaliação do dono e o estado de pedidos ficam no `DATA_DIR`, separados dos leads de vendas.

Uma pesquisa nunca dispara mensagens. A ligação de pedido abre o WhatsApp da MD Business com `Quero a proposta Roque Santeiro <id>`; é a própria loja que tem de enviar esse texto. O bot devolve o rascunho apenas nesse chat privado, sem follow-up automático deste pedido, e não repete um envio com resultado incerto. O contador indica mensagens aceites pelo WhatsApp, não confirma leitura nem a identidade comercial do remetente.

As ordens de envio do dono (incluindo envios em massa aprovados) e os envios pelo painel só aceitam modelos fixos de serviço: acompanhamento, confirmação de recepção de encomenda e preferência de atendimento. Só saem para o chat de origem de clientes que já escreveram e não recusaram contacto. A conversa normal iniciada pelo cliente continua livre.

- `.github/workflows/worker.yml` corre `src/multi.js` (pessoal + business) em turnos de ~6h; cada turno agenda o seguinte (concorrência `wa-worker`) e um cron de 20 min serve de watchdog. Repo público = minutos ilimitados.
- Secrets do repo: `GROQ_API_KEY`, `WEB_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `BUSINESS_OWNER_NUMBER`.
- `src/remote.js` publica estado/QR/log em `wa_panel` e executa comandos (`toggle`, `context`, `send`) de `wa_cmds`.
- Painel: `docs/index.html` (GitHub Pages) → edge function `wa-panel` (`supabase functions deploy wa-panel --no-verify-jwt`, secret `WA_PANEL_TOKEN` = `WEB_TOKEN`).

```sql
create table public.wa_panel (instance text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table public.wa_cmds (id bigserial primary key, instance text not null, cmd text not null, arg text, created_at timestamptz not null default now());
alter table public.wa_panel enable row level security;
alter table public.wa_cmds enable row level security;
```
