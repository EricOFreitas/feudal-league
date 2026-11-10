# Feudal League — ligas, torneios e análise de partidas para AoE2 DE

Plano e decisões: `docs/PLANO.md`. Ler antes de mexer em escopo.

## Stack

- **Web:** Next.js 16 (App Router) + TypeScript + Tailwind v4 + next-intl (`/pt`, `/en`)
- **Worker:** Node (tsx) em loop, mesmo repo; processa também a fila de análises (a cada 10 s)
- **Analyzer:** Python (FastAPI + mgz) em `apps/analyzer`. Baixa o replay oficial (`aoe.ms/replay`) e resume o corpo; só o worker fala com ele. Cabeçalho do replay não parseia (mgz #138): slots vêm da varredura dos profile_ids no cabeçalho.
- **IA:** OpenRouter (`OPENROUTER_API_KEY`, `LLM_MODEL`), chamada direta por fetch em `packages/sync/src/analyses.ts`
- **Banco:** PostgreSQL + Drizzle (`packages/db`, migrations em `packages/db/drizzle`)
- **Dados:** API do jogo (World's Edge), só em `packages/aoe-api`. Não documentada, sem auth. Única exceção: busca por trecho do nick no aoe2companion (`packages/aoe-api/src/companion.ts`), que só devolve profile_ids.
- **Auth:** Steam OpenID 2.0 à mão (`apps/web/src/lib/steam-openid.ts`) + cookie JWT (jose)
- **Infra:** Coolify com build pack Docker Compose (`docker-compose.coolify.yml`: migrate + web + worker + analyzer); banco é um Postgres gerenciado fora do compose. Domínio chega por proxy reverso próprio, não pelo Traefik do Coolify. Detalhes privados (hosts, IPs, uuids) ficam fora do repositório. `GET /api/health` (JSON: sonda do banco, idade do worker, incidentes) alimenta um monitor externo; manter barato e sem dado pessoal. Dev: `docker compose up -d` sobe o Postgres em 127.0.0.1:5433.

## Estrutura

```
apps/web            Next.js (páginas em src/app/[locale]/, rotas de auth em src/app/auth/)
apps/worker         sync por prioridade (liga 15min, reivindicado ou seguido 1h, visto 6h) + detecção de partidas de liga + métricas de treino (replay sem IA) + desafio da semana + lobbies de treino (30 s) + fila de análises
apps/analyzer       Python: replay → JSON (POST /parse). Dockerfile próprio; local: uvicorn main:app
packages/aoe-api    cliente da API + ids (ladders, civs) + parser de entrada Steam
packages/db         schema Drizzle, cliente, migrate
packages/sync       regras: players/matches; ligas em leagues.ts; liga mensal e medalhas em podium.ts; dados da home em home.ts; análise em analyses.ts (cliente do analyzer em analyzer.ts); métricas de treino e benchmarks por divisão em metrics.ts, foco de treino em focus.ts, desafio da semana em challenges.ts, build orders em build-orders.ts/bo-check.ts e sparring/mentoria em sparring.ts (docs/TREINO.md); torneios em tournaments.ts; Discord em notify.ts; badges.ts; status.ts (sync_runs/incidentes); snapshots.ts (evolução semanal); seguir jogador em follows.ts (página `/following`)
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
- Nada que seja asset do jogo (logo, ícone, arte). Identidade visual própria em `globals.css` e `crest.tsx`. Exceção decidida pelo Eric (10/11/2026): a imagem que o organizador sobe no próprio torneio (`tournament_images`) é responsabilidade dele, mesmo com arte do jogo.
- Sem monetização (Game Content Usage Rules). Aviso no rodapé fica. Análise com IA é grátis com limite diário (`ANALYSIS_DAILY_LIMIT`) e doação opcional (`DONATION_URL`); cobrar só com autorização da World's Edge.
- Relógio do replay = relógio do jogo (o que o jogador vê), não tempo real. O prompt diz ao modelo que replay guarda comandos, não estado.
- Jogador é independente de usuário: qualquer visitante adiciona; dono reivindica via Steam.
- Global é mensal (`seasons.ends_at`): worker vira o mês em `rollMonthlySeasons` e apura em `awardMonthlyPodiums`; ligas próprias fecham à mão. Medalha só na Global.
- Liga global é semeada em `packages/db/src/migrate.ts`; divisões padrão em `DEFAULT_DIVISIONS` (sync). Nomes de divisão neutros.
- Ações de servidor das ligas em `apps/web/src/app/[locale]/leagues/actions.ts` e dos torneios em `tournaments/actions.ts`; liga checa dono por `ownerUserId === session.uid`; torneio por `canManageTournament` (dono ou co-organizador em `tournament_organizers`, reconhecido pelo SteamID da sessão); co-organizadores e cancelar só o dono.
- Torneio: `stage` group|bracket em `tournament_matches`; chave criada da final pra trás (`nextMatchId/nextSlot`); só partidas depois de `bracketAt` contam. Grupos com `group_play_all` jogam os N jogos (1 ponto por jogo). Edição em `tournaments/[slug]/edit` (`updateTournament`). Teste local: `apps/worker/src/tools/test-tournament.ts`.
- Commits em português, sem Co-Authored-By. Formato: "verbo no presente + o que".
- Sem console.log no web em produção; `console.error` só pra falha da API do jogo (diagnóstico). No worker o log é proposital.
- `globals.css`: regras de elemento em `@layer base`, classes do tema (`panel`, `btn`, `tag`…) em `@layer components`; utilitários do Tailwind vencem, não use `!important` novo.
- Trilha de navegação: `<Breadcrumbs items=[...]>` no topo de toda página interna.
- Discord: eventos são detectados por polling das colunas `notified_at` (league_matches, league_members, seasons, tournament_games); anular/restaurar partida grava `updatedAt`.
