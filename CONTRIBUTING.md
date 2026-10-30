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

- Interface strings live in `apps/web/messages/pt.json` and `en.json`. Both files must have exactly the same keys; the build does not check this, so please do.
- No game assets (logos, icons, art, music) in the repository. The visual identity is our own.
- Nothing that monetizes the game or looks official. The footer notice stays.
- Database changes go through Drizzle: edit `packages/db/src/schema.ts`, run `pnpm db:generate`, commit the migration.
- Business rules belong in `packages/sync`; pages and server actions in `apps/web` stay thin.
- Commit messages in the present tense, in English or Portuguese: "add X", "adiciona X".

## Translations

A new language needs a `apps/web/messages/<locale>.json` with the same keys as `en.json` and an entry in `apps/web/src/i18n/routing.ts`. Keep unit, building and technology names as the game shows them in that language.
