/**
 * Concede ou remove um badge manual (supporter, code, translator). É assim que o dono do portal marca quem doou.
 *
 * Uso (a partir de apps/worker):
 *   node --env-file-if-exists=../../.env --import tsx src/tools/grant-badge.ts <profileId> <supporter|code|translator> [--revoke] [--note "texto"]
 *
 * O jogador precisa já estar no banco (abra o perfil no site uma vez se não estiver).
 * organizer não entra aqui: é computado (dono de liga com 10+ membros ou de torneio encerrado).
 */
import { pgClient } from '@aoe2/db';
import { GRANTABLE_BADGES, badgesOf, findPlayerByProfileId, grantBadge, isGrantableBadge, revokeBadge } from '@aoe2/sync';

const args = process.argv.slice(2);
const revoke = args.includes('--revoke');
const noteIdx = args.indexOf('--note');
const note = noteIdx >= 0 ? args[noteIdx + 1] : undefined;
const positional = args.filter((a, i) => !a.startsWith('--') && (noteIdx < 0 || i !== noteIdx + 1));
const [rawProfile, badge] = positional;

function usage(msg: string): never {
  console.error(msg);
  console.error(`uso: grant-badge.ts <profileId> <${GRANTABLE_BADGES.join('|')}> [--revoke] [--note "texto"]`);
  process.exit(1);
}

const profileId = Number(rawProfile);
if (!Number.isInteger(profileId) || profileId <= 0) usage(`profileId inválido: ${rawProfile ?? '(vazio)'}`);
if (!isGrantableBadge(badge)) usage(`badge inválido: ${badge ?? '(vazio)'}`);
if (noteIdx >= 0 && (note == null || note.startsWith('--'))) usage('--note precisa de um texto');

try {
  const player = await findPlayerByProfileId(profileId);
  if (!player) usage(`jogador ${profileId} não está no banco; abra /players/${profileId} no site primeiro`);

  if (revoke) {
    const removed = await revokeBadge(player.id, badge);
    console.log(removed ? `removido: ${badge} de ${player.alias} (${profileId})` : `${player.alias} (${profileId}) não tinha ${badge}`);
  } else {
    const row = await grantBadge(player.id, badge, note);
    console.log(`concedido: ${badge} a ${player.alias} (${profileId}) · visível=${row.visible} · nota=${row.note ?? '-'} · desde ${row.grantedAt.toISOString()}`);
  }
  console.log(`badges visíveis agora: ${(await badgesOf(player.id)).join(', ') || '(nenhum)'}`);
} finally {
  await pgClient.end();
}
