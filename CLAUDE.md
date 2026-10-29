# Ligas AoE2 — portal de ligas e torneios por faixa de rating (AoE2 DE)

Plano e decisões: `docs/PLANO.md`. Ler antes de mexer em escopo.

## Stack

- **Web:** Next.js 16 (App Router) + TypeScript + Tailwind v4 + next-intl (`/pt`, `/en`)
- **Worker:** Node (tsx) em loop, mesmo repo
- **Banco:** PostgreSQL + Drizzle (`packages/db`, migrations em `packages/db/drizzle`)
- **Dados:** API do jogo (World's Edge), só em `packages/aoe-api`. Não documentada, sem auth.
- **Auth:** Steam OpenID 2.0 à mão (`apps/web/src/lib/steam-openid.ts`) + cookie JWT (jose)
- **Infra:** Coolify na VPS (web, worker, postgres). Dev: `docker compose up -d` sobe o Postgres em 127.0.0.1:5433.

## Estrutura

```
apps/web            Next.js (páginas em src/app/[locale]/, rotas de auth em src/app/auth/)
apps/worker         sync por prioridade (liga 15min, reivindicado 1h, visto 6h) + detecção de partidas de liga
packages/aoe-api    cliente da API + ids (ladders, civs) + parser de entrada Steam
packages/db         schema Drizzle, cliente, migrate
packages/sync       regras: upsert de jogador/rating/snapshot/partidas; ligas (inscrição, detecção, tabela) em leagues.ts
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
pnpm typecheck
```

## Convenções

- Strings de interface SEMPRE em `apps/web/messages/{pt,en}.json`, as duas com as mesmas chaves.
- Nada que seja asset do jogo (logo, ícone, arte). Identidade visual própria em `globals.css` e `crest.tsx`.
- Sem monetização (Game Content Usage Rules). Aviso no rodapé fica.
- Jogador é independente de usuário: qualquer visitante adiciona; dono reivindica via Steam.
- Liga global é semeada em `packages/db/src/migrate.ts`; divisões padrão em `DEFAULT_DIVISIONS` (sync). Nomes de divisão neutros.
- Ações de servidor das ligas em `apps/web/src/app/[locale]/leagues/actions.ts`; página checa dono por `ownerUserId === session.uid`.
- Commits em português, sem Co-Authored-By. Formato: "verbo no presente + o que".
- Sem console.log no web em produção; no worker o log é proposital.
