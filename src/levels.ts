export type CatPose =
  | 'wiggle' | 'crouch' | 'leap' | 'sidestep' | 'moonwalk' | 'taunt' | 'panic'
  | 'weave' | 'matrix' | 'crab' | 'flatten' | 'paddle' | 'butt' | 'windmill' | 'peek';

export type CatBehavior =
  | 'patrol' | 'watch' | 'dodge' | 'zigzag' | 'moonwalk'
  | 'fake' | 'wall' | 'orbit' | 'tempo' | 'clone'
  | 'predict' | 'magnet' | 'crab' | 'blink' | 'mirror'
  | 'spiral' | 'chaos' | 'guard' | 'rage' | 'overlord';

export type Difficulty = {
  id: number;
  name: string;
  chapter: string;
  description: string;
  behavior: CatBehavior;
  secondaryBehavior: CatBehavior;
  moveDelay: number;
  dodgeDelay: number;
  hitRadius: number;
  roundMs: number;
  accent: string;
  fur: string;
  poses: CatPose[];
  attemptsAllowed: number;
  hitsRequired?: number;
  evil: number;
};

const level = (
  id: number, name: string, chapter: string, description: string,
  behaviors: [CatBehavior, CatBehavior], moveDelay: number, dodgeDelay: number, hitRadius: number,
  accent: string, fur: string, poses: CatPose[], evil: number, hitsRequired?: number,
): Difficulty => ({
  id, name, chapter, description,
  behavior: behaviors[0], secondaryBehavior: behaviors[1],
  moveDelay, dodgeDelay, hitRadius,
  roundMs: 15_000, attemptsAllowed: 5,
  accent, fur, poses, evil, hitsRequired,
});

export const LEVELS: Difficulty[] = [
  level(1, '눈치냥', '아직 봐주는 중', '손끝을 보다가 지그재그로 슬쩍 빠져요.', ['watch', 'zigzag'], 700, 520, 75, '#FFC15A', '#FFD1A4', ['weave', 'paddle', 'sidestep'], 0),
  level(2, '삭삭냥', '아직 봐주는 중', '닿기 직전에 몸을 접고 벽으로 빠져요.', ['dodge', 'wall'], 610, 400, 70, '#FF906F', '#FFD7C0', ['weave', 'paddle', 'matrix', 'leap'], 1),
  level(3, '딴청냥', '슬슬 약 오름', '쫓으면 반대로, 멈추면 슬쩍 돌아와요.', ['fake', 'moonwalk'], 530, 340, 66, '#EF729E', '#EAC8FF', ['crouch', 'leap', 'moonwalk', 'peek'], 2),
  level(4, '급발진냥', '슬슬 약 오름', '빙글빙글 돌다가 갑자기 박자를 바꿔요.', ['orbit', 'tempo'], 470, 300, 62, '#AE79DB', '#C9D3FF', ['windmill', 'crab', 'flatten', 'panic'], 3),
  level(5, '잔상냥', '손을 읽는 중', '잔상을 남기고 손이 갈 곳을 먼저 찾아가요.', ['clone', 'predict'], 420, 265, 59, '#668EEB', '#C8ECFF', ['sidestep', 'paddle', 'matrix'], 4),
  level(6, '옆걸음냥', '손을 읽는 중', '옆으로 달리다가 가까워지면 밀어내요.', ['crab', 'magnet'], 380, 235, 57, '#3DBABF', '#FFE39A', ['crab', 'windmill', 'butt'], 5),
  level(7, '깜빡냥', '규칙이 사라짐', '사라졌다가 손의 반대편에 나타나요.', ['blink', 'mirror'], 340, 205, 54, '#68BE73', '#FFCA9E', ['flatten', 'peek', 'matrix'], 6),
  level(8, '변덕냥', '규칙이 사라짐', '돌다가, 튀다가, 마음대로 규칙을 바꿔요.', ['spiral', 'chaos'], 310, 185, 52, '#E0A43C', '#B8D7FF', ['windmill', 'taunt', 'weave', 'flatten'], 7),
  level(9, '철벽냥', '이제 고양이 차례', '엉덩이로 막고 시간이 갈수록 빨라져요.', ['guard', 'rage'], 280, 165, 49, '#F2673D', '#9696AC', ['butt', 'matrix', 'paddle', 'panic'], 8, 2),
  level(10, '대마왕 하찮냥', '이제 고양이 차례', '지금까지 본 회피를 전부 꺼내요. 네 번 잡아야 끝나요.', ['overlord', 'chaos'], 245, 145, 46, '#B92235', '#4E4A5E', ['taunt', 'butt', 'windmill', 'flatten', 'weave'], 10, 4),
];

export const getLevel = (id: number) => LEVELS[Math.max(0, Math.min(LEVELS.length - 1, id - 1))];
