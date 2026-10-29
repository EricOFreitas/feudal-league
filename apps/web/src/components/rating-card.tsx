import type { PlayerRating } from '@aoe2/db';
import { winrate } from '@/lib/format';

type Labels = { rank: string; of: (total: string) => string; winrate: string; peak: string; streak: string; w: string; l: string };

export function RatingCard({ r, title, labels, locale }: { r: PlayerRating; title: string; labels: Labels; locale: string }) {
  const nf = new Intl.NumberFormat(locale);
  const ranked = r.rank > 0;
  return (
    <article className="panel p-5">
      <p className="kicker">{title}</p>
      <div className="mt-2 flex items-end justify-between">
        <span className="stat-num text-5xl leading-none">{r.rating}</span>
        <span className="text-right text-sm text-parchment-300">
          {labels.rank}<br />
          <span className="stat-num text-lg">{ranked ? `#${nf.format(r.rank)}` : '–'}</span>{' '}
          {ranked && <span className="text-parchment-400">{labels.of(nf.format(r.rankTotal))}</span>}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-gold-700/50 pt-3 text-sm">
        <div>
          <dt className="text-parchment-400">{labels.w}/{labels.l}</dt>
          <dd className="text-parchment-50"><span className="text-moss-500">{r.wins}</span> · <span className="text-crimson-500">{r.losses}</span></dd>
        </div>
        <div>
          <dt className="text-parchment-400">{labels.winrate}</dt>
          <dd className="text-parchment-50">{winrate(r.wins, r.losses)}</dd>
        </div>
        <div>
          <dt className="text-parchment-400">{labels.peak}</dt>
          <dd className="text-parchment-50">{r.highestRating > 0 ? r.highestRating : "–"}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-parchment-400">
        {labels.streak}: <span className={r.streak >= 0 ? 'text-moss-500' : 'text-crimson-500'}>{r.streak > 0 ? `+${r.streak}` : r.streak}</span>
        {r.lastMatchAt && <> · {new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(r.lastMatchAt)}</>}
      </p>
    </article>
  );
}
