# Worker de sync + migrations. Contexto = raiz do repo.
FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@12.16.1 --activate
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/aoe-api/package.json packages/aoe-api/
COPY packages/db/package.json packages/db/
COPY packages/sync/package.json packages/sync/
RUN pnpm install --frozen-lockfile --filter @aoe2/worker... --filter @aoe2/db...
COPY packages ./packages
COPY apps/worker ./apps/worker
ENV NODE_ENV=production
# aplica migrations e entra no loop
CMD ["sh", "-c", "pnpm --filter @aoe2/db migrate && pnpm --filter @aoe2/worker start"]
