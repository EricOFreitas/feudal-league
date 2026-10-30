/**
 * Compara modelos do OpenRouter na mesma partida e no mesmo prompt.
 *
 *   cd apps/worker && node --env-file-if-exists=../../.env --import tsx src/tools/compare-models.ts \
 *     <matchId> <profileId> <pt|en> [--out DIR] model1 model2 ...
 *
 * Exige o analyzer no ar (ANALYZER_URL) e OPENROUTER_API_KEY. Imprime tokens, custo e tempo de cada
 * modelo e grava cada feedback em DIR/<modelo>.md (se --out).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { db, matches } from '@aoe2/db';
import { analysisContext, buildPrompt, callLlm, parseReplay, syncMatchHistory } from '@aoe2/sync';
import { eq } from 'drizzle-orm';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outDir = outIdx >= 0 ? args.splice(outIdx, 2)[1] : null;
const [matchIdS, profileIdS, locale = 'pt', ...models] = args;
const matchId = Number(matchIdS);
const profileId = Number(profileIdS);
if (!matchId || !profileId || models.length === 0) {
  console.error('uso: compare-models.ts <matchId> <profileId> <pt|en> [--out DIR] model...');
  process.exit(1);
}

if (!(await db.query.matches.findFirst({ where: eq(matches.id, matchId) }))) {
  console.log('partida não está no banco; sincronizando histórico do jogador…');
  await syncMatchHistory([profileId]);
}
const members = await db.query.matches.findFirst({ where: eq(matches.id, matchId), with: { members: true } });
if (!members) throw new Error('partida não encontrada nem após sync');
const ids = [profileId, ...members.members.map((m) => m.profileId).filter((p) => p !== profileId)];

console.log('parseando replay…');
const parse = await parseReplay(matchId, ids);
const ctx = await analysisContext(matchId, profileId, parse);
const prompt = buildPrompt(locale, ctx.text);
console.log(`contexto: ${ctx.text.length} chars\n`);
if (outDir) { mkdirSync(outDir, { recursive: true }); writeFileSync(`${outDir}/_context.txt`, `${prompt.system}\n\n---\n\n${prompt.user}`); }

const rows: { model: string; in: number | null; out: number | null; usd: string; s: string; words: number }[] = [];
for (const model of models) {
  const t0 = Date.now();
  try {
    const r = await callLlm(model, prompt);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    rows.push({ model, in: r.promptTokens, out: r.completionTokens, usd: r.costMicroUsd != null ? (r.costMicroUsd / 1e6).toFixed(5) : '?', s: secs, words: r.text.split(/\s+/).length });
    console.log(`\n========== ${model} (${secs}s, ${r.promptTokens}/${r.completionTokens} tokens, $${rows.at(-1)!.usd}) ==========\n`);
    console.log(r.text);
    if (outDir) writeFileSync(`${outDir}/${model.replace(/[^a-z0-9.-]+/gi, '_')}.md`, r.text);
  } catch (e) {
    rows.push({ model, in: null, out: null, usd: 'erro', s: ((Date.now() - t0) / 1000).toFixed(1), words: 0 });
    console.log(`\n========== ${model}: ERRO ${(e as Error).message}`);
  }
}
console.log('\nresumo:');
console.table(rows);
if (outDir) writeFileSync(`${outDir}/_summary.json`, JSON.stringify(rows, null, 2));
process.exit(0);
