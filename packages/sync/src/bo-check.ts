/**
 * Conferidor de build order (treino, T2): compara a linha do tempo da gravação (match_metrics.events) com os
 * marcos de uma BO de referência (build-orders.ts). Puro: sem banco.
 */
import type { ParseEvent } from './analyzer';
import type { BuildOrder, Checkpoint } from './build-orders';

export type CheckStatus = 'ok' | 'late' | 'early' | 'off_vils' | 'missing';
export type CheckRow = {
  key: string; label: { pt: string; en: string }; kind: Checkpoint['kind'];
  expectVils: number; targetS: number;
  actualVils: number | null; actualS: number | null;
  status: CheckStatus;
};
export type CheckResult = { rows: CheckRow[]; ok: number; total: number; score: number };

/** Atraso tolerado (s) e diferença tolerada de aldeões. */
const LATE_S = 45;
const EARLY_S = 90;
const VILS_TOL = 1;

type Ages = { feudalS: number | null; castleS: number | null };

function find(events: ParseEvent[], cp: Checkpoint): ParseEvent | null {
  if (cp.kind === 'q') {
    let acc = 0;
    for (const e of events) {
      if (e.k !== 'q' || e.n !== cp.name) continue;
      acc += e.a;
      if (acc >= (cp.amount ?? 1)) return e;
    }
    return null;
  }
  let seen = 0;
  for (const e of events) {
    if (e.k !== cp.kind || e.n !== cp.name) continue;
    seen++;
    if (seen >= (cp.nth ?? 1)) return e;
  }
  return null;
}

/** Aldeões vivos num instante: último evento até lá (ou os iniciais). */
function vilsAt(events: ParseEvent[], sec: number, start: number): number {
  let v = start;
  for (const e of events) { if (e.t > sec) break; v = e.v; }
  return v;
}

export function checkBuildOrder(bo: BuildOrder, events: ParseEvent[], ages: Ages, startVils = 3): CheckResult {
  const sorted = [...events].sort((a, b) => a.t - b.t);
  const rows: CheckRow[] = bo.checkpoints.map((cp) => {
    let actualS: number | null = null;
    let actualVils: number | null = null;
    if (cp.kind === 'age') {
      actualS = cp.name === 'feudal' ? ages.feudalS : ages.castleS;
      actualVils = actualS == null ? null : vilsAt(sorted, actualS, startVils);
    } else {
      const e = find(sorted, cp);
      if (e) { actualS = e.t; actualVils = e.v; }
    }
    let status: CheckStatus = 'missing';
    if (actualS != null && actualVils != null) {
      if (actualS > cp.targetS + LATE_S) status = 'late';
      else if (Math.abs(actualVils - cp.vils) > VILS_TOL) status = 'off_vils';
      else if (actualS < cp.targetS - EARLY_S) status = 'early';
      else status = 'ok';
    }
    return { key: cp.key, label: cp.label, kind: cp.kind, expectVils: cp.vils, targetS: cp.targetS, actualVils, actualS, status };
  });
  const ok = rows.filter((r) => r.status === 'ok' || r.status === 'early').length;
  return { rows, ok, total: rows.length, score: rows.length ? Math.round((100 * ok) / rows.length) : 0 };
}
