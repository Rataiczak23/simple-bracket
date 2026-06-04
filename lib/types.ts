export type TournamentFormat = "single" | "double";
export type TournamentStatus = "setup" | "in_progress" | "completed";
export type BracketKind = "winners" | "losers" | "grand_final";

export interface Tournament {
  id: string;
  name: string;
  format: TournamentFormat;
  status: TournamentStatus;
  winner_id: string | null;
  created_at: string;
}

export interface Participant {
  id: string;
  tournament_id: string;
  name: string;
  seed: number | null;
  created_at: string;
}

export interface Match {
  id: string;
  tournament_id: string;
  bracket: BracketKind;
  round: number;
  match_number: number;
  slot1_participant: string | null;
  slot2_participant: string | null;
  winner_id: string | null;
  next_match_id: string | null;
  next_match_slot: 1 | 2 | null;
  loser_next_match_id: string | null;
  loser_next_match_slot: 1 | 2 | null;
  is_bye: boolean;
  created_at: string;
}

/** Shape returned to the client for a full tournament view. */
export interface TournamentBundle {
  tournament: Tournament;
  participants: Participant[];
  matches: Match[];
}
