# Feudal League — ligas, torneios e análise de partidas para AoE2 DE

Plano e decisões: `docs/PLANO.md`. Ler antes de mexer em escopo.

## Stack

- **Web:** Next.js 16 (App Router) + TypeScript + Tailwind v4 + next-intl (`/pt`, `/en`)
- **Worker:** Node (tsx) em loop, mesmo repo; processa também a fila de análises (a cada 10 s)
- **Analyzer:** Python (FastAPI + mgz) em `apps/analyzer`. Baixa o replay oficial (`aoe.ms/replay`) e resume o corpo; só o worker fala com ele. Cabeçalho do replay não parseia (mgz #138): slots vêm da varredura dos profile_ids no cabeçalho.
- **IA:** OpenRouter (`OPENROUTER_API_KEY`, `LLM_MODEL`), chamada direta por fetch em `packages/sync/src/analyses.ts`
- **Banco:** PostgreSQL + Drizzle (`packages/db`, migrations em `packages/db/drizzle`)
- **Dados:** API do jogo (World's Edge), só em `packages/aoe-api`. Não documentada, sem auth.
- **Auth:** Steam OpenID 2.0 à mão (`apps/web/src/lib/steam-openid.ts`) + cookie JWT (jose)
- **Infra:** Coolify com build pack Docker Compose (`docker-compose.coolify.yml`: migrate + web + worker + analyzer); banco é um Postgres gerenciado fora do compose. Domínio chega por proxy reverso próprio, não pelo Traefik do Coolify. Detalhes privados (hosts, IPs, uuids) ficam fora do repositório. Dev: `docker compose up -d` sobe o Postgres em 127.0.0.1:5433.

## Estrutura

```
apps/web            Next.js (páginas em src/app/[locale]/, rotas de auth em src/app/auth/)
apps/worker         sync por prioridade (liga 15min, reivindicado 1h, visto 6h) + detecção de partidas de liga + fila de análises
apps/analyzer       Python: replay → JSON (POST /parse). Dockerfile próprio; local: uvicorn main:app
packages/aoe-api    cliente da API + ids (ladders, civs) + parser de entrada Steam
packages/db         schema Drizzle, cliente, migrate
packages/sync       regras: players/matches; ligas em leagues.ts; análise em analyses.ts; torneios em tournaments.ts; Discord em notify.ts; badges.ts; status.ts (sync_runs/incidentes); snapshots.ts (evolução semanal)
docs/PLANO.md       plano, fases, decisões
```

## Comandos

```bash
pnpm install
docker compose up -d                 # postgres local
cp .env.example .env                 # e gere SESSION_SECRET
pnpm db:generate && pnpm db:migrate  # migrations
pnpm --filter @aoe2/web dev          # http://localhost:3000
pnpm --filter @aoe2/worker once      # um ciclo de sync
(cd apps/analyzer && uvicorn main:app --port 8000)   # analyzer local (venv com requirements.txt)
pnpm typecheck
```

## Convenções

- Strings de interface em `apps/web/messages/base/{pt,en}.json` + um arquivo por área em `messages/parts/<area>.{pt,en}.json`; `scripts/merge-messages.mjs` gera `messages/{pt,en}.json` (gitignored) e falha se as chaves divergirem. Roda sozinho em dev/build/lint/typecheck.
- Nada que seja asset do jogo (logo, ícone, arte). Identidade visual própria em `globals.css` e `crest.tsx`.
- Sem monetização (Game Content Usage Rules). Aviso no rodapé fica. Análise com IA é grátis com limite diário (`ANALYSIS_DAILY_LIMIT`) e doação opcional (`DONATION_URL`); cobrar só com autorização da World's Edge.
- Relógio do replay = relógio do jogo (o que o jogador vê), não tempo real. O prompt diz ao modelo que replay guarda comandos, não estado.
- Jogador é independente de usuário: qualquer visitante adiciona; dono reivindica via Steam.
- Liga global é semeada em `packages/db/src/migrate.ts`; divisões padrão em `DEFAULT_DIVISIONS` (sync). Nomes de divisão neutros.
- Ações de servidor das ligas em `apps/web/src/app/[locale]/leagues/actions.ts` e dos torneios em `tournaments/actions.ts`; página checa dono por `ownerUserId === session.uid`.
- Torneio: `stage` group|bracket em `tournament_matches`; chave criada da final pra trás (`nextMatchId/nextSlot`); só partidas depois de `bracketAt` contam. Teste local: `apps/worker/src/tools/test-tournament.ts`.
- Commits em português, sem Co-Authored-By. Formato: "verbo no presente + o que".
- Sem console.log no web em produção; no worker o log é proposital.
- `globals.css`: regras de elemento em `@layer base`, classes do tema (`panel`, `btn`, `tag`…) em `@layer components`; utilitários do Tailwind vencem, não use `!important` novo.
- Trilha de navegação: `<Breadcrumbs items=[...]>` no topo de toda página interna.
- Discord: eventos são detectados por polling das colunas `notified_at` (league_matches, league_members, seasons, tournament_games); anular/restaurar partida grava `updatedAt`.
