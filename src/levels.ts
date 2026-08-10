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
  level(1, '요리조리냥', '입문부터 얄미움', '손가락을 감시하다 지그재그로 빠져요.', ['watch', 'zigzag'], 700, 520, 75, '#FFC15A', '#FFD1A4', ['weave', 'paddle', 'sidestep'], 0),
  level(2, '삭삭냥', '입문부터 얄미움', '상체를 삭삭 접고 벽까지 차며 피해요.', ['dodge', 'wall'], 610, 400, 70, '#FF906F', '#FFD7C0', ['weave', 'paddle', 'matrix', 'leap'], 1),
  level(3, '페이크냥', '움직임이 수상함', '반대로 뛰고 문워크로 되감아 와요.', ['fake', 'moonwalk'], 530, 340, 66, '#EF729E', '#EAC8FF', ['crouch', 'leap', 'moonwalk', 'peek'], 2),
  level(4, '뺑뺑냥', '움직임이 수상함', '원을 그리다 갑자기 급발진해요.', ['orbit', 'tempo'], 470, 300, 62, '#AE79DB', '#C9D3FF', ['windmill', 'crab', 'flatten', 'panic'], 3),
  level(5, '잔상냥', '손가락을 읽음', '분신을 남기고 손의 다음 위치를 읽어요.', ['clone', 'predict'], 420, 265, 59, '#668EEB', '#C8ECFF', ['sidestep', 'paddle', 'matrix'], 4),
  level(6, '게걸음냥', '손가락을 읽음', '옆으로 달리며 가까우면 밀쳐내요.', ['crab', 'magnet'], 380, 235, 57, '#3DBABF', '#FFE39A', ['crab', 'windmill', 'butt'], 5),
  level(7, '깜빡냥', '규칙을 배신함', '순간이동 뒤 손의 반대편에 나타나요.', ['blink', 'mirror'], 340, 205, 54, '#68BE73', '#FFCA9E', ['flatten', 'peek', 'matrix'], 6),
  level(8, '카오스냥', '규칙을 배신함', '소용돌이와 무작위 규칙을 계속 바꿔요.', ['spiral', 'chaos'], 310, 185, 52, '#E0A43C', '#B8D7FF', ['windmill', 'taunt', 'weave', 'flatten'], 7),
  level(9, '철벽냥', '고양이가 지배함', '엉덩이로 막고 시간이 갈수록 폭주해요.', ['guard', 'rage'], 280, 165, 49, '#F2673D', '#9696AC', ['butt', 'matrix', 'paddle', 'panic'], 8, 2),
  level(10, '대마왕 하찮냥', '고양이가 지배함', '지금까지의 비겁한 기술을 전부 꺼내요.', ['overlord', 'chaos'], 245, 145, 46, '#B92235', '#4E4A5E', ['taunt', 'butt', 'windmill', 'flatten', 'weave'], 10, 4),
];

export const getLevel = (id: number) => LEVELS[Math.max(0, Math.min(LEVELS.length - 1, id - 1))];
