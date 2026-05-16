/**
 * Packs de votes — grille inspirée voting-nestor, plafonnée à 20 votes max (4 packs).
 */

import type { VotePack } from "@/types/digima";

/** 1, 5, 10, 20 votes — mêmes tarifs nestor pour ces paliers */
export const VOTE_PACKS: VotePack[] = [
  {
    id: "pack-1",
    votes: 1,
    price_fcfa: 200,
    label: undefined,
    savings_percent: 0,
    is_popular: false,
  },
  {
    id: "pack-5",
    votes: 5,
    price_fcfa: 1000,
    label: undefined,
    savings_percent: 0,
    is_popular: false,
  },
  {
    id: "pack-10",
    votes: 10,
    price_fcfa: 1500,
    label: undefined,
    savings_percent: 0,
    is_popular: false,
  },
  {
    id: "pack-20",
    votes: 20,
    price_fcfa: 3000,
    label: undefined,
    savings_percent: 0,
    is_popular: false,
  },
];

export function getPackById(id: string): VotePack | undefined {
  return VOTE_PACKS.find((pack) => pack.id === id);
}

export function getPackByVotes(votes: number): VotePack | undefined {
  return VOTE_PACKS.find((pack) => pack.votes === votes);
}

export function calculatePrice(votes: number): number {
  const pack = getPackByVotes(votes);
  if (pack) {
    return pack.price_fcfa;
  }
  return votes * 200;
}

export function formatPriceFcfa(price: number): string {
  return `${price.toLocaleString("fr-FR")} FCFA`;
}

export function getPricePerVote(pack: VotePack): number {
  return pack.price_fcfa / pack.votes;
}

/** Référence : prix unitaire du pack 1 vote (200 FCFA), comme sur voting-nestor */
export function calculateSavings(pack: VotePack): number {
  const unitPrice = 200;
  const packPricePerVote = getPricePerVote(pack);
  const savingsPerVote = unitPrice - packPricePerVote;
  return (savingsPerVote / unitPrice) * 100;
}
