import { getTranslations } from 'next-intl/server';
import { membershipsOf, snapshotSeries } from '@aoe2/sync';
import { Link } from '@/i18n/navigation';
import { divisionName } from '@/lib/leagues';
import { EvolutionChart } from './evolution-chart';

type Membership = Awaited<ReturnType<typeof membershipsOf>>[number];

/**
 * "Evolução na temporada" do perfil: uma aba por inscrição ativa (searchParam `evo` = leagueId),
 * 4 números e o gráfico. A série são as fotos semanais da divisão atual + a posição de agora.
 */
export async function EvolutionSection({ profileId, playerId, memberships, evo, locale }: {
  profileId: number;
  playerId: number;
  memberships: Membership[];
  evo: number | null;
  locale: string;
}) {
  if (memberships.length === 0) return null;
  const t = await getTranslations('player.evolution');
  const td = await getTranslations('division');
  const tlg = await getTranslations('leagues');

  const active = memberships.find((m) => m.leagueId === evo) ?? memberships.find((m) => m.league.isGlobal) ?? memberships[0]!;
  // Só fotos da divisão atual: posição de outra divisão (troca no meio da temporada) não é comparável.
  const series = (await snapshotSeries(playerId, active.seasonId)).filter((s) => s.divisionId === active.divisionId);
  const positions = series.map((s) => s.position);
  if (active.position > 0) positions.push(active.position);
  const n = positions.length;

  const since = active.joinedAt > active.season.startedAt ? active.joinedAt : active.season.startedAt;
  const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(since);
  const pos = (p: number) => t('pos', { pos: p });
  const signed = (d: number) => `${d > 0 ? '+' : ''}${d}`;
  const tone = (d: number | null) => (d == null || d === 0 ? 'text-gold-300' : d > 0 ? 'text-moss-500' : 'text-crimson-500');

  // Variação positiva = subiu na tabela (posição menor).
  const seasonDelta = n >= 2 ? positions[0]! - positions[n - 1]! : null;
  const weekDelta = n >= 2 ? positions[n - 2]! - positions[n - 1]! : null;
  const stats = [
    { label: t('now'), value: active.position > 0 ? pos(active.position) : '—', cls: 'text-gold-300' },
    { label: t('best'), value: n > 0 ? pos(Math.min(...positions)) : '—', cls: 'text-gold-300' },
    { label: t('season'), value: seasonDelta == null ? '—' : t('seasonDelta', { n: Math.abs(seasonDelta), delta: signed(seasonDelta) }), cls: tone(seasonDelta) },
    { label: t('lastWeek'), value: weekDelta == null ? '—' : signed(weekDelta), cls: tone(weekDelta) },
  ];

  return (
    <section id="evolution">
      <div className="rule mb-5"><span className="kicker">{t('title')}</span></div>
      <div className="panel p-5">
        <div className="relative z-[1] flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav aria-label={t('tabs')} className="flex flex-wrap gap-2">
              {memberships.map((m) => {
                const on = m.id === active.id;
                return (
                  <Link
                    key={m.id}
                    href={`/players/${profileId}?evo=${m.leagueId}`}
                    scroll={false}
                    aria-current={on ? 'page' : undefined}
                    className={`rounded-[3px] border px-3 py-1.5 font-display text-[0.72rem] tracking-[0.15em] uppercase hover:border-gold-500 hover:!text-gold-300 hover:no-underline ${on ? 'border-gold-500 bg-gold-600/30 !text-gold-300' : 'border-gold-700 !text-parchment-400'}`}
                  >
                    {t('tab', { league: m.league.isGlobal ? tlg('global') : m.league.name, division: divisionName(m.division, td) })}
                  </Link>
                );
              })}
            </nav>
            <span className="text-sm text-parchment-400">{t('caption', { n: active.season.number, date, count: active.total })}</span>
          </div>

          <dl className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
            {stats.map((s) => (
              <div key={s.label}>
                <dt className="text-sm text-parchment-400">{s.label}</dt>
                <dd className={`font-display text-2xl tabular-nums ${s.cls}`}>{s.value}</dd>
              </div>
            ))}
          </dl>

          {n >= 2 ? (
            <EvolutionChart positions={positions} posLabel={pos} weekLabel={(w) => t('week', { n: w })} aria={t('aria')} />
          ) : (
            <p className="italic text-parchment-400">{t('empty')}</p>
          )}
          <p className="text-sm text-parchment-400">{t('note')}</p>
        </div>
      </div>
    </section>
  );
}
