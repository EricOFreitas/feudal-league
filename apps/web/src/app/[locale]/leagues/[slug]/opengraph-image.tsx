import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';
import { db, divisions, leagues } from '@aoe2/db';
import { activeSeason, divisionCounts } from '@aoe2/sync';
import { asc, eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const alt = 'Feudal League';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const GOLD_LIGHT = '#e9cf8a';
const GOLD = '#b8893a';
const MUTED = '#9a8560';

// Traços dos ícones de divisão (mesmos de components/division-mark.tsx).
const MARKS: Record<string, string[]> = {
  shield: ['M12 3l7 2.5v5.5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V5.5L12 3z'],
  lance: ['M5 19L17 7', 'M14 4l6 6-3 1-4-4 1-3z', 'M7 13l4 4'],
  banner: ['M6 3v18', 'M6 4h12l-3 4 3 4H6'],
  tower: ['M7 21V8h10v13', 'M7 8V5h2v2h2V5h2v2h2V5h2v3', 'M11 21v-4h2v4'],
  castle: ['M3 21V9h4V6h2v3h6V6h2v3h4v12', 'M10 21v-5h4v5', 'M3 13h18'],
  crown: ['M4 18h16l1-10-5 4-4-6-4 6-5-4 1 10z', 'M4 21h16'],
};

function Mark({ nameKey, size: s }: { nameKey: string | null; size: number }) {
  const paths = (nameKey && MARKS[nameKey]) || null;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24">
      {paths
        ? paths.map((d, i) => <path key={i} d={d} fill="none" stroke={GOLD} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />)
        : <circle cx="12" cy="12" r="7" fill="none" stroke={GOLD} strokeWidth="1.6" />}
    </svg>
  );
}

function Crest({ size: s }: { size: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 64 64">
      <defs>
        <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={GOLD_LIGHT} />
          <stop offset="1" stopColor="#8a6424" />
        </linearGradient>
      </defs>
      <path d="M32 3 L56 11 V30 C56 45 45 55 32 61 C19 55 8 45 8 30 V11 Z" fill="#1b140e" stroke="url(#g)" strokeWidth="2.5" />
      <path d="M32 9 L50 15 V30 C50 41 42 49 32 54 C22 49 14 41 14 30 V15 Z" fill="none" stroke={GOLD} strokeWidth="1" opacity="0.6" />
      <path d="M22 40 V26 h4 v-4 h4 v4 h4 v-4 h4 v4 h4 v14 Z" fill="url(#g)" />
      <rect x="30" y="31" width="4" height="9" fill="#1b140e" />
    </svg>
  );
}

const frame = {
  width: '100%', height: '100%', display: 'flex', flexDirection: 'column' as const, justifyContent: 'space-between',
  padding: 64, color: GOLD_LIGHT, fontFamily: 'serif',
  background: 'radial-gradient(ellipse 80% 55% at 50% 0%, rgba(212,175,90,0.22), rgba(212,175,90,0) 70%), linear-gradient(180deg, #0f0c09, #1b140e)',
  border: '1px solid #5d4217',
};

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const league = await db.query.leagues.findFirst({ where: eq(leagues.slug, slug) });

  if (!league) {
    return new ImageResponse(
      (
        <div style={{ ...frame, alignItems: 'center', justifyContent: 'center' }}>
          <Crest size={160} />
          <div style={{ display: 'flex', fontSize: 84, marginTop: 24 }}>Feudal League</div>
        </div>
      ),
      size,
    );
  }

  const [season, divs, td] = await Promise.all([
    activeSeason(league.id),
    db.query.divisions.findMany({ where: eq(divisions.leagueId, league.id), orderBy: [asc(divisions.sort)] }),
    getTranslations({ locale, namespace: 'division' }),
  ]);
  const counts = season ? await divisionCounts(season.id) : new Map<number, number>();
  const members = (n: number) => (locale === 'pt' ? `${n} ${n === 1 ? 'membro' : 'membros'}` : `${n} ${n === 1 ? 'member' : 'members'}`);
  const kicker = `FEUDAL LEAGUE${season ? ` · ${locale === 'pt' ? 'TEMPORADA' : 'SEASON'} ${season.number}` : ''}`;
  const shown = divs.slice(0, 6);
  const nameSize = league.name.length > 28 ? 64 : league.name.length > 18 ? 80 : 96;

  return new ImageResponse(
    (
      <div style={frame}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Crest size={72} />
            <div style={{ display: 'flex', marginLeft: 24, fontSize: 28, letterSpacing: 6, color: GOLD }}>{kicker}</div>
          </div>
          <div style={{ display: 'flex', marginTop: 36, fontSize: nameSize, lineHeight: 1.1, fontWeight: 700, color: GOLD_LIGHT }}>{league.name}</div>
        </div>
        <div style={{ display: 'flex', width: '100%' }}>
          {shown.map((d, i) => (
            <div key={d.id} style={{ display: 'flex', flexDirection: 'column', flex: 1, borderTop: '2px solid #8a6424', paddingTop: 20, marginLeft: i === 0 ? 0 : 24 }}>
              <Mark nameKey={d.nameKey} size={44} />
              <div style={{ display: 'flex', marginTop: 12, fontSize: 28, color: GOLD_LIGHT }}>{d.name ?? (d.nameKey ? td(d.nameKey) : '?')}</div>
              <div style={{ display: 'flex', marginTop: 4, fontSize: 22, color: MUTED }}>{members(counts.get(d.id) ?? 0)}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
