import { getActiveCampaign } from "@/lib/campaigns";
import { readTruthyEnvVar } from "@/lib/readTruthyEnvVar";

/** Fermeture globale via variable d'environnement */
export function isVotesClosedEnv(): boolean {
  return readTruthyEnvVar("VOTES_CLOSED");
}

/** @deprecated Préférer areVotesClosed() pour inclure la base */
export function isVotesClosed(): boolean {
  return isVotesClosedEnv();
}

/** Env OU campagne active fermée en base */
export async function areVotesClosed(): Promise<boolean> {
  if (isVotesClosedEnv()) return true;
  const campaign = await getActiveCampaign();
  return campaign?.votes_closed === true;
}
