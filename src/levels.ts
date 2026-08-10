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
  id: number, name: string, chapter: string, description: string, behavior: CatBehavior,
  moveDelay: number, dodgeDelay: number, hitRadius: number, roundMs: number,
  accent: string, fur: string, poses: CatPose[], evil: number,
  attemptsAllowed = id >= 13 ? 2 : 3, hitsRequired?: number,
): Difficulty => ({ id, name, chapter, description, behavior, moveDelay, dodgeDelay, hitRadius, roundMs, accent, fur, poses, evil, attemptsAllowed, hitsRequired });

export const LEVELS: Difficulty[] = [
  level(1, '눈치냥', '입문부터 얄미움', '가만히 있지 않고 손가락을 감시해요.', 'watch', 790, 590, 78, 13_000, '#FFD95A', '#FFE3A9', ['wiggle', 'weave'], 0),
  level(2, '요리조리냥', '입문부터 얄미움', '짧은 지그재그로 손을 털어내요.', 'zigzag', 700, 520, 75, 12_500, '#FFC15A', '#FFD1A4', ['sidestep', 'paddle'], 0),
  level(3, '삭삭냥', '입문부터 얄미움', '손이 오면 상체를 삭삭 접어 피해요.', 'dodge', 650, 430, 72, 12_000, '#FFAA60', '#FFD7C0', ['weave', 'paddle', 'butt'], 1),
  level(4, '벽치냥', '입문부터 얄미움', '양쪽 벽을 차며 대각선으로 튀어요.', 'wall', 610, 400, 70, 11_500, '#FF906F', '#FFC6A9', ['leap', 'matrix'], 1),

  level(5, '문워크냥', '움직임이 수상함', '다가오는 척 반대로 미끄러져요.', 'moonwalk', 570, 370, 68, 11_000, '#FF7E83', '#FFD1DF', ['moonwalk', 'taunt'], 1),
  level(6, '페이크냥', '움직임이 수상함', '예고한 방향과 반대로 날아가요.', 'fake', 530, 340, 66, 10_800, '#EF729E', '#EAC8FF', ['crouch', 'leap', 'peek'], 2),
  level(7, '뺑뺑냥', '움직임이 수상함', '포획 원 주위를 원형으로 돌아요.', 'orbit', 500, 320, 64, 10_500, '#D474C4', '#D7D0FF', ['crab', 'windmill'], 2),
  level(8, '급발진냥', '움직임이 수상함', '정적과 폭주 박자를 섞어 달려요.', 'tempo', 470, 300, 62, 10_200, '#AE79DB', '#C9D3FF', ['flatten', 'panic', 'leap'], 2),

  level(9, '잔상냥', '손가락을 읽음', '가짜 몸 둘을 남겨 시선을 훔쳐요.', 'clone', 440, 285, 60, 10_000, '#8583E7', '#C8ECFF', ['sidestep', 'paddle'], 3),
  level(10, '예언냥', '손가락을 읽음', '손가락 진행 방향을 미리 읽어요.', 'predict', 420, 265, 59, 9_800, '#668EEB', '#BDEEE4', ['weave', 'matrix'], 3),
  level(11, '밀당냥', '손가락을 읽음', '멀면 끌고 가까우면 밀쳐내요.', 'magnet', 400, 250, 58, 9_600, '#4CA6DF', '#CBE7A9', ['peek', 'butt', 'moonwalk'], 3),
  level(12, '게걸음냥', '손가락을 읽음', '옆을 본 채 꺾인 축으로 달려요.', 'crab', 380, 235, 57, 9_400, '#3DBABF', '#FFE39A', ['crab', 'windmill'], 4),

  level(13, '깜빡냥', '규칙을 배신함', '찰나마다 위치를 끊어 바꿔요.', 'blink', 360, 220, 55, 9_200, '#35C4A2', '#FFCA9E', ['flatten', 'peek'], 4),
  level(14, '거울냥', '규칙을 배신함', '손가락 움직임을 반대로 복사해요.', 'mirror', 340, 205, 54, 9_000, '#68BE73', '#FFAEC5', ['matrix', 'paddle'], 4),
  level(15, '소용돌이냥', '규칙을 배신함', '점점 좁아지는 나선으로 유인해요.', 'spiral', 325, 195, 53, 8_800, '#A8B84D', '#D7B9FF', ['windmill', 'taunt', 'weave'], 5),
  level(16, '카오스냥', '규칙을 배신함', '매 순간 이동 규칙을 바꿔요.', 'chaos', 310, 185, 52, 8_600, '#E0A43C', '#B8D7FF', ['crab', 'leap', 'butt', 'flatten'], 5),

  level(17, '철벽냥', '고양이가 지배함', '머리 대신 엉덩이를 내밀어 방어해요.', 'guard', 295, 175, 50, 8_400, '#F08A38', '#B7B7C8', ['butt', 'matrix', 'paddle'], 6, 2, 2),
  level(18, '분노냥', '고양이가 지배함', '시간이 갈수록 계속 빨라져요.', 'rage', 280, 165, 49, 8_200, '#F2673D', '#9696AC', ['panic', 'windmill', 'weave'], 7, 2, 2),
  level(19, '근위대장냥', '고양이가 지배함', '분신과 예측 회피를 동시에 써요.', 'overlord', 265, 155, 48, 8_000, '#E54343', '#6F7188', ['peek', 'matrix', 'paddle', 'leap'], 8, 2, 3),
  level(20, '대마왕 하찮냥', '고양이가 지배함', '지금까지의 비겁함을 전부 꺼내요.', 'overlord', 245, 145, 46, 7_800, '#B92235', '#4E4A5E', ['taunt', 'butt', 'windmill', 'flatten', 'weave'], 10, 2, 4),
];

export const getLevel = (id: number) => LEVELS[Math.max(0, Math.min(LEVELS.length - 1, id - 1))];
