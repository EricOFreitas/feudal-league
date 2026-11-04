import { getTranslations } from 'next-intl/server';
import { Target } from 'lucide-react';
import { CHALLENGE_MATCHES, type Challenge, type ChallengeProgress } from '@aoe2/sync';
import { Flag } from '@/components/flag';
import { Link } from '@/i18n/navigation';
import { METRIC_LABEL, fmtMetric } from '@/lib/metrics-format';

const TZ = 'America/Sao_Paulo';
/** Domingo da semana do desafio (weekEnd é a segunda seguinte às 03:00 UTC). */
const sunday = (ch: Challenge, locale: string) => new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', timeZone: TZ }).format(new Date(ch.weekEnd.getTime() - 24 * 60 * 60 * 1000));

type CardProps = {
  ch: Challenge;
  locale: string;
  /** Mediana da divisão do jogador na métrica; null = sem amostras; divisionLabel null = sem liga. */
  target: number | null;
  divisionLabel: string | null;
  /** Progresso do jogador logado; null = não logado / sem jogador. */
  progress: ChallengeProgress | null;
  completed: boolean;
  loggedIn: boolean;
};

/** Cartão do desafio da semana (treino, T4): meta, alvo da divisão e progresso do jogador. Servidor; sem estado. */
export async function ChallengeCard({ ch, locale, target, divisionLabel, progress, completed, loggedIn }: CardProps) {
  const t = await getTranslations('challenge');
  const label = METRIC_LABEL[ch.metric];
  const dt = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', timeZone: TZ });
  return (
    <div className="panel border-l-4 border-l-[#b8702e] p-5">
      <p className="kicker flex items-center gap-2"><Target className="h-4 w-4 text-[#b8702e]" />{t('title')}</p>
      <p className="mt-2 font-display text-xl text-gold-300 sm:text-2xl">{t(`goal.${label}`)}</p>
      <p className="mt-2 text-sm text-parchment-300">{t('rule', { n: CHALLENGE_MATCHES, end: sunday(ch, locale) })}</p>
      <p className="mt-2 text-sm text-parchment-200">
        {divisionLabel == null ? t('noDivision') : target == null ? t('targetNone', { division: divisionLabel }) : t('target', { division: divisionLabel, value: fmtMetric(ch.metric, target) })}
      </p>
      {!loggedIn ? (
        <p className="mt-4 text-sm"><Link href="/login">{t('login')} →</Link></p>
      ) : progress && (
        <div className="mt-4 border-t border-gold-800/40 pt-4">
          <div className="flex items-center gap-3">
            <span className={`stat-num text-2xl ${completed ? 'text-moss-500' : 'text-parchment-50'}`}>{progress.done}/{progress.needed}</span>
            <span className="text-sm text-parchment-300">{completed ? t('completed') : t('progress', { done: progress.done, n: progress.needed })}</span>
          </div>
          {progress.matches.length === 0 ? (
            <p className="mt-2 text-sm text-parchment-400">{t('noMatches')}</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {progress.matches.map((m) => (
                <li key={m.matchId} className="flex flex-wrap items-baseline gap-x-3">
                  <span className="text-parchment-400">{dt.format(m.playedAt)}</span>
                  <span className="stat-num text-parchment-50">{m.value == null ? '–' : fmtMetric(ch.metric, m.value)}</span>
                  {m.target != null && <span className="text-xs text-parchment-400">/ {fmtMetric(ch.metric, m.target)}</span>}
                  <span className={m.ok ? 'text-moss-500' : m.target == null ? 'text-parchment-400' : 'text-crimson-500'}>{m.ok ? t('match.ok') : m.target == null ? t('match.pending') : t('match.miss')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

type PanelProps = {
  ch: Challenge;
  target: number | null;
  divisionLabel: string;
  completers: { profileId: number; alias: string; country: string | null }[];
};

/** Painel curto na página da liga: meta da semana, alvo da divisão e quem já cumpriu. */
export async function ChallengePanel({ ch, target, divisionLabel, completers }: PanelProps) {
  const t = await getTranslations('challenge');
  return (
    <div className="panel p-5">
      <p className="kicker flex items-center gap-2"><Target className="h-4 w-4 text-[#b8702e]" />{t('title')}</p>
      <p className="mt-2 font-display text-lg text-gold-300">{t(`goal.${METRIC_LABEL[ch.metric]}`)}</p>
      <p className="mt-1 text-sm text-parchment-300">{target == null ? t('targetNone', { division: divisionLabel }) : t('target', { division: divisionLabel, value: fmtMetric(ch.metric, target) })}</p>
      <p className="mt-3 text-xs uppercase tracking-wider text-parchment-400">{t('completers')}</p>
      {completers.length === 0 ? (
        <p className="mt-1 text-sm text-parchment-400">{t('nobody')}</p>
      ) : (
        <ul className="mt-1 space-y-1 text-sm">
          {completers.map((p) => <li key={p.profileId}><Link href={`/players/${p.profileId}`} className="inline-flex items-center gap-2"><Flag code={p.country} className="text-base leading-none" />{p.alias}</Link></li>)}
        </ul>
      )}
      <p className="mt-3 text-sm"><Link href="/training#challenge">{t('more')} →</Link></p>
    </div>
  );
}
