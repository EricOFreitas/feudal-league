import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL não definida');

/** Uma conexão por processo. Em dev o Next recarrega módulos; o globalThis evita vazar pools. */
const g = globalThis as unknown as { __aoe2_sql?: ReturnType<typeof postgres> };
export const pgClient = g.__aoe2_sql ?? postgres(url, { max: 10, idle_timeout: 30, connect_timeout: 10 });
if (process.env.NODE_ENV !== 'production') g.__aoe2_sql = pgClient;

export const db = drizzle(pgClient, { schema });
export type Db = typeof db;
