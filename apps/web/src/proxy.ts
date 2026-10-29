import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // tudo menos api, auth, arquivos do Next e arquivos com extensão
  matcher: ['/((?!api|auth|_next|_vercel|.*\\..*).*)'],
};
