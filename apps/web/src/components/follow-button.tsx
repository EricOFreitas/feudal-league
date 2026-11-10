import { UserCheck, UserPlus } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { followAction, unfollowAction } from '@/app/[locale]/players/actions';

type Props = {
  playerId: number; locale: string; logged: boolean; following: boolean;
  /** Página pra onde a ação volta. */
  back?: 'player' | 'following';
  labels: { follow: string; following: string; unfollow: string };
};

/** Seguir / deixar de seguir. Sem login, leva pra página que explica o login Steam. */
export function FollowButton({ playerId, locale, logged, following, back = 'player', labels }: Props) {
  if (!logged) {
    return <Link href="/login" className="btn btn-ghost"><UserPlus className="h-4 w-4" />{labels.follow}</Link>;
  }
  if (following) {
    return (
      <form action={unfollowAction} className="flex items-center gap-3">
        <input type="hidden" name="playerId" value={playerId} />
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="back" value={back} />
        <span className="tag border-gold-500 text-parchment-50"><UserCheck className="h-4 w-4 text-gold-400" />{labels.following}</span>
        <button type="submit" className="cursor-pointer text-xs text-parchment-400 hover:text-crimson-500">{labels.unfollow}</button>
      </form>
    );
  }
  return (
    <form action={followAction}>
      <input type="hidden" name="playerId" value={playerId} />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="back" value={back} />
      <button type="submit" className="btn btn-ghost"><UserPlus className="h-4 w-4" />{labels.follow}</button>
    </form>
  );
}
