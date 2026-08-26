export type DuelOpponentKind = 'live' | 'ghost';

export type DuelMatch = {
  id: string;
  level: number;
  seed: number;
  startsAt: number;
  expiresAt: number;
  status: 'ready' | 'finished' | 'expired';
  opponentKind: DuelOpponentKind;
  opponentName: string;
  ghostElapsedMs: number | null;
  winnerId: string | null;
  winnerSide: 'player' | 'ghost' | null;
  winnerElapsedMs: number | null;
  winnerAttempts: number | null;
  winnerAccuracy: number | null;
  isDraw: boolean;
  didWin: boolean | null;
};

export type DuelJoinResult =
  | { state: 'waiting'; onlineCount: number }
  | { state: 'matched'; match: DuelMatch };

export type DuelOutcome = {
  match: DuelMatch;
  localElapsedMs: number | null;
  localAttempts: number;
  localAccuracy: number;
  reason: 'caught' | 'opponent' | 'time' | 'misses' | 'draw' | 'connection';
};

export type DuelProfile = {
  nickname: string;
  matches: number;
  wins: number;
  losses: number;
  currentStreak: number;
  bestStreak: number;
  fastestWinMs: number | null;
  ghostWins: number;
};

export type DuelLeaguePlayer = {
  rank: number;
  nickname: string;
  wins: number;
  points: number;
  fastestWinMs: number | null;
  isMe: boolean;
};

export type DuelLeague = {
  weekStartsAt: number;
  players: DuelLeaguePlayer[];
  myRank: number | null;
};
