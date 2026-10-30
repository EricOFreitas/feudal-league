'use client';

import { useActionState, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { createTournamentAction, type CreateState } from '../actions';

const SIZES = [1, 2, 3, 4];
const BEST = [1, 3, 5];

export function NewTournamentForm() {
  const t = useTranslations('tournaments.new');
  const locale = useLocale();
  const [state, action, pending] = useActionState<CreateState, FormData>(createTournamentAction, null);
  const [groups, setGroups] = useState(false);
  const field = 'w-full rounded border border-gold-700/60 bg-stone-950/60 px-3 py-2 text-parchment-50';
  const label = 'block text-sm text-parchment-300';

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="locale" value={locale} />
      {state?.error && <p className="rounded border border-crimson-500/60 bg-crimson-500/10 p-3 text-sm text-parchment-50">{t(`errors.${state.error}`)}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className={label}>{t('name')}</span><input name="name" required minLength={3} maxLength={60} className={field} /></label>
        <label className="sm:col-span-2"><span className={label}>{t('description')}</span><textarea name="description" rows={4} maxLength={4000} className={field} /></label>
        <label><span className={label}>{t('teamSize')}</span>
          <select name="teamSize" defaultValue={2} className={field}>{SIZES.map((n) => <option key={n} value={n}>{n}v{n}</option>)}</select></label>
        <label><span className={label}>{t('maxTeams')}</span><input name="maxTeams" type="number" min={2} max={256} className={field} /></label>
        <label><span className={label}>{t('bestOf')}</span>
          <select name="bestOf" defaultValue={1} className={field}>{BEST.map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        <label><span className={label}>{t('finalBestOf')}</span>
          <select name="finalBestOf" defaultValue="" className={field}><option value="">{t('same')}</option>{BEST.map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        <label><span className={label}>{t('startsAt')}</span><input name="startsAt" type="datetime-local" className={field} /></label>
        <label><span className={label}>{t('prize')}</span><input name="prize" maxLength={300} className={field} /></label>
      </div>

      <fieldset className="space-y-3 rounded border border-gold-700/40 p-4">
        <legend className="px-2 font-display text-gold-300">{t('groups')}</legend>
        <label className="flex items-center gap-2 text-sm text-parchment-200">
          <input type="checkbox" checked={groups} onChange={(e) => setGroups(e.target.checked)} /> {groups ? t('groups') : t('noGroups')}
        </label>
        {groups && (
          <div className="grid gap-4 sm:grid-cols-3">
            <label><span className={label}>{t('groupCount')}</span><input name="groupCount" type="number" min={1} max={16} defaultValue={2} className={field} /></label>
            <label><span className={label}>{t('advance')}</span><input name="advancePerGroup" type="number" min={1} max={8} defaultValue={2} className={field} /></label>
            <label><span className={label}>{t('groupBestOf')}</span>
              <select name="groupBestOf" defaultValue={1} className={field}>{BEST.map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-3 rounded border border-gold-700/40 p-4">
        <legend className="px-2 font-display text-gold-300">{t('reqTitle')}</legend>
        <p className="text-sm text-parchment-400">{t('optional')}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <label><span className={label}>{t('maxPeak')}</span><input name="maxPeakRating" type="number" min={0} max={5000} placeholder="1100" className={field} /></label>
          <label><span className={label}>{t('minGames')}</span><input name="minGames" type="number" min={0} max={10000} placeholder="50" className={field} /></label>
          <label><span className={label}>{t('minRecent')}</span><input name="minRecentGames" type="number" min={0} max={1000} placeholder="20" className={field} /></label>
        </div>
      </fieldset>

      <button type="submit" disabled={pending} className="btn btn-primary">{t('submit')}</button>
    </form>
  );
}
