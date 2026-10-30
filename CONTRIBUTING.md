# Contributing

Thanks for the interest. Feudal League is a small community project; the fastest way to help is with bug reports, translations and data corrections (civ names, map names, ladder ids).

## Before a large change

Open an issue first and describe what you want to change and why. Leagues, tournaments and the analysis prompt have product decisions behind them (see `docs/PLANO.md`, in Portuguese); a pull request that moves them without a conversation will probably be declined even if the code is good.

## Development

```bash
pnpm install
docker compose up -d
cp .env.example .env        # set SESSION_SECRET
pnpm db:migrate
pnpm --filter @aoe2/web dev
```

Before opening a pull request:

```bash
pnpm typecheck
pnpm --filter @aoe2/web lint
```

## Conventions

- Interface strings live in `apps/web/messages/base/{pt,en}.json` plus one file per area in `apps/web/messages/parts/<area>.{pt,en}.json`. `pnpm --filter @aoe2/web messages` merges them into the generated `messages/{pt,en}.json` (gitignored) and fails if pt and en keys differ; `dev`, `build`, `lint` and `typecheck` run it automatically.
- No game assets (logos, icons, art, music) in the repository. The visual identity is our own.
- Nothing that monetizes the game or looks official. The footer notice stays.
- Database changes go through Drizzle: edit `packages/db/src/schema.ts`, run `pnpm db:generate`, commit the migration.
- Business rules belong in `packages/sync`; pages and server actions in `apps/web` stay thin.
- Commit messages in the present tense, in English or Portuguese: "add X", "adiciona X".

## Translations

A new language needs `apps/web/messages/base/<locale>.json` (and a `<area>.<locale>.json` for every file in `parts/`) with the same keys as English, plus an entry in `apps/web/src/i18n/routing.ts` and in `scripts/merge-messages.mjs`. Keep unit, building and technology names as the game shows them in that language.
