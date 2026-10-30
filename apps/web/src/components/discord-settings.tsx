'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import type { DiscordEmbed, WebhookEvent } from '@aoe2/sync';
import { saveDiscordAction, testDiscordAction } from '@/app/[locale]/leagues/[slug]/discord/actions';
import { DiscordPreviewCard } from './discord-preview';
import { DivisionMark } from './division-mark';

export type DiscordFlash = 'saved' | 'removed' | 'test' | 'testFailed' | 'url';

/** Mesma regra de packages/sync/src/notify.ts (WEBHOOK_URL_RE); repetida pra não levar o banco pro navegador. */
const URL_RE = /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\S+$/;
const EVENTS: WebhookEvent[] = ['match', 'voided', 'tournament', 'member', 'season'];
/** Ordem da prévia: os três do protótipo primeiro; membro e temporada só aparecem se faltar exemplo. */
const PREVIEW_ORDER: WebhookEvent[] = ['match', 'tournament', 'voided', 'member', 'season'];

type Props = {
  locale: string;
  leagueId: number;
  /** URL salva já mascarada; null = sem webhook. */
  savedMasked: string | null;
  events: string[];
  divisionIds: number[] | null;
  divisions: { id: number; name: string; nameKey: string | null }[];
  lastSentAgo: string | null;
  lastError: string | null;
  flash: DiscordFlash | null;
  previews: Record<WebhookEvent, DiscordEmbed>;
  previewTime: string;
};

function Buttons({ canSave, canTest }: { canSave: boolean; canTest: boolean }) {
  const t = useTranslations('discord');
  const { pending } = useFormStatus();
  return (
    <div className="relative z-[1] flex flex-wrap gap-3">
      <button type="submit" className="btn disabled:!cursor-not-allowed disabled:!opacity-45" disabled={pending || !canSave}>{t('save')}</button>
      <button type="submit" formAction={testDiscordAction} className="btn btn-ghost !px-4 !py-2.5 !text-xs disabled:!cursor-not-allowed disabled:!opacity-45" disabled={pending || !canTest}>{t('test')}</button>
    </div>
  );
}

export function DiscordSettings(p: Props) {
  const t = useTranslations('discord');
  const [url, setUrl] = useState(p.savedMasked ?? '');
  const [touched, setTouched] = useState(false);
  const [events, setEvents] = useState<Set<string>>(() => new Set(p.events));
  const [divs, setDivs] = useState<Set<number>>(() => new Set(p.divisionIds ?? p.divisions.map((d) => d.id)));

  const trimmed = url.trim();
  const keeping = p.savedMasked != null && trimmed === p.savedMasked;
  const valid = keeping || URL_RE.test(trimmed);
  const flash = touched ? null : p.flash;

  const status: { text: string; tone: 'muted' | 'ok' | 'bad' } = (() => {
    if (flash === 'url' || (trimmed && !valid)) return { text: t('status.invalid'), tone: 'bad' };
    if (flash === 'testFailed') return { text: t('status.testFailed', { error: p.lastError ?? '?' }), tone: 'bad' };
    if (flash === 'test') return { text: t('status.test'), tone: 'ok' };
    if (flash === 'saved') return { text: t('status.saved'), tone: 'ok' };
    if (flash === 'removed') return { text: t('status.removed'), tone: 'muted' };
    if (!trimmed) return { text: p.savedMasked ? t('status.clearing') : t('status.none'), tone: 'muted' };
    if (!keeping) return { text: t('status.newUrl'), tone: 'ok' };
    if (p.lastError) return { text: t('status.lastError', { error: p.lastError }), tone: 'bad' };
    return { text: p.lastSentAgo ? t('status.connected', { ago: p.lastSentAgo }) : t('status.connectedNever'), tone: 'ok' };
  })();
  const toneClass = { muted: 'text-parchment-400', ok: 'text-moss-500', bad: 'text-crimson-500' }[status.tone];

  const touch = () => setTouched(true);
  const toggle = <T,>(set: Set<T>, v: T) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); return n; };
  const shown = PREVIEW_ORDER.filter((e) => events.has(e)).slice(0, 2);

  return (
    <div className="flex flex-wrap items-start gap-4">
      <form action={saveDiscordAction} className="panel corners flex min-w-0 flex-[999_1_420px] flex-col gap-5 p-6">
        <input type="hidden" name="locale" value={p.locale} />
        <input type="hidden" name="leagueId" value={p.leagueId} />

        <div className="relative z-[1]">
          <label htmlFor="discord-url" className="kicker block">{t('url')}</label>
          <input
            id="discord-url" name="url" value={url} autoComplete="off" spellCheck={false}
            onChange={(e) => { setUrl(e.target.value); touch(); }}
            placeholder={t('urlPlaceholder')}
            className="input mt-2 !py-2.5 font-mono !text-[0.85rem]"
            aria-describedby="discord-url-status" aria-invalid={status.tone === 'bad' && (flash === 'url' || (!!trimmed && !valid))}
          />
          <p id="discord-url-status" role="status" className={`mt-2 text-sm ${toneClass}`}>{status.text}</p>
        </div>

        <fieldset className="relative z-[1] flex flex-col gap-3">
          <legend className="kicker mb-3">{t('events.title')}</legend>
          {EVENTS.map((e) => (
            <label key={e} className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox" name="events" value={e} checked={events.has(e)}
                onChange={() => { setEvents((s) => toggle(s, e)); touch(); }}
                className="mt-1.5 h-4 w-4 accent-gold-400"
              />
              <span>
                <span className="text-parchment-50">{t(`events.${e}.label`)}</span>
                <span className="block text-sm text-parchment-400">{t(`events.${e}.hint`)}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {p.divisions.length > 0 && (
          <fieldset className="relative z-[1] flex flex-col gap-2">
            <legend className="kicker mb-2">{t('divisions.title')}</legend>
            <div className="flex flex-wrap gap-2">
              {p.divisions.map((d) => {
                const on = divs.has(d.id);
                return (
                  <label
                    key={d.id}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-[3px] border px-2.5 py-1.5 text-sm hover:border-gold-500 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold-400/40 ${on ? 'border-gold-500 bg-gold-600/30 text-gold-400' : 'border-gold-700 text-parchment-400'}`}
                  >
                    <input type="checkbox" name="div" value={d.id} checked={on} onChange={() => { setDivs((s) => toggle(s, d.id)); touch(); }} className="sr-only" />
                    <DivisionMark nameKey={d.nameKey} className="h-3.5 w-3.5" />
                    {d.name}
                  </label>
                );
              })}
            </div>
            <p className="text-sm text-parchment-400">{t('divisions.hint')}</p>
          </fieldset>
        )}

        <Buttons canSave={!trimmed || valid} canTest={!!trimmed && valid} />
      </form>

      <aside className="flex flex-[1_1_300px] flex-col gap-4">
        <div className="panel p-5">
          <p className="kicker">{t('preview.title')}</p>
          <div className="relative z-[1] mt-3 flex flex-col gap-3">
            {shown.length === 0 ? (
              <p className="text-sm italic text-parchment-400">{t('preview.empty')}</p>
            ) : (
              shown.map((e) => <DiscordPreviewCard key={e} embed={p.previews[e]} time={p.previewTime} />)
            )}
            {p.locale !== 'pt' && <p className="text-xs text-parchment-400">{t('preview.lang')}</p>}
          </div>
        </div>
        <div className="panel p-5">
          <p className="kicker">{t('howto.title')}</p>
          <ol className="relative z-[1] mt-3 flex flex-col gap-1.5 text-sm text-parchment-200">
            {(['step1', 'step2', 'step3'] as const).map((k, i) => (
              <li key={k}><span className="font-display tabular-nums text-gold-300">{['I.', 'II.', 'III.'][i]}</span> {t(`howto.${k}`)}</li>
            ))}
          </ol>
          <p className="relative z-[1] mt-3 text-[0.8rem] leading-[1.15rem] text-parchment-400">{t('howto.privacy')}</p>
        </div>
      </aside>
    </div>
  );
}
