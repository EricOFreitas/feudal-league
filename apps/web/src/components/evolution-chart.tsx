/**
 * Gráfico da posição semana a semana (SVG 600×200, desenhado no servidor).
 * Posição menor é melhor: o melhor valor fica no topo, o pior embaixo.
 * Precisa de pelo menos 2 pontos; quem chama mostra a frase de "ainda sem dados" antes disso.
 */
export function EvolutionChart({ positions, posLabel, weekLabel, aria }: {
  positions: number[];
  posLabel: (pos: number) => string;
  weekLabel: (n: number) => string;
  aria: string;
}) {
  const n = positions.length;
  if (n < 2) return null;
  const best = Math.min(...positions), worst = Math.max(...positions);
  const L = 48, R = 580, T = 16, B = 168;
  const X = (i: number) => L + (i * (R - L)) / (n - 1);
  const Y = (p: number) => Math.round((worst === best ? (T + B) / 2 : T + ((p - best) / (worst - best)) * (B - T)) * 10) / 10;
  const pts = positions.map((p, i) => ({ x: X(i), y: Y(p), last: i === n - 1 }));
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[n - 1]!.x.toFixed(1)} ${B} L${pts[0]!.x.toFixed(1)} ${B} Z`;
  const ticks = [...new Set([best, Math.round((best + worst) / 2), worst])];
  // Muitas semanas: rótulo do eixo X a cada k pontos (o último sempre aparece).
  const step = Math.max(1, Math.ceil(n / 12));

  return (
    <svg viewBox="0 0 600 200" className="block h-auto w-full" role="img" aria-label={aria}>
      {ticks.map((tk) => (
        <g key={tk}>
          <line x1={40} x2={590} y1={Y(tk)} y2={Y(tk)} stroke="rgba(93,66,23,0.5)" strokeDasharray="3 4" />
          <text x={32} y={Y(tk) + 4} fill="#9a8560" textAnchor="end" className="font-display" fontSize={12}>{posLabel(tk)}</text>
        </g>
      ))}
      <path d={area} fill="rgba(184,137,58,0.12)" />
      <path d={line} fill="none" stroke="#d4af5a" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={p.last ? 6 : 3.5} fill={p.last ? '#d4af5a' : '#221a13'} stroke="#d4af5a" strokeWidth={2} />
          {(i % step === 0 || p.last) && (
            <text x={p.x} y={192} fill="#9a8560" textAnchor="middle" fontSize={13}>{weekLabel(i + 1)}</text>
          )}
        </g>
      ))}
    </svg>
  );
}
