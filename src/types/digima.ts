/** Types packs de votes (réf. projet DIGIMA / voting-indgo) */

export interface VotePack {
  id: string;
  votes: number;
  price_fcfa: number;
  label?: string;
  savings_percent?: number;
  is_popular?: boolean;
}
