export type CatPose = 'wiggle' | 'crouch' | 'leap' | 'sidestep' | 'moonwalk' | 'taunt' | 'panic' | 'tired';

export type Difficulty = {
  id: number;
  name: string;
  chapter: string;
  description: string;
  behavior: 'basic' | 'watch' | 'dodge' | 'taunt' | 'moonwalk' | 'fake' | 'wall' | 'ninja' | 'tempo' | 'clone' | 'warp' | 'boss';
  moveDelay: number;
  dodgeDelay: number;
  hitRadius: number;
  roundMs: number;
  accent: string;
  poses: CatPose[];
  hitsRequired?: number;
};

export const LEVELS: Difficulty[] = [
  { id: 1, name: '말랑냥', chapter: '아직 귀여움', description: '느릿느릿 좌우로 움직여요.', behavior: 'basic', moveDelay: 1120, dodgeDelay: 900, hitRadius: 94, roundMs: 18_000, accent: '#FFD95A', poses: ['wiggle', 'sidestep'] },
  { id: 2, name: '눈치냥', chapter: '아직 귀여움', description: '손가락 반대편을 슬쩍 봐요.', behavior: 'watch', moveDelay: 980, dodgeDelay: 760, hitRadius: 90, roundMs: 17_000, accent: '#FFC95A', poses: ['wiggle', 'crouch', 'sidestep'] },
  { id: 3, name: '약오름냥', chapter: '아직 귀여움', description: '오래 조준하면 짧게 피해요.', behavior: 'dodge', moveDelay: 880, dodgeDelay: 620, hitRadius: 86, roundMs: 16_000, accent: '#FFB35A', poses: ['wiggle', 'crouch', 'leap'] },
  { id: 4, name: '잔망냥', chapter: '아직 귀여움', description: '도발 춤 뒤 방향을 바꿔요.', behavior: 'taunt', moveDelay: 800, dodgeDelay: 560, hitRadius: 82, roundMs: 16_000, accent: '#FF9868', poses: ['taunt', 'wiggle', 'leap'] },
  { id: 5, name: '문워크냥', chapter: '슬슬 킹받음', description: '다가오는 척 뒤로 미끄러져요.', behavior: 'moonwalk', moveDelay: 730, dodgeDelay: 500, hitRadius: 79, roundMs: 15_000, accent: '#FF7E83', poses: ['moonwalk', 'wiggle', 'sidestep'] },
  { id: 6, name: '페이크냥', chapter: '슬슬 킹받음', description: '웅크린 방향과 반대로 뛰어요.', behavior: 'fake', moveDelay: 660, dodgeDelay: 450, hitRadius: 76, roundMs: 15_000, accent: '#F26E9A', poses: ['crouch', 'leap', 'panic'] },
  { id: 7, name: '벽타냥', chapter: '슬슬 킹받음', description: '벽을 차고 대각선으로 날아요.', behavior: 'wall', moveDelay: 600, dodgeDelay: 410, hitRadius: 73, roundMs: 14_000, accent: '#CB75C9', poses: ['sidestep', 'leap', 'panic'] },
  { id: 8, name: '닌자냥', chapter: '슬슬 킹받음', description: '공중에서 작아졌다 착지해요.', behavior: 'ninja', moveDelay: 540, dodgeDelay: 370, hitRadius: 70, roundMs: 14_000, accent: '#9D7BE8', poses: ['crouch', 'leap', 'sidestep'] },
  { id: 9, name: '폭주냥', chapter: '고양이가 지배함', description: '느림과 폭주를 번갈아 써요.', behavior: 'tempo', moveDelay: 490, dodgeDelay: 340, hitRadius: 68, roundMs: 13_000, accent: '#708BEF', poses: ['wiggle', 'panic', 'leap'] },
  { id: 10, name: '분신냥', chapter: '고양이가 지배함', description: '잔상 둘을 남기고 빠져나가요.', behavior: 'clone', moveDelay: 450, dodgeDelay: 315, hitRadius: 66, roundMs: 13_000, accent: '#4EA9DF', poses: ['sidestep', 'panic', 'moonwalk'] },
  { id: 11, name: '시공냥', chapter: '고양이가 지배함', description: '포획 원 주변의 공간을 흔들어요.', behavior: 'warp', moveDelay: 420, dodgeDelay: 290, hitRadius: 64, roundMs: 12_000, accent: '#45BEB2', poses: ['crouch', 'panic', 'leap', 'taunt'] },
  { id: 12, name: '대마왕냥', chapter: '고양이가 지배함', description: '세 번 잡아야 왕관을 내려놔요.', behavior: 'boss', moveDelay: 390, dodgeDelay: 265, hitRadius: 62, roundMs: 12_000, accent: '#FF6757', poses: ['taunt', 'moonwalk', 'leap', 'panic'], hitsRequired: 3 },
];

export const getLevel = (id: number) => LEVELS[Math.max(0, Math.min(LEVELS.length - 1, id - 1))];
