import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const config: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@aoe2/aoe-api', '@aoe2/db', '@aoe2/sync'],
  serverExternalPackages: ['postgres'],
};

export default withNextIntl(config);
