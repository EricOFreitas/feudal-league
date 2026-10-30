// Junta messages/base/<locale>.json com messages/parts/*.<locale>.json em messages/<locale>.json.
// Cada área do site tem o próprio arquivo em parts/ (ex.: parts/about.pt.json), o que evita
// conflito quando várias pessoas mexem em strings ao mesmo tempo. Falha se pt e en divergirem.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'messages');
const locales = ['pt', 'en'];

function merge(dst, src, path = '') {
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (dst[k] && typeof dst[k] !== 'object') throw new Error(`conflito em ${path}${k}: objeto sobre string`);
      dst[k] = merge(dst[k] ?? {}, v, `${path}${k}.`);
    } else dst[k] = v;
  }
  return dst;
}
function keys(o, pre = '') {
  return Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${pre}${k}.`) : [`${pre}${k}`]));
}

const partsDir = join(root, 'parts');
if (!existsSync(partsDir)) mkdirSync(partsDir);
const out = {};
for (const locale of locales) {
  const merged = JSON.parse(readFileSync(join(root, 'base', `${locale}.json`), 'utf8'));
  const parts = readdirSync(partsDir).filter((f) => f.endsWith(`.${locale}.json`)).sort();
  for (const f of parts) merge(merged, JSON.parse(readFileSync(join(partsDir, f), 'utf8')));
  out[locale] = merged;
}
const [a, b] = locales.map((l) => new Set(keys(out[l])));
const onlyA = [...a].filter((k) => !b.has(k)), onlyB = [...b].filter((k) => !a.has(k));
if (onlyA.length || onlyB.length) {
  console.error('messages: chaves diferentes entre pt e en.\n  só em pt:', onlyA.join(', ') || '-', '\n  só em en:', onlyB.join(', ') || '-');
  process.exit(1);
}
for (const locale of locales) writeFileSync(join(root, `${locale}.json`), JSON.stringify(out[locale], null, 2) + '\n');
console.log(`messages: ${a.size} chaves, ${locales.length} idiomas, ${readdirSync(partsDir).length} arquivos em parts/`);
