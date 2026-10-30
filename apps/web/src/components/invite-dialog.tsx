'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link2, X } from 'lucide-react';

/**
 * Cartão "Convidar" da página da liga: botão que abre um <dialog> nativo com o link público
 * e o botão Copiar. O <dialog> dá de graça o Esc, o foco preso e o fundo escuro.
 */
export function InviteDialog({ url, leagueName, ogUrl, members, description }: { url: string; leagueName: string; ogUrl: string; members: number; description?: string | null }) {
  const t = useTranslations('leagues.detail.invite');
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      input.current?.select();
      setState('failed');
    }
  };

  return (
    <>
      <button type="button" onClick={() => { setState('idle'); ref.current?.showModal(); }} className="btn btn-ghost relative self-start !px-4 !py-2.5 !text-xs whitespace-nowrap">
        <Link2 className="h-3.5 w-3.5" />{t('button')}
      </button>
      <dialog
        ref={ref}
        aria-label={t('dialog')}
        onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}
        className="mx-auto mt-16 w-[calc(100%-2rem)] max-w-xl overflow-visible bg-transparent p-0 text-parchment-100 backdrop:bg-[rgba(8,6,4,0.78)] backdrop:backdrop-blur-[2px]"
      >
        <div className="panel corners p-6">
          <div className="relative flex flex-col gap-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="kicker">{t('title')}</p>
                <h2 className="truncate text-2xl text-gold-300">{leagueName}</h2>
              </div>
              <button type="button" onClick={() => ref.current?.close()} aria-label={t('close')} className="flex p-1 text-parchment-400 hover:text-gold-300">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex gap-2">
              <input
                ref={input}
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className="input min-w-0 flex-1 !py-2.5 font-mono !text-sm"
                aria-label={t('button')}
              />
              <button type="button" onClick={copy} className="btn shrink-0 !text-xs whitespace-nowrap" aria-live="polite">
                {state === 'copied' ? t('copied') : t('copy')}
              </button>
            </div>
            {state === 'failed' && <p className="text-sm text-crimson-500">{t('copyFailed')}</p>}
            <div>
              <p className="kicker mb-2.5 !text-parchment-400">{t('previewTitle')}</p>
              <div className="rounded border border-[#2a2622] bg-[#121110] p-3 font-sans text-[0.82rem] leading-snug text-[#d6d6d6]">
                <div className="text-[#7fb0e0]">{url.replace(/^https?:\/\//, '')}</div>
                <div className="mt-2 max-w-md rounded-[3px] border-l-4 border-gold-500 bg-[#1b1a19] px-3 py-2.5">
                  <div className="text-[0.72rem] text-[#8a8a8a]">Feudal League</div>
                  <div className="mt-0.5 font-semibold text-gold-300">{t('previewMembers', { name: leagueName, count: members })}</div>
                  <div className="mt-0.5">{description || t('previewDesc')}</div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ogUrl} alt="" width={1200} height={630} className="mt-2.5 block h-auto w-full rounded-[3px] border border-gold-700" />
                </div>
              </div>
            </div>
            <p className="text-sm text-parchment-400">{t('previewNote')}</p>
            <p className="text-sm text-parchment-400">{t('hint')}</p>
          </div>
        </div>
      </dialog>
    </>
  );
}
