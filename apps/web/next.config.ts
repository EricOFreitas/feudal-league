import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// Em dev o .env fica na raiz do monorepo. Variáveis já definidas no ambiente
// (Coolify, Docker) têm prioridade; sem o arquivo, segue sem erro.
try {
  process.loadEnvFile(path.resolve(process.cwd(), '../../.env'));
} catch {
  /* sem .env na raiz */
}

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const config: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@aoe2/aoe-api', '@aoe2/db', '@aoe2/sync'],
  serverExternalPackages: ['postgres'],
};

export default withNextIntl(config);
