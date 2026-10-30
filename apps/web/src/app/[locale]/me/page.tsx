import { getTranslations, setRequestLocale } from 'next-intl/server';
import { db, players } from '@aoe2/db';
import { findPlayerBySteamId, importPlayerBySteamId, syncMatchHistory } from '@aoe2/sync';
import { eq } from 'drizzle-orm';
import { redirect } from '@/i18n/navigation';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { getSession } from '@/lib/session';

export default async function MePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('me');
  const tn = await getTranslations('nav');
  const ts = await getTranslations('search');
  const session = await getSession();

  if (!session) {
    return (
      <>
        <Breadcrumbs items={[{ label: tn('me') }]} />
        <div className="panel mx-auto max-w-md p-8 text-center">
          <h1 className="text-2xl text-gold-300">{t('title')}</h1>
          <p className="mt-3 text-parchment-200">{t('notLogged')}</p>
          <a href="/auth/steam" className="btn mt-6">{tn('login')}</a>
        </div>
      </>
    );
  }

  const player = await findPlayerBySteamId(session.sid);
  if (player) {
    if (player.claimedByUserId == null) await db.update(players).set({ claimedByUserId: session.uid }).where(eq(players.id, player.id));
    redirect({ href: `/players/${player.profileId}`, locale });
  }

  // tenta importar agora (pode ter falhado no login por API fora)
  let failed = false;
  try {
    const r = await importPlayerBySteamId(session.sid);
    if (r) {
      await syncMatchHistory([r.profileId]).catch(() => undefined);
      await db.update(players).set({ claimedByUserId: session.uid }).where(eq(players.id, r.id));
      redirect({ href: `/players/${r.profileId}`, locale });
    }
  } catch { failed = true; }

  return (
    <>
      <Breadcrumbs items={[{ label: tn('me') }]} />
      <div className="panel mx-auto max-w-md p-8 text-center">
        <h1 className="text-2xl text-gold-300">{t('title')}</h1>
        <p className="mt-3 text-parchment-200">{failed ? ts('apiDown') : t('noPlayer')}</p>
        <a href={`/${locale}/me`} className="btn btn-ghost mt-6">{t('link')}</a>
      </div>
    </>
  );
}
