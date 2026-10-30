/**
 * Renderizador mínimo de Markdown pro feedback da IA: títulos (##, ###), listas (-, *, 1.),
 * parágrafos e **negrito**. Só gera nós de texto; nada de HTML cru.
 */
import type { ReactNode } from 'react';

function inline(text: string, key: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={`${key}-${i}`} className="text-parchment-50">{p.slice(2, -2)}</strong> : p));
}

export function Markdown({ text }: { text: string }) {
  const out: ReactNode[] = [];
  const lines = text.replace(/\r/g, '').split('\n');
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let k = 0;
  const flushPara = () => {
    if (para.length) { out.push(<p key={k++} className="leading-relaxed">{inline(para.join(' '), `p${k}`)}</p>); para = []; }
  };
  const flushList = () => {
    if (list) {
      const items = list.items.map((it, i) => <li key={i}>{inline(it, `l${k}-${i}`)}</li>);
      out.push(list.ordered ? <ol key={k++} className="list-decimal space-y-1 pl-6">{items}</ol> : <ul key={k++} className="list-disc space-y-1 pl-6">{items}</ul>);
      list = null;
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const li = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (h) {
      flushPara(); flushList();
      const txt = (h[2] ?? '').replace(/\s*#+$/, '');
      out.push((h[1] ?? '').length <= 2 ? <h2 key={k++} className="mt-6 font-display text-xl text-gold-300 first:mt-0">{txt}</h2> : <h3 key={k++} className="mt-4 font-display text-lg text-gold-400">{txt}</h3>);
    } else if (li) {
      flushPara();
      const ordered = /^\s*\d/.test(line);
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      list.items.push(li[1] ?? '');
    } else if (line.trim() === '') {
      flushPara(); flushList();
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara(); flushList();
  return <div className="space-y-3 text-parchment-100">{out}</div>;
}
