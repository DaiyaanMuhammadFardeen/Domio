/**
 * @domio/join-web — Tournament widget types (S5.11).
 *
 * A tournament is a sequence of rounds. Each round has a list of
 * matchups. A matchup is a 1v1 pairing; `winnerId` is populated when
 * the round is decided.
 *
 * Rounds are rendered as columns left-to-right (earliest round on
 * the left, final on the right).
 */

export interface MatchupParticipant {
  readonly participantId: string;
  readonly name: string;
}

export interface Matchup {
  readonly a: MatchupParticipant;
  readonly b: MatchupParticipant;
  /** Set when the matchup has been decided; null/undefined while pending. */
  readonly winnerId?: string;
}

export interface TournamentRound {
  readonly id: string;
  readonly name: string;
  readonly matchups: ReadonlyArray<Matchup>;
}

export type TournamentName =
  | 'Round of 16'
  | 'Quarterfinals'
  | 'Semifinals'
  | 'Final';
