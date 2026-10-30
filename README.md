# Feudal League

Community portal for **Age of Empires II: Definitive Edition**: rating-bracket leagues, tournaments and AI match feedback. Interface in Portuguese and English.

Live (provisional domain): https://aoe2.ericofreitas.eng.br

## What it does

- **Players**: anyone can add a player by Steam profile or profile id, no login needed. Ratings, ranks and recent matches are synced from the game's own servers. Owners claim their profile with Steam login.
- **Leagues**: a global league plus user-created ones (clans, Discords, cities). Players are placed in divisions by their *peak* RM 1v1 rating (anti-smurf), frozen for the season. 1v1 matches between members of the same division are detected automatically from match history: win 3 points, loss 1.
- **Tournaments**: teams of 1 to 4, optional group stage, single-elimination bracket, best of 1/3/5 with a separate final setting. Configurable anti-smurf requirements (peak rating, total games, recent games). Results are confirmed automatically when the match shows up in the players' history, with manual reporting as fallback.
- **Match analysis**: the official recorded game is downloaded, summarized (age-up times, build order, production per 5-minute window, upgrades, military) and a language model writes coaching feedback for the player. Free, with a daily limit per account.

## Stack

pnpm workspace + Turborepo.

| Path | What |
|---|---|
| `apps/web` | Next.js 16 (App Router, Server Actions), Tailwind v4, next-intl |
| `apps/worker` | Node loop: sync by priority, league/tournament detection, analysis queue |
| `apps/analyzer` | Python (FastAPI + [mgz](https://github.com/happyleavesaoc/aoc-mgz)): replay → JSON summary |
| `packages/aoe-api` | Client for the game's community API (undocumented, no auth) |
| `packages/db` | PostgreSQL schema with Drizzle ORM, migrations |
| `packages/sync` | Business rules: players, matches, leagues, tournaments, analyses |

Auth is Steam OpenID 2.0 with a signed cookie. The LLM is called through OpenRouter (any OpenAI-compatible model id).

## Running locally

```bash
pnpm install
docker compose up -d                      # PostgreSQL on 127.0.0.1:5433
cp .env.example .env                      # then set SESSION_SECRET (openssl rand -base64 48)
pnpm db:migrate
pnpm --filter @aoe2/web dev               # http://localhost:3000
pnpm --filter @aoe2/worker once           # one sync cycle

# analyzer (optional, needed for match analysis)
cd apps/analyzer && python -m venv venv && ./venv/bin/pip install -r requirements.txt
./venv/bin/uvicorn main:app --port 8000
```

Environment variables are documented in `.env.example`. Steam login needs `APP_URL` reachable by your browser.

## Deploying

`docker-compose.coolify.yml` builds four services (migrate, web, worker, analyzer) and expects an external PostgreSQL. It was written for Coolify's Docker Compose build pack but has nothing Coolify-specific.

## Notes on data

- Rating and match data come from the game's servers and may lag a few minutes.
- The replay header does not parse with the current `mgz` release (issue #138); the analyzer reads only the body and maps slots by scanning profile ids in the header. The in-game clock is used everywhere.
- The recorded game stores commands, not state: the analysis knows timings and decisions, not resources in stock or idle time.

## Contributing

Issues and small pull requests are welcome: translations, bug fixes, data corrections. For anything larger, open an issue first so we can talk about scope. Interface strings live in `apps/web/messages/{pt,en}.json` and both files must have the same keys.

## License and trademarks

Code is licensed under the [GNU AGPL v3](LICENSE).

Age of Empires II: Definitive Edition © Microsoft Corporation. Feudal League was created under Microsoft's [Game Content Usage Rules](https://www.xbox.com/en-US/developers/rules) and is not endorsed by or affiliated with Microsoft. No game assets are included in this repository.
