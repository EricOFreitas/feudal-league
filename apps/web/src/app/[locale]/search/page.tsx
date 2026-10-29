import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  AoeApiError, RM_1V1, getPersonalStatByAliases, joinStats, parsePlayerInput, resolveSteamVanity,
} from '@aoe2/aoe-api';
import { importPlayerByProfileId, importPlayerBySteamId, syncMatchHistory } from '@aoe2/sync';
import { redirect } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import { Flag } from '@/components/flag';
import { checkAdditionLimit, recordAddition } from '@/lib/additions';

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ q?: string }> };

export default async function SearchPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { q = '' } = await searchParams;
  const t = await getTranslations('search');
  const tc = await getTranslations('common');

  const Msg = ({ children }: { children: React.ReactNode }) => (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="panel p-6 text-parchment-100">{children}</div>
      <p><Link href="/">← {tc('back')}</Link></p>
    </div>
  );

  const input = parsePlayerInput(q);
  if (!input) return <Msg>{t('invalid')}</Msg>;

  if (!(await checkAdditionLimit())) return <Msg>{t('rateLimited')}</Msg>;

  try {
    if (input.kind === 'steam_id64' || input.kind === 'steam_vanity') {
      const id64 = input.kind === 'steam_id64' ? input.value : await resolveSteamVanity(input.value);
      if (!id64) return <Msg>{t('vanityFail')}</Msg>;
      const r = await importPlayerBySteamId(id64);
      if (!r) return <Msg>{t('noneSteam')}</Msg>;
      await recordAddition(r.profileId);
      await syncMatchHistory([r.profileId]).catch(() => undefined);
      redirect({ href: `/players/${r.profileId}`, locale });
    }
    if (input.kind === 'profile_id') {
      const r = await importPlayerByProfileId(input.value);
      if (!r) return <Msg>{t('noneId')}</Msg>;
      await recordAddition(r.profileId);
      await syncMatchHistory([r.profileId]).catch(() => undefined);
      redirect({ href: `/players/${r.profileId}`, locale });
    }
    // nick exato: pode vir 0, 1 ou vários
    const alias = String(input.value);
    const joined = joinStats(await getPersonalStatByAliases([alias]));
    const list = [...joined.values()];
    if (list.length === 0) return <Msg>{t('none', { alias })}</Msg>;
    if (list.length === 1) {
      const r = await importPlayerByProfileId(list[0]!.member.profile_id);
      if (r) {
        await recordAddition(r.profileId);
        await syncMatchHistory([r.profileId]).catch(() => undefined);
        redirect({ href: `/players/${r.profileId}`, locale });
      }
    }
    const fmtDate = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
    const sorted = list
      .map(({ member, stats }) => {
        const rm = stats.find((s) => s.leaderboard_id === RM_1V1);
        const last = Math.max(0, ...stats.map((s) => s.lastmatchdate));
        const games = stats.reduce((n, s) => n + s.wins + s.losses, 0);
        return { member, rm, last, games };
      })
      .sort((a, b) => b.last - a.last);

    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="text-center">
          <p className="kicker">{t('title')}</p>
          <p className="mt-2 text-parchment-200">{t('homonyms', { count: list.length, alias })}</p>
        </header>
        <ul className="space-y-2">
          {sorted.map(({ member, rm, last, games }) => (
            <li key={member.profile_id} className="panel flex items-center justify-between gap-4 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <Flag code={member.country} className="text-2xl" />
                <div className="min-w-0">
                  <div className="truncate font-display text-lg text-parchment-50">{member.alias}</div>
                  <div className="text-sm text-parchment-300">
                    {member.clanlist_name ? `[${member.clanlist_name}] · ` : ''}
                    #{member.profile_id} · {games > 0 ? `${t('lastMatch')}: ${fmtDate.format(new Date(last * 1000))}` : t('noRanked')}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="stat-num text-2xl">{rm ? rm.rating : '–'}</span>
                <Link href={`/players/${member.profile_id}`} className="btn btn-ghost !px-3 !py-1.5 !text-xs">{t('pick')}</Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  } catch (e) {
    if (e instanceof AoeApiError) return <Msg>{t('apiDown')}</Msg>;
    throw e;
  }
}
