import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { db, divisions, leagues } from '@aoe2/db';
import { DEFAULT_WEBHOOK_EVENTS, discordDivisionName, getLeagueWebhook, maskWebhookUrl, previewEmbeds } from '@aoe2/sync';
import { asc, eq } from 'drizzle-orm';
import { redirect } from '@/i18n/navigation';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { DiscordSettings, type DiscordFlash } from '@/components/discord-settings';
import { agoParts } from '@/lib/format';
import { divisionName } from '@/lib/leagues';
import { getSession } from '@/lib/session';

type Props = { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<{ ok?: string; err?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'discord' });
  return { title: t('title'), robots: { index: false } };
}

const FLASHES: DiscordFlash[] = ['saved', 'removed', 'test'];

/**
 * Avisos no Discord: só o dono da liga. Visitante sem sessão vai pro login; quem não é dono volta pra liga.
 * A URL salva chega na tela mascarada (id + 4 caracteres do token): o token é o segredo do webhook e a
 * tela pode aparecer em transmissão ou print. Colar uma URL nova troca; deixar a mascarada mantém.
 */
export default async function DiscordPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const q = await searchParams;
  const t = await getTranslations('discord');
  const tn = await getTranslations('nav');
  const tl = await getTranslations('leagues');
  const td = await getTranslations('division');
  const tc = await getTranslations('common');

  const league = await db.query.leagues.findFirst({ where: eq(leagues.slug, slug) });
  if (!league || league.status === 'archived') notFound();
  const session = await getSession();
  if (!session) redirect({ href: '/login', locale });
  if (league.ownerUserId !== session!.uid) redirect({ href: `/leagues/${league.slug}`, locale });

  const divs = await db.query.divisions.findMany({ where: eq(divisions.leagueId, league.id), orderBy: [asc(divisions.sort)] });
  const hook = await getLeagueWebhook(league.id);
  const name = league.isGlobal ? tl('global') : league.name;

  const ago = agoParts(hook?.lastSentAt ?? null);
  const flash: DiscordFlash | null = q.err === 'url' ? 'url' : q.err === 'test' ? 'testFailed' : FLASHES.find((f) => f === q.ok) ?? null;
  // prévia em português, com as mesmas funções do envio (o Discord não tem i18n nesta versão)
  const previews = previewEmbeds(league.isGlobal ? 'Liga Global' : league.name, divs[0] ? discordDivisionName(divs[0]) : 'Lança');
  const previewTime = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date());

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <div>
        <Breadcrumbs items={[{ label: tn('leagues'), href: '/leagues' }, { label: name, href: `/leagues/${league.slug}` }, { label: tn('discord') }]} />
        <header>
          <p className="kicker">{t('kicker', { league: name })}</p>
          <h1 className="text-3xl font-semibold text-gold-300 sm:text-4xl">{t('title')}</h1>
          <p className="mt-2 max-w-2xl text-pretty text-parchment-200">{t('intro')}</p>
        </header>
      </div>

      <DiscordSettings
        locale={locale}
        leagueId={league.id}
        savedMasked={hook ? maskWebhookUrl(hook.url) : null}
        events={hook ? hook.events : DEFAULT_WEBHOOK_EVENTS}
        divisionIds={hook ? hook.divisionIds : null}
        divisions={divs.map((d) => ({ id: d.id, name: divisionName(d, td), nameKey: d.nameKey }))}
        lastSentAgo={ago ? tc(`ago.${ago.key}`, { n: ago.n }) : null}
        lastError={hook?.lastError ?? null}
        flash={flash}
        previews={previews}
        previewTime={t('preview.time', { time: previewTime })}
      />
    </div>
  );
}
