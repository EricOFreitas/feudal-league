import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Crosshair, Globe, Search, ShieldCheck, Users, X } from 'lucide-react';
import { RM_1V1 } from '@aoe2/aoe-api';
import { db, divisions, leagueMembers, leagues, players } from '@aoe2/db';
import {
  activeSeason, divisionCounts, lastEndedSeason, leagueMatchList, leagueTournaments, leagueWebhookActive, placementFor,
  searchStandings, standingsPage, type RankedRow, type SearchRow,
} from '@aoe2/sync';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { Link } from '@/i18n/navigation';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { Flag } from '@/components/flag';
import { DivisionMark } from '@/components/division-mark';
import { InviteDialog } from '@/components/invite-dialog';
import { LeagueMatchRow } from '@/components/league-match-row';
import { LeaguePager } from '@/components/league-pager';
import { LeagueTable } from '@/components/league-table';
import { divisionName, sessionPlayer } from '@/lib/leagues';
import { joinAction, leaveAction, newSeasonAction, toggleStatusAction, voidMatchAction } from '../actions';

type SP = Partial<Record<'joined' | 'left' | 'err' | 'div' | 'q' | 'page' | 'me' | 'mf' | 'more', string | string[]>>;
type Props = { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<SP> };

const PAGE_SIZE = 25;
const MATCHES_FIRST = 10;
const MATCHES_MORE = 50;
const TOURNAMENT_STATUS = ['open', 'groups', 'running', 'finished', 'cancelled'] as const;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const l = await db.query.leagues.findFirst({ where: eq(leagues.slug, slug) });
  return { title: l?.name ?? slug };
}

export default async function LeaguePage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations('leagues');
  const tx = await getTranslations('leagues.detail');
  const td = await getTranslations('division');
  const tn = await getTranslations('nav');
  const tt = await getTranslations('tournaments');

  const league = await db.query.leagues.findFirst({ where: eq(leagues.slug, slug) });
  if (!league || league.status === 'archived') notFound();
  const season = await activeSeason(league.id);
  const divs = await db.query.divisions.findMany({ where: eq(divisions.leagueId, league.id), orderBy: [asc(divisions.sort)] });
  const { session, player } = await sessionPlayer();
  const isOwner = session != null && league.ownerUserId === session.uid;
  const owner = league.ownerUserId ? await db.query.players.findFirst({ where: eq(players.claimedByUserId, league.ownerUserId) }) : null;

  const membership = player && season
    ? await db.query.leagueMembers.findFirst({ where: and(eq(leagueMembers.seasonId, season.id), eq(leagueMembers.playerId, player.id), isNull(leagueMembers.leftAt)), with: { division: true } })
    : null;
  const placement = player && !membership ? placementFor(league, divs, player.ratings.find((r) => r.leaderboardId === RM_1V1)) : null;

  const counts = season ? await divisionCounts(season.id) : new Map<number, number>();
  const memberTotal = [...counts.values()].reduce((a, b) => a + b, 0);
  const totalMembers = [...counts.values()].reduce((n, c) => n + c, 0);
  const nf = new Intl.NumberFormat(locale);
  const dt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const dshort = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'numeric', year: 'numeric' });
  const leagueTitle = league.isGlobal ? t('global') : league.name;

  /* ── estado da tabela (na URL) ── */
  const q = one(sp.q).trim().slice(0, 40);
  const searching = q.length > 0;
  const divParam = Number(one(sp.div));
  const activeDiv = divs.find((d) => d.id === divParam)
    ?? (membership ? divs.find((d) => d.id === membership.divisionId) : undefined)
    ?? divs.find((d) => (counts.get(d.id) ?? 0) > 0)
    ?? divs[0];
  const pageParam = Number.parseInt(one(sp.page), 10);
  const askedPage = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : null;
  const onMyDivision = membership != null && activeDiv?.id === membership.divisionId;
  const flash = one(sp.me) === '1' && onMyDivision && !searching;

  let rows: (RankedRow | SearchRow)[] = [];
  let total = 0;
  let page = 1;
  let pages = 1;
  let meRow: RankedRow | null = null;
  if (season && searching) {
    const all = await searchStandings(season.id, q);
    total = all.length;
    pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    page = Math.min(askedPage ?? 1, pages);
    rows = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  } else if (season && activeDiv) {
    // "Minha posição" sem página explícita abre na página do jogador
    const res = await standingsPage(season.id, activeDiv.id, flash && askedPage == null ? null : (askedPage ?? 1), PAGE_SIZE, onMyDivision ? membership.playerId : undefined);
    ({ rows, total, page, pages } = res);
    meRow = res.me;
  }
  const meId = meRow?.playerId;
  const showMeStrip = meId != null && !searching && !rows.some((r) => r.playerId === meId);

  /* ── partidas ── */
  const mfRaw = one(sp.mf);
  const mf: 'all' | 'div' | 'mine' = membership && (mfRaw === 'div' || mfRaw === 'mine') ? mfRaw : 'all';
  const more = one(sp.more) === '1';
  const fetched = season
    ? await leagueMatchList(season.id, {
      divisionId: mf === 'div' ? membership?.divisionId : undefined,
      playerId: mf === 'mine' ? membership?.playerId : undefined,
      limit: more ? MATCHES_MORE : MATCHES_FIRST + 1,
    })
    : [];
  const matches = fetched.slice(0, more ? MATCHES_MORE : MATCHES_FIRST);
  const hasMoreMatches = !more && fetched.length > MATCHES_FIRST;

  /* ── aside ── */
  const [ended, tours, hookOn] = await Promise.all([
    lastEndedSeason(league.id),
    leagueTournaments(league.id, 3),
    isOwner ? leagueWebhookActive(league.id) : Promise.resolve(false),
  ]);
  const inviteUrl = `${(process.env.APP_URL ?? '').replace(/\/$/, '')}/${locale}/leagues/${league.slug}`;

  /* ── links que preservam o estado da URL ── */
  const state: Record<string, string | undefined> = {
    div: !searching && activeDiv ? String(activeDiv.id) : undefined,
    q: searching ? q : undefined,
    page: page > 1 ? String(page) : undefined,
    me: flash ? '1' : undefined,
    mf: mf !== 'all' ? mf : undefined,
    more: more ? '1' : undefined,
  };
  const qsWith = (over: Record<string, string | number | null | undefined> = {}) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...state, ...over })) if (v != null && v !== '') u.set(k, String(v));
    return u.toString();
  };
  const hrefWith = (over: Record<string, string | number | null | undefined> = {}) => {
    const s = qsWith(over);
    return `/leagues/${league.slug}${s ? `?${s}` : ''}`;
  };
  const myHref = membership ? `${hrefWith({ div: membership.divisionId, q: null, page: null, me: '1' })}#me` : '';

  const joinError = (reason: string) => {
    const known = ['closed', 'already', 'no_rating', 'few_games', 'no_division', 'no_season'] as const;
    const k = known.find((x) => x === reason) ?? 'closed';
    return t(`join.${k}`, { games: placement && !placement.ok ? placement.games : 0, min: league.minGames, rating: placement?.rating ?? 0, division: membership ? divisionName(membership.division, td) : '' });
  };
  const fmtRange = (d: { ratingMin: number; ratingMax: number | null }) => (d.ratingMax == null ? t('rangeOpen', { min: d.ratingMin }) : t('range', { min: d.ratingMin, max: d.ratingMax }));
  const hidden = (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="leagueId" value={league.id} />
      <input type="hidden" name="slug" value={league.slug} />
    </>
  );
  const divMap = new Map(divs.map((d) => [d.id, d]));
  const ghostBtn = 'btn btn-ghost w-full !text-xs';

  return (
    <div>
      <Breadcrumbs items={[{ label: tn('leagues'), href: '/leagues' }, { label: leagueTitle }]} />
      <div className="space-y-10">
        {one(sp.joined) && membership && <div className="panel !border-moss-500 p-4 text-parchment-50">{t('join.done', { division: divisionName(membership.division, td) })}</div>}
        {one(sp.left) && <div className="panel p-4 text-parchment-50">{t('join.left')}</div>}
        {one(sp.err) && <div className="panel !border-crimson-500 p-4 text-parchment-50">{joinError(one(sp.err))}</div>}

        {/* ── cabeçalho ── */}
        <header className="panel corners p-6">
          <div className="relative z-[1] flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-[1_1_320px]">
              <p className="kicker flex flex-wrap items-center gap-2">
                {league.isGlobal ? <Globe className="h-3.5 w-3.5" /> : null}
                {season ? t('season', { n: season.number }) : ''}
                {season && <span className="normal-case tracking-normal text-parchment-400">· {t('seasonSince', { date: dt.format(season.startedAt) })}</span>}
              </p>
              <h1 className="text-3xl leading-tight font-semibold text-gold-300 sm:text-4xl">{leagueTitle}</h1>
              {league.description && <p className="mt-2 max-w-2xl whitespace-pre-line text-parchment-200">{league.description}</p>}
              <p className="mt-2 flex flex-wrap items-center gap-3 text-sm text-parchment-300">
                <span className="tag"><Users className="h-3.5 w-3.5" />{t('members', { count: totalMembers })}</span>
                {owner && !isOwner && <span className="tag">{t('by', { name: '' })}<Link href={`/players/${owner.profileId}`}>{owner.alias}</Link></span>}
                {isOwner && <span className="tag !border-moss-500"><ShieldCheck className="h-3.5 w-3.5 text-moss-500" />{t('ownerYou')}</span>}
                {league.status === 'closed' && <span className="tag !border-crimson-500 !text-crimson-500">{t('closed')}</span>}
              </p>
            </div>

            <div className="flex-none sm:text-right">
              {!session ? (
                <a href={`/auth/steam?next=/${locale}/leagues/${league.slug}`} className="btn hover:!text-stone-950 hover:!no-underline">{t('join.login')}</a>
              ) : !player ? (
                <Link href="/me" className="btn btn-ghost hover:!no-underline">{t('join.claim')}</Link>
              ) : membership ? (
                <form action={leaveAction} className="flex flex-col gap-2 sm:items-end">
                  {hidden}
                  <p className="flex items-center gap-2 text-parchment-50"><DivisionMark nameKey={membership.division.nameKey} className="h-5 w-5 text-gold-400" />{t('join.already', { division: divisionName(membership.division, td) })}</p>
                  <button type="submit" className="btn btn-ghost self-start !text-xs sm:self-end">{t('join.leave')}</button>
                </form>
              ) : league.status !== 'open' ? (
                <p className="text-parchment-300">{t('join.closed')}</p>
              ) : placement?.ok ? (
                <form action={joinAction} className="flex flex-col gap-2 sm:items-end">
                  {hidden}
                  <p className="max-w-xs text-sm text-parchment-200">{t('join.preview', { division: divisionName(placement.division, td), rating: placement.rating })}</p>
                  <button type="submit" className="btn self-start sm:self-end">{t('join.button')}</button>
                </form>
              ) : placement ? (
                <p className="max-w-xs text-sm text-parchment-300">{t(`join.${placement.reason}`, { games: placement.games, min: league.minGames, rating: placement.rating })}</p>
              ) : null}
            </div>
          </div>
        </header>

        <section className="flex flex-wrap items-start gap-4">
          {/* ── painel principal: abas por divisão, busca, tabela ── */}
          <div className="panel min-w-0 flex-[999_1_520px]">
            <div className="relative z-[1]">
              <nav aria-label={tx('divisionTabs')} className="flex flex-wrap border-b border-gold-700/60 px-2">
                {divs.map((d) => {
                  const active = !searching && d.id === activeDiv?.id;
                  return (
                    <Link
                      key={d.id}
                      href={hrefWith({ div: d.id, q: null, page: null, me: null })}
                      aria-current={active ? 'page' : undefined}
                      className={`flex flex-none items-center gap-2 border-b-2 px-2.5 pt-3 pb-2.5 font-display text-[0.95rem] whitespace-nowrap hover:!text-gold-300 hover:!no-underline ${active ? 'border-gold-400 !text-gold-300' : 'border-transparent !text-parchment-300'}`}
                    >
                      <DivisionMark nameKey={d.nameKey} className="h-[18px] w-[18px]" />
                      {divisionName(d, td)}
                      <span className="font-body text-[0.85rem] tracking-normal text-parchment-400">{nf.format(counts.get(d.id) ?? 0)}</span>
                    </Link>
                  );
                })}
              </nav>

              <div className="flex flex-col gap-4 p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <form action={`/${locale}/leagues/${league.slug}`} method="get" role="search" className="relative min-w-0 flex-[1_1_220px]">
                    {mf !== 'all' && <input type="hidden" name="mf" value={mf} />}
                    {more && <input type="hidden" name="more" value="1" />}
                    <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-parchment-400" />
                    <input
                      name="q"
                      defaultValue={q}
                      placeholder={tx('search.placeholder')}
                      aria-label={tx('search.placeholder')}
                      autoComplete="off"
                      maxLength={40}
                      className="input !py-2.5 !pr-9 !pl-10 !text-base"
                    />
                    {searching && (
                      <Link href={hrefWith({ q: null, page: null })} aria-label={tx('search.clear')} className="absolute top-1/2 right-1.5 flex -translate-y-1/2 p-1 !text-parchment-400 hover:!text-gold-300">
                        <X className="h-4 w-4" />
                      </Link>
                    )}
                  </form>
                  {membership && (
                    <Link href={myHref} className="btn btn-ghost !px-3.5 !py-2 !text-xs whitespace-nowrap hover:!no-underline">
                      <Crosshair className="h-3.5 w-3.5" />{tx('myPosition')}
                    </Link>
                  )}
                </div>

                {season && activeDiv ? (
                  <>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm text-parchment-300">
                      <span>
                        {searching
                          ? tx('results', { count: total, q })
                          : tx('caption', { division: divisionName(activeDiv, td), range: fmtRange(activeDiv), count: total })}
                      </span>
                      {total > 0 && (
                        <span className="font-display tabular-nums">
                          {tx('rangeOf', { from: nf.format((page - 1) * PAGE_SIZE + 1), to: nf.format((page - 1) * PAGE_SIZE + rows.length), total: nf.format(total) })}
                        </span>
                      )}
                    </div>

                    {showMeStrip && meRow && (
                      <Link href={myHref} className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-2 rounded-[3px] border border-gold-600 bg-gold-700/25 px-3 py-2 text-sm hover:border-gold-500 hover:!no-underline">
                        <span className="stat-num text-[1.05rem]">{tx('mePos', { pos: meRow.pos })}</span>
                        <span className="truncate text-parchment-50">
                          <Flag code={meRow.country} /> {meRow.alias} <span className="text-parchment-400">· {tx('meYou', { points: meRow.points })}</span>
                        </span>
                        <span className="whitespace-nowrap text-gold-300">{tx('meGo')}</span>
                      </Link>
                    )}

                    {rows.length > 0 ? (
                      <LeagueTable rows={rows} meId={player?.id} flash={flash} divisions={searching ? divMap : undefined} />
                    ) : (
                      <p className="italic text-parchment-400">{searching ? tx('noResults', { q }) : t('noMembers')}</p>
                    )}

                    {pages > 1 && <LeaguePager page={page} pages={pages} hrefFor={(n) => hrefWith({ page: n > 1 ? n : null, me: null })} />}
                  </>
                ) : (
                  <p className="italic text-parchment-400">{t('join.no_season')}</p>
                )}
              </div>
            </div>
          </div>

          {/* ── aside ── */}
          <aside className="flex flex-[1_1_320px] flex-col gap-4">
            <div className="panel p-5">
              <p className="kicker">{t('rules.title')}</p>
              <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-parchment-200">
                <li>{t('rules.placement')}</li>
                <li>{t('rules.minGames', { n: league.minGames })}</li>
                <li>{league.countRanked ? t('rules.detect') : t('rules.detectLobby')}</li>
                <li>{t('rules.points')}</li>
                <li>{t('rules.season')}</li>
              </ul>
            </div>

            {ended && ended.season.endedAt && (
              <Link href={`/leagues/${league.slug}/seasons`} className="panel block p-5 hover:!border-gold-500 hover:!no-underline">
                <p className="kicker">{tx('past.title')}</p>
                <p className="mt-2 font-display text-lg text-gold-300">{tx('past.season', { n: ended.season.number })}</p>
                <p className="text-sm text-parchment-300">
                  {tx('past.period', { from: dshort.format(ended.season.startedAt), to: dshort.format(ended.season.endedAt), count: ended.members })}
                </p>
              </Link>
            )}

            <div className="panel flex flex-col gap-3 p-5">
              <p className="kicker">{tx('invite.title')}</p>
              <p className="relative text-sm text-parchment-200">{tx('invite.hint')}</p>
              <InviteDialog url={inviteUrl} leagueName={leagueTitle} ogUrl={`/${locale}/leagues/${league.slug}/opengraph-image`} members={memberTotal} description={league.description} />
            </div>

            <div className="panel p-5">
              <p className="kicker">{tx('tournaments.title')}</p>
              {tours.length === 0 ? (
                <p className="mt-2 text-sm italic text-parchment-400">{tx('tournaments.empty')}</p>
              ) : (
                <ul className="mt-2 space-y-3">
                  {tours.map((tour) => {
                    const st = TOURNAMENT_STATUS.find((s) => s === tour.status);
                    return (
                      <li key={tour.id}>
                        <Link href={`/tournaments/${tour.slug}`} className="block hover:!no-underline">
                          <span className="font-display text-lg text-gold-300">{tour.name}</span>
                          <span className="block text-sm text-parchment-300">
                            {tt('format.size', { n: tour.teamSize })} · {tour.format === 'groups_elim' ? tx('tournaments.groups') : tx('tournaments.single')}
                            {st ? ` · ${tt(`status.${st}`)}` : ''}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="relative mt-3 text-sm"><Link href="/tournaments">{tx('tournaments.all')}</Link></p>
            </div>

            {isOwner && (
              <div className="panel flex flex-col gap-3 p-5">
                <p className="kicker">{t('admin.title')}</p>
                <form action={toggleStatusAction} className="relative">{hidden}<button className={ghostBtn}>{league.status === 'open' ? t('admin.close') : t('admin.open')}</button></form>
                <Link href={`/leagues/${league.slug}/discord`} className={`${ghostBtn} relative justify-between hover:!no-underline`}>
                  {tx('discord')}
                  <span className={`tag font-body !tracking-normal normal-case ${hookOn ? '!border-moss-500 !text-moss-500' : '!text-parchment-400'}`}>{hookOn ? tx('hookOn') : tx('hookOff')}</span>
                </Link>
                <form action={newSeasonAction} className="relative">
                  {hidden}
                  <button className={`${ghostBtn} text-left`}>{t('admin.newSeason')}</button>
                  <p className="mt-1 text-xs text-parchment-400">{t('admin.newSeasonHint')}</p>
                </form>
              </div>
            )}
          </aside>
        </section>

        {/* ── partidas da liga ── */}
        <section>
          <div className="rule mb-5"><span className="kicker">{t('matches')}</span></div>
          {membership && (
            <nav aria-label={tx('filters.label')} className="mb-4 flex flex-wrap gap-2">
              {([['all', tx('filters.all')], ['div', divisionName(membership.division, td)], ['mine', tx('filters.mine')]] as const).map(([k, label]) => (
                <Link
                  key={k}
                  href={hrefWith({ mf: k === 'all' ? null : k, more: null })}
                  aria-current={mf === k ? 'true' : undefined}
                  className={`rounded-[3px] border px-3 py-1.5 font-display text-[0.72rem] tracking-[0.15em] uppercase hover:border-gold-500 hover:!no-underline ${mf === k ? 'border-gold-500 bg-gold-600/30 !text-gold-300' : 'border-gold-700 !text-parchment-400'}`}
                >
                  {label}
                </Link>
              ))}
            </nav>
          )}
          {matches.length === 0 ? (
            <p className="italic text-parchment-400">{mf === 'all' ? t('noMatches') : tx('noMatchesFiltered')}</p>
          ) : (
            <ul className="space-y-2">
              {matches.map((lm) => (
                <LeagueMatchRow
                  key={lm.id}
                  lm={lm}
                  locale={locale}
                  admin={isOwner ? (
                    <form action={voidMatchAction} className="flex flex-none items-center gap-2">
                      {hidden}
                      <input type="hidden" name="leagueMatchId" value={lm.id} />
                      <input type="hidden" name="back" value={qsWith()} />
                      {lm.status !== 'voided' && <input name="reason" className="input !w-40 !px-3 !py-1 !text-sm" placeholder={t('admin.voidReason')} maxLength={200} />}
                      <button className="btn btn-ghost !px-3 !py-1 !text-xs">{lm.status === 'voided' ? t('admin.restore') : t('admin.void')}</button>
                    </form>
                  ) : undefined}
                />
              ))}
            </ul>
          )}
          {hasMoreMatches && (
            <div className="mt-4">
              <Link href={hrefWith({ more: '1' })} scroll={false} className="btn btn-ghost !px-3.5 !py-2 !text-xs hover:!no-underline">{tx('moreMatches')}</Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
