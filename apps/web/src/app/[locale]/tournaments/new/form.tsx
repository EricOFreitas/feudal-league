'use client';

import { useActionState, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { createTournamentAction, updateTournamentAction, type CreateState } from '../actions';

const SIZES = [1, 2, 3, 4];
const BEST = [1, 3, 5];

export type TournamentFormInitial = {
  name: string; description: string; organizerName: string; organizerUrl: string; registrationClosed: boolean; teamSize: number; maxTeams: number | null; bestOf: number; finalBestOf: number | null;
  startsAt: string; prize: string; groupCount: number; advancePerGroup: number; groupBestOf: number; groupPlayAll: boolean;
  maxPeakRating: number | null; minGames: number | null; minRecentGames: number | null;
};

type Props =
  | { mode: 'create' }
  | {
    mode: 'edit'; initial: TournamentFormInitial; tournamentId: number; slug: string;
    /** Torneio já começou: só nome, descrição, premiação e início mudam. */
    formatLocked: boolean;
    /** Há times inscritos: o tamanho do time não muda. */
    sizeLocked: boolean;
  };

const EMPTY: TournamentFormInitial = {
  name: '', description: '', organizerName: '', organizerUrl: '', registrationClosed: false, teamSize: 2, maxTeams: null, bestOf: 1, finalBestOf: null, startsAt: '', prize: '',
  groupCount: 2, advancePerGroup: 2, groupBestOf: 1, groupPlayAll: false, maxPeakRating: null, minGames: null, minRecentGames: null,
};

/** Formulário de torneio: cria (/tournaments/new) ou edita (/tournaments/[slug]/edit). */
export function TournamentForm(props: Props) {
  const t = useTranslations('tournaments.new');
  const locale = useLocale();
  const edit = props.mode === 'edit';
  const init = edit ? props.initial : EMPTY;
  const formatLocked = edit && props.formatLocked;
  const sizeLocked = formatLocked || (edit && props.sizeLocked);
  const [state, action, pending] = useActionState<CreateState, FormData>(edit ? updateTournamentAction : createTournamentAction, null);
  const [groups, setGroups] = useState(edit && init.groupCount > 0);
  const field = 'w-full rounded border border-gold-700/60 bg-stone-950/60 px-3 py-2 text-parchment-50 disabled:opacity-50';
  const label = 'block text-sm text-parchment-300';
  const num = (n: number | null) => (n == null ? '' : n);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="locale" value={locale} />
      {edit && <><input type="hidden" name="tournamentId" value={props.tournamentId} /><input type="hidden" name="slug" value={props.slug} /></>}
      {state?.error && <p className="rounded border border-crimson-500/60 bg-crimson-500/10 p-3 text-sm text-parchment-50">{t(`errors.${state.error}`)}</p>}
      {formatLocked && <p className="rounded border border-gold-700/60 bg-black/20 p-3 text-sm text-parchment-200">{t('lockedStarted')}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className={label}>{t('name')}</span><input name="name" required minLength={3} maxLength={60} defaultValue={init.name} className={field} /></label>
        <label className="sm:col-span-2"><span className={label}>{t('description')}</span><textarea name="description" rows={edit ? 8 : 4} maxLength={4000} defaultValue={init.description} className={field} /></label>
        <label><span className={label}>{t('teamSize')}</span>
          <select name="teamSize" defaultValue={init.teamSize} disabled={sizeLocked} className={field}>{SIZES.map((n) => <option key={n} value={n}>{n}v{n}</option>)}</select>
          {sizeLocked && !formatLocked && <span className="mt-1 block text-xs text-parchment-400">{t('lockedSize')}</span>}
        </label>
        <label><span className={label}>{t('maxTeams')}</span><input name="maxTeams" type="number" min={2} max={256} defaultValue={num(init.maxTeams)} disabled={formatLocked} className={field} /></label>
        <label><span className={label}>{t('bestOf')}</span>
          <select name="bestOf" defaultValue={init.bestOf} disabled={formatLocked} className={field}>{BEST.map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        <label><span className={label}>{t('finalBestOf')}</span>
          <select name="finalBestOf" defaultValue={init.finalBestOf ?? ''} disabled={formatLocked} className={field}><option value="">{t('same')}</option>{BEST.map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        <label><span className={label}>{t('startsAt')}</span><input name="startsAt" type="datetime-local" defaultValue={init.startsAt} className={field} /></label>
        <label><span className={label}>{t('prize')}</span><input name="prize" maxLength={300} defaultValue={init.prize} className={field} /></label>
        <label><span className={label}>{t('organizerName')}</span><input name="organizerName" maxLength={60} defaultValue={init.organizerName} className={field} /></label>
        <label><span className={label}>{t('organizerUrl')}</span><input name="organizerUrl" type="url" maxLength={200} placeholder="https://" defaultValue={init.organizerUrl} className={field} /></label>
        {edit && (
          <label className="flex items-start gap-2 self-end text-sm text-parchment-200">
            <input type="checkbox" name="registrationClosed" defaultChecked={init.registrationClosed} disabled={formatLocked} className="mt-1" />
            <span>{t('registrationClosed')}<span className="block text-xs text-parchment-400">{t('registrationClosedHint')}</span></span>
          </label>
        )}
      </div>

      <fieldset className="space-y-3 rounded border border-gold-700/40 p-4" disabled={formatLocked}>
        <legend className="px-2 font-display text-gold-300">{t('groups')}</legend>
        <label className="flex items-center gap-2 text-sm text-parchment-200">
          <input type="checkbox" name="hasGroups" checked={groups} onChange={(e) => setGroups(e.target.checked)} /> {groups ? t('groups') : t('noGroups')}
        </label>
        {groups && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <label><span className={label}>{t('groupCount')}</span><input name="groupCount" type="number" min={1} max={16} defaultValue={init.groupCount || 2} className={field} /></label>
              <label><span className={label}>{t('advance')}</span><input name="advancePerGroup" type="number" min={1} max={8} defaultValue={init.advancePerGroup} className={field} /></label>
              <label><span className={label}>{t('groupBestOf')}</span>
                <select name="groupBestOf" defaultValue={init.groupBestOf} className={field}>{BEST.map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
            </div>
            <label className="flex items-start gap-2 text-sm text-parchment-200">
              <input type="checkbox" name="groupPlayAll" defaultChecked={init.groupPlayAll} className="mt-1" />
              <span>{t('groupPlayAll')}<span className="block text-xs text-parchment-400">{t('groupPlayAllHint')}</span></span>
            </label>
          </>
        )}
      </fieldset>

      <fieldset className="space-y-3 rounded border border-gold-700/40 p-4" disabled={formatLocked}>
        <legend className="px-2 font-display text-gold-300">{t('reqTitle')}</legend>
        <p className="text-sm text-parchment-400">{t('optional')}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <label><span className={label}>{t('maxPeak')}</span><input name="maxPeakRating" type="number" min={0} max={5000} placeholder="1100" defaultValue={num(init.maxPeakRating)} className={field} /></label>
          <label><span className={label}>{t('minGames')}</span><input name="minGames" type="number" min={0} max={10000} placeholder="50" defaultValue={num(init.minGames)} className={field} /></label>
          <label><span className={label}>{t('minRecent')}</span><input name="minRecentGames" type="number" min={0} max={1000} placeholder="20" defaultValue={num(init.minRecentGames)} className={field} /></label>
        </div>
      </fieldset>

      <button type="submit" disabled={pending} className="btn btn-primary">{edit ? t('save') : t('submit')}</button>
    </form>
  );
}
