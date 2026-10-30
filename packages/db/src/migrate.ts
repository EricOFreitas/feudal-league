import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL não definida');
const sql = postgres(url, { max: 1, onnotice: () => {} });
await migrate(drizzle(sql), { migrationsFolder: new URL('../drizzle', import.meta.url).pathname });

// Liga global: pertence ao sistema, nasce aqui (idempotente).
const DIVS = [
  ['shield', 0, 899], ['lance', 900, 1099], ['banner', 1100, 1299], ['tower', 1300, 1499], ['castle', 1500, 1799], ['crown', 1800, null],
] as const;
const [g] = await sql`insert into leagues (slug, name, is_global) values ('global', 'Liga Global', true) on conflict (slug) do nothing returning id`;
if (g) {
  await sql`insert into seasons (league_id, number) values (${g.id}, 1)`;
  for (const [i, [key, min, max]] of DIVS.entries()) {
    await sql`insert into divisions (league_id, sort, name_key, rating_min, rating_max) values (${g.id}, ${i}, ${key}, ${min}, ${max})`;
  }
  console.log('liga global criada');
}
// Regras da Liga Global (30/10/2026): derrota 0, conta ranqueada contra não-membro da faixa e traz o adversário.
await sql`update leagues set points_loss = 0, count_non_members = true, auto_join_opponents = true where slug = 'global'`;
await sql.end();
console.log('migrations aplicadas');
