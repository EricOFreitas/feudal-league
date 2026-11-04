import { getTranslations } from 'next-intl/server';
import { Target } from 'lucide-react';
import type { ChallengeAward, Division } from '@aoe2/db';
import { METRIC_LABEL } from '@/lib/metrics-format';
import { divisionName } from '@/lib/leagues';
import type { MetricKey } from '@aoe2/sync';

type Props = { awards: (ChallengeAward & { division: Division | null })[]; locale: string };

/** Lista dos desafios semanais cumpridos (perfil). Nada se a lista estiver vazia. */
export async function ChallengeAwards({ awards, locale }: Props) {
  if (awards.length === 0) return null;
  const t = await getTranslations('challenge');
  const td = await getTranslations('division');
  const dt = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
  return (
    <div className="panel p-5">
      <p className="kicker flex items-center gap-2"><Target className="h-4 w-4 text-[#b8702e]" />{t('awards.title')} · {awards.length}</p>
      <ul className="mt-3 space-y-1 text-sm">
        {awards.map((a) => (
          <li key={a.id} className="flex flex-wrap items-baseline gap-x-3">
            <span className="text-parchment-400">{t('awards.item', { date: dt.format(new Date(`${a.weekStart}T12:00:00Z`)) })}</span>
            <span className="text-parchment-100">{t(`goal.${METRIC_LABEL[a.metric as MetricKey] ?? a.metric}`)}</span>
            {a.division && <span className="text-xs text-parchment-400">{divisionName(a.division, td)}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
