import { getTranslations } from 'next-intl/server';
import { Crosshair } from 'lucide-react';
import { FOCUS_MATCHES, FOCUS_MIN_MATCHES, type TrainingFocus } from '@aoe2/sync';
import { METRIC_LABEL as LABEL, fmtMetric as fmt } from '@/lib/metrics-format';

type Props = {
  focus: TrainingFocus;
  /** Nomes das divisões de referência (null = sem liga / já é a mais alta). */
  divisionLabel: string | null;
  aboveLabel: string | null;
  /** Mostrar também os estados "poucas partidas" e "divisão sem amostras" (só pro dono do perfil). */
  showEmpty?: boolean;
};

/** Cartão "Foco de treino" (treino, T3): um objetivo só, escolhido das últimas partidas lidas. Servidor; sem estado. */
export async function FocusCard({ focus, divisionLabel, aboveLabel, showEmpty = false }: Props) {
  const t = await getTranslations('focus');
  const tb = await getTranslations('benchmarks');
  if ((focus.kind === 'few' || focus.kind === 'noBench') && !showEmpty) return null;

  return (
    <div className="panel border-l-4 border-l-gold-500 p-5">
      <p className="kicker flex items-center gap-2"><Crosshair className="h-4 w-4 text-gold-400" />{t('title')}</p>
      {focus.kind === 'focus' ? (
        <>
          <p className="mt-2 font-display text-xl text-gold-300 sm:text-2xl">{t(`goal.${LABEL[focus.key]}`)}</p>
          <p className="mt-2 text-sm text-parchment-200">
            {t('why', {
              metric: tb(`metric.${LABEL[focus.key]}`), worse: focus.worse, total: focus.total,
              ref: focus.level === 'above' ? t('refAbove', { name: aboveLabel ?? '' }) : t('refDivision', { name: divisionLabel ?? '' }),
              target: fmt(focus.key, focus.target), mine: fmt(focus.key, focus.mine),
            })}
          </p>
          {focus.level === 'above' && <p className="mt-1 text-sm text-moss-500">{t('aboveNote')}</p>}
          <p className="mt-3 text-sm leading-relaxed text-parchment-300">{t(`tip.${LABEL[focus.key]}`)}</p>
        </>
      ) : focus.kind === 'ahead' ? (
        <p className="mt-2 text-parchment-200">{t(focus.checkedAbove ? 'aheadAbove' : 'ahead', { total: focus.total })}</p>
      ) : focus.kind === 'few' ? (
        <p className="mt-2 text-parchment-300">{t('few', { total: focus.total, min: FOCUS_MIN_MATCHES })}</p>
      ) : (
        <p className="mt-2 text-parchment-300">{t('noBench')}</p>
      )}
      <p className="mt-3 text-xs text-parchment-400">{t('note', { n: FOCUS_MATCHES })}</p>
    </div>
  );
}
