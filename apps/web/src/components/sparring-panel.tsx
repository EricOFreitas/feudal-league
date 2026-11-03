import { getTranslations } from 'next-intl/server';
import { Gamepad2, KeyRound, Swords } from 'lucide-react';
import { SPARRING_HOURS, type SparringEntry } from '@aoe2/sync';
import { Flag } from '@/components/flag';
import { Link } from '@/i18n/navigation';
import { clearSparringAction, setSparringAction } from '@/app/[locale]/leagues/actions';

type Me = {
  /** O jogador logado pode se marcar nesta divisão (é membro dela) e/ou como mentor (é da divisão de cima). */
  canTrain: boolean;
  canMentor: boolean;
  /** Disponibilidade ativa dele nesta liga (em qualquer divisão). */
  mine: { kind: string; expiresAt: Date } | null;
};

type Props = {
  locale: string;
  league: { id: number; slug: string };
  division: { id: number; label: string };
  aboveLabel: string | null;
  trainers: SparringEntry[];
  mentors: SparringEntry[];
  /** null = não logado. */
  me: Me | null;
  myPlayerId: number | null;
  flash: string | null;
};

/** Painel "Treino" da divisão: quem está disponível, botão de entrar no lobby e o formulário de ficar disponível. */
export async function SparringPanel({ locale, league, division, aboveLabel, trainers, mentors, me, myPlayerId, flash }: Props) {
  const t = await getTranslations('sparring');
  const hm = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
  const hidden = (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="slug" value={league.slug} />
      <input type="hidden" name="leagueId" value={league.id} />
      <input type="hidden" name="div" value={division.id} />
    </>
  );

  const Entry = ({ e }: { e: SparringEntry }) => (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gold-800/40 py-2 first:border-t-0">
      <span className="min-w-0 flex-1 break-words text-parchment-50">
        <Flag code={e.country} /> <Link href={`/players/${e.profileId}`}>{e.alias}</Link>
        {e.playerId === myPlayerId && <span className="ml-1 text-xs text-parchment-400">({t('you')})</span>}
        {e.note && <span className="block text-sm text-parchment-300">{e.note}</span>}
      </span>
      <span className="text-xs text-parchment-400">{t('until', { time: hm.format(e.expiresAt) })}</span>
      {e.lobby ? (
        <a href={`aoe2de://0/${e.lobby.id}`} className="btn btn-primary !px-3 !py-1.5 !text-xs" title={e.lobby.description ? t('lobbyName', { name: e.lobby.description }) : undefined}>
          <Gamepad2 className="h-3.5 w-3.5" />{t('join')} {e.lobby.players}/{e.lobby.maxPlayers}
          {e.lobby.passwordProtected && <KeyRound className="h-3 w-3" aria-label={t('password')} />}
        </a>
      ) : e.steamId64 ? (
        <a href={`https://steamcommunity.com/profiles/${e.steamId64}`} target="_blank" rel="noreferrer" className="text-xs">{t('steam')} ↗</a>
      ) : null}
    </li>
  );

  const any = trainers.length + mentors.length > 0;
  return (
    <div className="panel p-5">
      <p className="kicker flex items-center gap-2"><Swords className="h-4 w-4 text-gold-400" />{t('title', { division: division.label })}</p>
      <p className="mt-2 text-sm text-parchment-300">{t('intro')}</p>
      {flash && flash !== 'ok' && <p className="mt-3 rounded border border-crimson-500/60 bg-crimson-500/10 p-2 text-sm text-parchment-50">{t(`err.${flash === 'not_member' ? 'not_member' : 'no_division_below'}`)}</p>}

      {!any ? (
        <p className="mt-3 text-sm italic text-parchment-400">{t('empty')}</p>
      ) : (
        <div className="mt-3 space-y-3">
          {trainers.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider text-parchment-400">{t('trainers')}</p>
              <ul className="mt-1">{trainers.map((e) => <Entry key={e.playerId} e={e} />)}</ul>
            </div>
          )}
          {mentors.length > 0 && aboveLabel && (
            <div>
              <p className="text-xs uppercase tracking-wider text-parchment-400">{t('mentors', { division: aboveLabel })}</p>
              <ul className="mt-1">{mentors.map((e) => <Entry key={e.playerId} e={e} />)}</ul>
            </div>
          )}
        </div>
      )}

      <div className="relative mt-4 border-t border-gold-800/40 pt-4">
        {me == null ? (
          <a href={`/auth/steam?next=/${locale}/leagues/${league.slug}?div=${division.id}`} className="btn btn-ghost !text-xs">{t('login')}</a>
        ) : me.mine ? (
          <form action={clearSparringAction} className="flex flex-wrap items-center gap-3">
            {hidden}
            <span className="text-sm text-parchment-50">{me.mine.kind === 'mentor' ? t('mineMentor', { time: hm.format(me.mine.expiresAt) }) : t('mine', { time: hm.format(me.mine.expiresAt) })}</span>
            <button className="btn btn-ghost !px-3 !py-1.5 !text-xs">{t('leave')}</button>
          </form>
        ) : me.canTrain || me.canMentor ? (
          <form action={setSparringAction} className="flex flex-col gap-2">
            {hidden}
            <input name="note" maxLength={80} placeholder={t('note')} aria-label={t('note')} className="input !py-2 !text-sm" />
            <div className="flex flex-wrap gap-2">
              {me.canTrain && <button name="kind" value="train" className="btn btn-primary !px-3 !py-1.5 !text-xs"><Swords className="h-3.5 w-3.5" />{t('train')}</button>}
              {me.canMentor && <button name="kind" value="mentor" className="btn btn-ghost !px-3 !py-1.5 !text-xs">{t('mentor', { division: division.label })}</button>}
            </div>
            <p className="text-xs text-parchment-400">{t('hours', { h: SPARRING_HOURS })}</p>
          </form>
        ) : (
          <p className="text-xs text-parchment-400">{t('notMember')}</p>
        )}
      </div>
    </div>
  );
}
