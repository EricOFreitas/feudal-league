'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { createLeagueAction, type CreateState } from '../actions';

type Row = { nameKey: string; name: string; min: number; max: number | null };

export function NewLeagueForm({ locale, defaults }: { locale: string; defaults: Row[] }) {
  const t = useTranslations('leagues.new');
  const [state, action, pending] = useActionState<CreateState, FormData>(createLeagueAction, null);
  const rows: (Row | null)[] = [...defaults, ...Array(Math.max(0, 8 - defaults.length)).fill(null)];

  return (
    <form action={action} className="mx-auto max-w-3xl space-y-8">
      <input type="hidden" name="locale" value={locale} />
      <h1 className="text-3xl text-gold-300">{t('title')}</h1>

      {state?.error && <p className="panel border-crimson-500 p-3 text-parchment-50">{t(`errors.${state.error}`)}</p>}

      <div className="panel corners space-y-5 p-6">
        <div>
          <label htmlFor="name" className="kicker block">{t('name')}</label>
          <input id="name" name="name" className="input mt-2" required minLength={3} maxLength={60} placeholder={t('namePlaceholder')} />
        </div>
        <div>
          <label htmlFor="description" className="kicker block">{t('description')}</label>
          <textarea id="description" name="description" className="input mt-2 min-h-24" maxLength={2000} placeholder={t('descriptionPlaceholder')} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-start gap-3">
            <input type="checkbox" name="countRanked" defaultChecked className="mt-1.5 accent-gold-400" />
            <span>
              <span className="text-parchment-50">{t('countRanked')}</span>
              <span className="block text-sm text-parchment-400">{t('countRankedHint')}</span>
            </span>
          </label>
          <div>
            <label htmlFor="minGames" className="kicker block">{t('minGames')}</label>
            <input id="minGames" name="minGames" type="number" min={0} max={200} defaultValue={10} className="input mt-2" />
          </div>
        </div>
      </div>

      <div className="panel space-y-3 p-6">
        <p className="kicker">{t('divisions')}</p>
        <p className="text-sm text-parchment-400">{t('divisionsHint')}</p>
        <div className="grid grid-cols-[1fr_6rem_6rem] gap-2 text-xs uppercase tracking-wider text-parchment-400">
          <span>{t('divName')}</span><span>{t('divMin')}</span><span>{t('divMax')}</span>
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_6rem_6rem] gap-2">
            {r?.nameKey && <input type="hidden" name={`div.${i}.nameKey`} value={r.nameKey} />}
            {r && <input type="hidden" name={`div.${i}.defaultName`} value={r.name} />}
            <input name={`div.${i}.name`} className="input" defaultValue={r?.name ?? ''} maxLength={40} />
            <input name={`div.${i}.min`} type="number" className="input" defaultValue={r?.min ?? ''} min={0} max={5000} />
            <input name={`div.${i}.max`} type="number" className="input" defaultValue={r?.max ?? ''} min={0} max={5000} />
          </div>
        ))}
      </div>

      <button type="submit" className="btn" disabled={pending}>{t('submit')}</button>
    </form>
  );
}
