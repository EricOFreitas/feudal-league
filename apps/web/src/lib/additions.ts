import 'server-only';
import { db, playerAdditions } from '@aoe2/db';
import { and, eq, gt, sql } from 'drizzle-orm';
import { ipHash } from './ip';

const LIMIT_PER_HOUR = 20;

export async function checkAdditionLimit(): Promise<boolean> {
  const h = await ipHash();
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(playerAdditions)
    .where(and(eq(playerAdditions.ipHash, h), gt(playerAdditions.createdAt, since)));
  return (r?.n ?? 0) < LIMIT_PER_HOUR;
}

export async function recordAddition(profileId: number) {
  await db.insert(playerAdditions).values({ ipHash: await ipHash(), profileId });
}
