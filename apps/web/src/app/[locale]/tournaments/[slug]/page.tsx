import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ShieldCheck, Trophy, Users } from 'lucide-react';
import { db, players } from '@aoe2/db';
import { eligibilityOf, groupStandings, tournamentBySlug, type GroupRow, type MatchFull, type TeamFull } from '@aoe2/sync';
import { eq } from 'drizzle-orm';
import { Bracket } from '@/components/bracket';
import { Flag } from '@/components/flag';
import { Link } from '@/i18n/navigation';
import { sessionPlayer } from '@/lib/leagues';
import { addTeamAction, cancelAction, registerTeamAction, reportGameAction, startBracketAction, startGroupsAction, teamStatusAction, undoGameAction } from '../actions';

type Props = { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<{ ok?: string; err?: string; id?: string; rules?: string }> };
type Status = 'open' | 'groups' | 'running' | 'finished' | 'cancelled';
const ERRS = ['closed', 'full', 'size', 'player_taken', 'player_missing', 'duplicate', 'ineligible', 'few_teams', 'groups_open', 'status', 'no_groups'] as const;
type Err = (typeof ERRS)[number];
const RULES = ['peak', 'games', 'recent', 'no_rating'] as const;
type Rule = (typeof RULES)[number];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const t = await tournamentBySlug(slug);
  return { title: t?.name ?? slug };
}

export default async function TournamentPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const flash = await searchParams;
  const t = await getTranslations('tournaments');

  const tour = await tournamentBySlug(slug);
  if (!tour || tour.status === 'cancelled') notFound();
  const { session, player } = await sessionPlayer();
  const isOwner = session != null && tour.ownerUserId === session.uid;
  const owner = tour.ownerUserId ? await db.query.players.findFirst({ where: eq(players.claimedByUserId, tour.ownerUserId) }) : null;
  const teams = new Map<number, TeamFull>(tour.teams.map((x) => [x.id, x]));
  const visibleTeams = tour.teams.filter((x) => x.status !== 'withdrawn' || isOwner);
  const myTeam = player ? tour.teams.find((x) => x.status !== 'withdrawn' && x.members.some((m) => m.playerId === player.id)) : null;
  const eligibility = player && tour.status === 'open' && !myTeam ? await eligibilityOf(tour, player.id) : null;
  const hasReqs = tour.maxPeakRating != null || tour.minGames != null || tour.minRecentGames != null;
  const groupMatches = tour.matches.filter((m) => m.stage === 'group');
  const bracketMatches = tour.matches.filter((m) => m.stage === 'bracket');
  const standings: Map<number, GroupRow[]> = tour.groupCount > 0 ? groupStandings(tour) : new Map();
  const champion = tour.status === 'finished' ? bracketMatches.find((m) => m.nextMatchId == null)?.winnerTeamId ?? null : null;
  const openMatches = tour.matches.filter((m) => m.status === 'ready');
  const undoable = tour.matches.filter((m) => m.games.length > 0);
  const dt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const dts = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' });

  const ruleNames = (rules?: string) => (rules ?? '').split(',').filter((r): r is Rule => (RULES as readonly string[]).includes(r)).map((r) => t(`requirements.rule.${r}`)).join(', ');
  const errText = (e: string) => {
    const k = (ERRS as readonly string[]).includes(e) ? (e as Err) : 'status';
    return t(`err.${k}`, { n: tour.teamSize, id: flash.id ?? '', rules: ruleNames(flash.rules) });
  };
  const roundName = (round: number, rounds: number) => (round === rounds ? t('final') : round === rounds - 1 ? t('semis') : round === rounds - 2 ? t('quarters') : t('round', { n: round }));
  const teamName = (id: number | null) => (id == null ? t('tbd') : teams.get(id)?.name ?? '?');
  const hidden = (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="tournamentId" value={tour.id} />
      <input type="hidden" name="slug" value={tour.slug} />
    </>
  );
  const field = 'w-full rounded border border-gold-700/60 bg-stone-950/60 px-3 py-2 text-parchment-50';

  const TeamLine = ({ team }: { team: TeamFull }) => (
    <li className={`panel p-3 ${team.status === 'withdrawn' ? 'opacity-50' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-gold-300">{team.name} {team.seed != null && <span className="text-xs text-parchment-400">· {t('seed')} {team.seed}</span>}{team.groupNo != null && <span className="text-xs text-parchment-400"> · {t('group', { n: team.groupNo })}</span>}</p>
        <span className="tag">{t(`teamStatus.${team.status as 'pending' | 'confirmed' | 'withdrawn'}`)}</span>
      </div>
      <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-parchment-200">
        {team.members.map((m) => (
          <span key={m.playerId} className="inline-flex items-center gap-1">
            <Flag code={m.player.country} className="text-base leading-none" />
            <Link href={`/players/${m.player.profileId}`}>{m.player.alias}</Link>
            {m.isCaptain && tour.teamSize > 1 && <span className="text-xs text-parchment-500">({t('captain')})</span>}
          </span>
        ))}
      </p>
      {isOwner && (
        <form action={teamStatusAction} className="mt-2 flex flex-wrap gap-2 text-xs">
          {hidden}<input type="hidden" name="teamId" value={team.id} />
          {team.status === 'pending' && <button name="op" value="confirm" className="btn btn-primary">{t('admin.confirm')}</button>}
          {team.status === 'confirmed' && tour.status === 'open' && <button name="op" value="unconfirm" className="btn btn-ghost">{t('admin.unconfirm')}</button>}
          {tour.status === 'open' ? <button name="op" value="remove" className="btn btn-ghost">{t('admin.remove')}</button>
            : team.status !== 'withdrawn' && <button name="op" value="withdraw" className="btn btn-ghost">{t('admin.withdraw')}</button>}
        </form>
      )}
    </li>
  );

  const Games = ({ m }: { m: MatchFull }) => (
    <p className="text-xs text-parchment-400">
      {m.games.length === 0 ? t('noGames') : m.games.map((g, i) => (
        <span key={g.id}>{i > 0 && ' · '}{teamName(g.winnerTeamId)} ({g.source === 'auto' ? t('admin.auto') : t('admin.manual')}{g.matchId ? `, ${t('gameAuto', { id: g.matchId })}` : ''})</span>
      ))}
    </p>
  );

  return (
    <div className="space-y-10">
      {flash.ok === 'registered' && <div className="panel border-moss-500 p-4 text-parchment-50">{t('register.done')}</div>}
      {flash.err && <div className="panel border-crimson-500 p-4 text-parchment-50">{errText(flash.err)}</div>}

      <header className="panel corners p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="kicker">{t('title')}</p>
            <h1 className="text-3xl font-semibold text-gold-300 sm:text-4xl">{tour.name}</h1>
            {tour.description && <p className="mt-2 max-w-2xl whitespace-pre-line text-parchment-200">{tour.description}</p>}
            <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-parchment-300">
              <span className="tag"><Trophy className="h-3.5 w-3.5" />{t(`status.${tour.status as Status}`)}</span>
              <span className="tag">{t('format.size', { n: tour.teamSize })}</span>
              <span className="tag">{tour.groupCount > 0 ? t('format.groups', { n: tour.groupCount, adv: tour.advancePerGroup }) : t('format.knockout')}</span>
              <span className="tag">{t('format.bestOf', { n: tour.bestOf })}{tour.finalBestOf && tour.finalBestOf !== tour.bestOf ? `, ${t('format.finalBestOf', { n: tour.finalBestOf })}` : ''}{tour.groupCount > 0 && tour.groupBestOf !== tour.bestOf ? `, ${t('format.groupBestOf', { n: tour.groupBestOf })}` : ''}</span>
              <span className="tag"><Users className="h-3.5 w-3.5" />{tour.maxTeams ? t('teamsOf', { count: visibleTeams.filter((x) => x.status !== 'withdrawn').length, max: tour.maxTeams }) : t('teams', { count: visibleTeams.filter((x) => x.status !== 'withdrawn').length })}</span>
            </p>
            <p className="mt-2 flex flex-wrap gap-x-4 text-sm text-parchment-400">
              {tour.startsAt && <span>{t('startsAt', { date: dt.format(tour.startsAt) })}</span>}
              {owner && <span>{t('by', { name: owner.alias })}</span>}
            </p>
            {tour.prize && <p className="mt-2 text-sm text-parchment-200"><span className="kicker">{t('prize')}</span> {tour.prize}</p>}
            {champion && <p className="mt-3 font-display text-xl text-gold-300">🏆 {t('champion', { name: teamName(champion) })}</p>}
          </div>
          {isOwner && <span className="tag shrink-0 border-moss-500 text-parchment-50"><ShieldCheck className="h-4 w-4 text-moss-500" />{t('admin.youOwn')}</span>}
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-10">
          {tour.groupCount > 0 && groupMatches.length > 0 && (
            <section>
              <div className="rule mb-5"><span className="kicker">{t('groupsTitle')}</span></div>
              <div className="grid gap-6 md:grid-cols-2">
                {[...standings.entries()].sort((a, b) => a[0] - b[0]).map(([groupNo, rows]) => (
                  <div key={groupNo} className="panel p-4">
                    <h3 className="font-display text-lg text-gold-300">{t('group', { n: groupNo })}</h3>
                    <table className="mt-2 w-full text-sm">
                      <thead className="text-left text-xs uppercase text-parchment-400"><tr><th>{t('col.team')}</th><th className="text-right">{t('col.p')}</th><th className="text-right">{t('col.w')}</th><th className="text-right">{t('col.l')}</th><th className="text-right">{t('col.gd')}</th><th className="text-right">{t('col.pts')}</th></tr></thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={r.teamId} className={i < tour.advancePerGroup ? 'text-parchment-50' : 'text-parchment-300'}>
                            <td className="py-1">{teamName(r.teamId)}</td><td className="text-right stat-num">{r.played}</td><td className="text-right stat-num">{r.wins}</td><td className="text-right stat-num">{r.losses}</td><td className="text-right stat-num">{r.gamesWon - r.gamesLost}</td><td className="text-right stat-num font-semibold">{r.points}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <ul className="mt-3 space-y-1 text-sm">
                      {groupMatches.filter((m) => m.groupNo === groupNo).map((m) => (
                        <li key={m.id} className="flex items-center justify-between gap-2 text-parchment-200">
                          <span className={m.winnerTeamId === m.teamAId ? 'text-gold-300' : ''}>{teamName(m.teamAId)}</span>
                          <span className="stat-num text-parchment-50">{m.scoreA} – {m.scoreB}</span>
                          <span className={`text-right ${m.winnerTeamId === m.teamBId ? 'text-gold-300' : ''}`}>{teamName(m.teamBId)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="rule mb-5"><span className="kicker">{t('bracketTitle')}</span></div>
            {bracketMatches.length === 0 ? <p className="italic text-parchment-400">{t('noBracket')}</p> : (
              <Bracket matches={bracketMatches} teams={teams} labels={{ tbd: t('tbd'), bye: t('bye'), walkover: t('walkover'), roundName }} />
            )}
          </section>

          <section>
            <div className="rule mb-5"><span className="kicker">{t('teamsTitle')}</span></div>
            {visibleTeams.length === 0 ? <p className="italic text-parchment-400">{t('noTeams')}</p> : (
              <ul className="grid gap-3 sm:grid-cols-2">{visibleTeams.map((team) => <TeamLine key={team.id} team={team} />)}</ul>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <div className="panel p-4">
            <h3 className="font-display text-gold-300">{t('requirements.title')}</h3>
            {hasReqs ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-parchment-200">
                {tour.maxPeakRating != null && <li>{t('requirements.peak', { n: tour.maxPeakRating })}</li>}
                {tour.minGames != null && <li>{t('requirements.games', { n: tour.minGames })}</li>}
                {tour.minRecentGames != null && <li>{t('requirements.recent', { n: tour.minRecentGames })}</li>}
              </ul>
            ) : <p className="mt-2 text-sm text-parchment-300">{t('requirements.none')}</p>}
            {eligibility && hasReqs && (
              <p className={`mt-3 text-sm ${eligibility.ok ? 'text-moss-500' : 'text-crimson-500'}`}>
                {t('requirements.you', { peak: eligibility.peak ?? '–', games: eligibility.games, recent: eligibility.recent })} {eligibility.ok ? t('requirements.youOk') : t('requirements.youFail', { rules: eligibility.fails.map((r) => t(`requirements.rule.${r}`)).join(', ') })}
              </p>
            )}
          </div>

          {tour.status === 'open' && (
            <div className="panel p-4">
              <h3 className="font-display text-gold-300">{t('register.title')}</h3>
              {!session ? <a href={`/auth/steam?next=/${locale}/tournaments/${tour.slug}`} className="btn btn-ghost mt-3">{t('register.login')}</a>
                : !player ? <p className="mt-2 text-sm text-parchment-300">{t('register.claim')} <Link href="/me">→</Link></p>
                : myTeam ? <p className="mt-2 text-sm text-parchment-200">{t('register.already', { name: myTeam.name })}</p>
                : (
                  <form action={registerTeamAction} className="mt-3 space-y-3 text-sm">
                    {hidden}
                    <p className="text-parchment-300">{tour.teamSize > 1 ? t('register.hint') : t('register.solo')}</p>
                    {Array.from({ length: tour.teamSize - 1 }, (_, i) => (
                      <label key={i} className="block"><span className="text-parchment-300">{t('register.partner', { n: i + 1 })}</span><input name={`partner.${i}`} type="number" min={1} required className={field} /></label>
                    ))}
                    {tour.teamSize > 1 && <label className="block"><span className="text-parchment-300">{t('register.name')}</span><input name="name" maxLength={60} className={field} /></label>}
                    <button type="submit" className="btn btn-primary" disabled={eligibility != null && !eligibility.ok}>{t('register.button')}</button>
                  </form>
                )}
            </div>
          )}

          {isOwner && (
            <div className="panel space-y-4 border-moss-500/50 p-4">
              <h3 className="font-display text-gold-300">{t('admin.title')}</h3>
              {tour.status === 'open' && (
                <form action={addTeamAction} className="space-y-2 text-sm">
                  {hidden}
                  <p className="font-semibold text-parchment-200">{t('admin.addTeam')}</p>
                  {Array.from({ length: tour.teamSize }, (_, i) => (
                    <input key={i} name={`player.${i}`} type="number" min={1} required placeholder={t('admin.player', { n: i + 1 })} className={field} />
                  ))}
                  {tour.teamSize > 1 && <input name="name" maxLength={60} placeholder={t('register.name')} className={field} />}
                  {hasReqs && <label className="flex items-center gap-2 text-parchment-300"><input type="checkbox" name="skipEligibility" /> {t('admin.skipEligibility')}</label>}
                  <button type="submit" className="btn btn-ghost">{t('admin.add')}</button>
                </form>
              )}
              {tour.status === 'open' && (
                <form action={tour.groupCount > 0 ? startGroupsAction : startBracketAction} className="space-y-1 text-sm">
                  {hidden}
                  <button type="submit" className="btn btn-primary w-full">{tour.groupCount > 0 ? t('admin.startGroups') : t('admin.startBracket')}</button>
                  <p className="text-xs text-parchment-400">{tour.groupCount > 0 ? t('admin.startGroupsHint') : t('admin.startBracketHint')}</p>
                </form>
              )}
              {tour.status === 'groups' && (
                <form action={startBracketAction} className="space-y-1 text-sm">
                  {hidden}
                  <button type="submit" className="btn btn-primary w-full">{t('admin.startBracket')}</button>
                  <p className="text-xs text-parchment-400">{t('admin.startBracketHint')}</p>
                </form>
              )}
              {openMatches.length > 0 && (
                <div className="space-y-3 text-sm">
                  <p className="font-semibold text-parchment-200">{t('admin.report')}</p>
                  {openMatches.map((m) => (
                    <form key={m.id} action={reportGameAction} className="space-y-1 rounded border border-gold-700/40 p-2">
                      {hidden}<input type="hidden" name="matchId" value={m.id} />
                      <p className="text-xs text-parchment-400">{m.stage === 'group' ? t('group', { n: m.groupNo ?? 0 }) : roundName(m.round, Math.max(...bracketMatches.map((x) => x.round)))} · {m.scoreA}–{m.scoreB}</p>
                      <div className="flex gap-2">
                        <select name="winnerTeamId" className={field}>
                          <option value={m.teamAId ?? ''}>{teamName(m.teamAId)}</option>
                          <option value={m.teamBId ?? ''}>{teamName(m.teamBId)}</option>
                        </select>
                        <button type="submit" className="btn btn-ghost shrink-0">{t('admin.report')}</button>
                      </div>
                      <Games m={m} />
                    </form>
                  ))}
                </div>
              )}
              {undoable.length > 0 && (
                <div className="space-y-2 text-sm">
                  <p className="font-semibold text-parchment-200">{t('admin.undo')}</p>
                  {undoable.map((m) => (
                    <form key={m.id} action={undoGameAction} className="flex items-center justify-between gap-2">
                      {hidden}<input type="hidden" name="matchId" value={m.id} />
                      <span className="truncate text-parchment-300">{teamName(m.teamAId)} {m.scoreA}–{m.scoreB} {teamName(m.teamBId)}</span>
                      <button type="submit" className="btn btn-ghost shrink-0 text-xs">{t('admin.undo')}</button>
                    </form>
                  ))}
                </div>
              )}
              {tour.status !== 'finished' && (
                <form action={cancelAction}>{hidden}<button type="submit" className="text-xs text-crimson-500">{t('admin.cancel')}</button></form>
              )}
            </div>
          )}

          <div className="panel p-4 text-sm text-parchment-300">
            <p className="font-display text-gold-300">{t('games')}</p>
            <ul className="mt-2 space-y-1">
              {tour.matches.filter((m) => m.games.length > 0).slice(-8).reverse().map((m) => (
                <li key={m.id}>{teamName(m.teamAId)} <span className="stat-num text-parchment-50">{m.scoreA}–{m.scoreB}</span> {teamName(m.teamBId)}{m.games.at(-1)?.playedAt && <span className="text-parchment-500"> · {dts.format(m.games.at(-1)!.playedAt)}</span>}</li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
