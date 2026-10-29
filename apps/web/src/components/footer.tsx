import { getTranslations } from 'next-intl/server';

export async function Footer() {
  const t = await getTranslations('site');
  return (
    <footer className="mt-12 border-t border-gold-700/60 bg-stone-950/60">
      <div className="mx-auto max-w-6xl space-y-2 px-4 py-6 text-sm text-parchment-300 sm:px-6">
        <p>
          {t.rich('notice', {
            rules: (chunks) => (
              <a href="https://www.xbox.com/en-US/developers/rules" target="_blank" rel="noreferrer">{chunks}</a>
            ),
          })}
        </p>
        <p className="text-parchment-400">{t('source')}</p>
      </div>
    </footer>
  );
}
