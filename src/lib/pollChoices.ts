export type { ChoiceAccent } from "@/lib/pollChoiceUi";
export {
  accentForDisplayIndex,
  responseSlotLabel,
  slotIndexFromChoiceId,
} from "@/lib/pollChoiceUi";

export type PollChoiceRow = {
  id: string;
  label: string;
  response_count?: number | null;
};

export type PollChoicePublic = {
  id: string;
  label: string;
  votes: number;
};

export function mapPollChoicesFromDb(rows: PollChoiceRow[]): PollChoicePublic[] {
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    votes: Math.max(0, row.response_count ?? 0),
  }));
}
