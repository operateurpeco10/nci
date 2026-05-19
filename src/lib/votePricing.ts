const VOTE_PACKS: Record<number, number> = {
  1: 200,
  5: 1000,
  10: 1500,
  20: 3000,
};

export function getPriceFcfaForVotes(nbVotes: number): number | null {
  const n = VOTE_PACKS[nbVotes];
  return n === undefined ? null : n;
}
