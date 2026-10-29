/**
 * Ladders devolvidas por getAvailableLeaderboards?title=age2 em 29/10/2026 (17 ladders).
 * CO_* = controle/console. POM = "Pick of the Month" custom. RBW_* = eventos Red Bull Wololo.
 * A API é a fonte da verdade; esta tabela é cache de conveniência.
 */
export const LEADERBOARDS = {
  1: { key: 'dm_1v1', matchTypes: [2, 60] },
  2: { key: 'dm_team', matchTypes: [3, 4, 5, 61] },
  3: { key: 'rm_1v1', matchTypes: [6] },
  4: { key: 'rm_team', matchTypes: [7, 8, 9] },
  5: { key: 'br_1v1', matchTypes: [10] },
  13: { key: 'ew_1v1', matchTypes: [26] },
  14: { key: 'ew_team', matchTypes: [27, 28, 29] },
  15: { key: 'co_rm_1v1', matchTypes: [66] },
  16: { key: 'co_rm_team', matchTypes: [67, 68, 69] },
  17: { key: 'co_ew_1v1', matchTypes: [86] },
  18: { key: 'co_ew_team', matchTypes: [87, 88, 89] },
  25: { key: 'pom_1v1', matchTypes: [120] },
  26: { key: 'pom_team', matchTypes: [121] },
  27: { key: 'rbw_reinado_1v1', matchTypes: [122] },
  28: { key: 'rbw_reinado_team', matchTypes: [123] },
  29: { key: 'rbw_londinium_1v1', matchTypes: [124] },
  30: { key: 'rbw_londinium_team', matchTypes: [125] },
} as const;

export type LeaderboardId = keyof typeof LEADERBOARDS;

/** Ordem de exibição: principais primeiro. */
export const LEADERBOARD_ORDER: LeaderboardId[] = [3, 4, 13, 14, 1, 2, 5, 15, 16, 17, 18, 25, 26, 27, 28, 29, 30];

export const RM_1V1: LeaderboardId = 3;

/** matchtype_id -> ladder a que pertence (null = lobby/não ranqueado). */
export function leaderboardOfMatchType(matchTypeId: number): LeaderboardId | null {
  for (const [id, lb] of Object.entries(LEADERBOARDS)) {
    if ((lb.matchTypes as readonly number[]).includes(matchTypeId)) return Number(id) as LeaderboardId;
  }
  return null;
}
