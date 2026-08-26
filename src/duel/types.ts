export type DuelOpponentKind = 'live' | 'ghost';
export type DuelMatchSource = 'random' | 'ghost' | 'invite';

export type DuelMatch = {
  id: string;
  level: number;
  seed: number;
  startsAt: number;
  expiresAt: number;
  status: 'ready' | 'finished' | 'expired';
  opponentKind: DuelOpponentKind;
  matchSource: DuelMatchSource;
  sessionId: string | null;
  sessionRound: number | null;
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

export type DuelSessionStatus = 'playing' | 'choosing' | 'closed';

export type DuelSession = {
  id: string;
  source: 'random' | 'invite';
  status: DuelSessionStatus;
  round: number;
  selectedLevel: number;
  choiceDeadline: number | null;
  myScore: number;
  opponentScore: number;
  hostScore: number;
  guestScore: number;
  chooserIsMe: boolean;
  chooserName: string;
  opponentName: string;
  isHost: boolean;
  leftByMe: boolean;
  opponentLeft: boolean;
  lastWinnerIsMe: boolean;
  lastTauntId: number | null;
  lastTauntIsMine: boolean;
  match: DuelMatch | null;
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

export type DuelGesture = {
  kind: 'start' | 'move' | 'release';
  x: number;
  y: number;
  vx?: number;
  vy?: number;
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
  friendMatches: number;
  friendWins: number;
  friendLosses: number;
};

export type DuelInviteStatus = 'waiting' | 'matched' | 'cancelled' | 'expired';

export type DuelInvite = {
  id: string;
  status: DuelInviteStatus;
  hostName: string;
  guestName: string | null;
  selectedLevel: number;
  expiresAt: number;
  isHost: boolean;
  isGuest: boolean;
  match: DuelMatch | null;
  session: DuelSession | null;
};

export type DuelInvitePreview = {
  state: 'loading' | 'ready' | 'waiting' | 'matched' | 'own' | 'expired' | 'cancelled' | 'full' | 'busy' | 'missing' | 'error';
  hostName: string;
  selectedLevel: number;
  expiresAt: number;
  invite: DuelInvite | null;
};

export type DuelInviteCreation = { token: string; invite: DuelInvite };

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
