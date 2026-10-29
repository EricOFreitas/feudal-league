import { z } from 'zod';

export const resultSchema = z.object({ code: z.number(), message: z.string() });

export const memberSchema = z.object({
  profile_id: z.number(),
  name: z.string(), // "/steam/<id64>" ou "/xbox/..."
  alias: z.string(),
  personal_statgroup_id: z.number(),
  xp: z.number(),
  level: z.number(),
  leaderboardregion_id: z.number(),
  country: z.string(),
  clanlist_name: z.string().optional().default(''),
});

export const statGroupSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.number(),
  members: z.array(memberSchema),
});

export const leaderboardStatSchema = z.object({
  statgroup_id: z.number(),
  leaderboard_id: z.number(),
  wins: z.number(),
  losses: z.number(),
  streak: z.number(),
  disputes: z.number(),
  drops: z.number(),
  rank: z.number(),
  ranktotal: z.number(),
  ranklevel: z.number(),
  rating: z.number(),
  regionrank: z.number(),
  regionranktotal: z.number(),
  lastmatchdate: z.number(),
  highestrank: z.number(),
  highestranklevel: z.number(),
  highestrating: z.number(),
});

export const personalStatResponse = z.object({
  result: resultSchema,
  statGroups: z.array(statGroupSchema).default([]),
  leaderboardStats: z.array(leaderboardStatSchema).default([]),
});

export const matchMemberSchema = z.object({
  matchhistory_id: z.number(),
  profile_id: z.number(),
  civilization_id: z.number(),
  statgroup_id: z.number(),
  teamid: z.number(),
  wins: z.number(),
  losses: z.number(),
  streak: z.number(),
  arbitration: z.number(),
  outcome: z.number(), // 1 = vitória, 0 = derrota (observado)
  oldrating: z.number(),
  newrating: z.number(),
  reporttype: z.number(),
});

export const matchSchema = z.object({
  id: z.number(),
  creator_profile_id: z.number(),
  mapname: z.string(),
  maxplayers: z.number(),
  matchtype_id: z.number(),
  description: z.string(),
  startgametime: z.number(),
  completiontime: z.number(),
  observertotal: z.number(),
  matchhistorymember: z.array(matchMemberSchema),
});

export const matchHistoryResponse = z.object({
  result: resultSchema,
  matchHistoryStats: z.array(matchSchema).default([]),
  profiles: z.array(memberSchema).default([]),
});

export const leaderboardResponse = z.object({
  result: resultSchema,
  statGroups: z.array(statGroupSchema).default([]),
  leaderboardStats: z.array(leaderboardStatSchema).default([]),
  rankTotal: z.number().optional(),
});

export type Member = z.infer<typeof memberSchema>;
export type LeaderboardStat = z.infer<typeof leaderboardStatSchema>;
export type ApiMatch = z.infer<typeof matchSchema>;
export type ApiMatchMember = z.infer<typeof matchMemberSchema>;
