import type { CatBehavior, CatPose } from './levels';

export type BehaviorGuide = { label: string; hint: string; pose: CatPose };

export const BEHAVIOR_GUIDES: Record<CatBehavior, BehaviorGuide> = {
  patrol: { label: '천천히 순찰', hint: '진로 앞을 막아', pose: 'wiggle' },
  watch: { label: '손끝 관찰', hint: '방향을 짧게 바꿔', pose: 'peek' },
  dodge: { label: '반사 회피', hint: '피한 뒤를 따라가', pose: 'paddle' },
  zigzag: { label: '지그재그', hint: '꺾일 곳을 선점', pose: 'weave' },
  moonwalk: { label: '되감기', hint: '돌아올 자리를 노려', pose: 'moonwalk' },
  fake: { label: '반대로', hint: '첫 방향은 미끼', pose: 'crouch' },
  wall: { label: '벽 타기', hint: '가운데서 기다려', pose: 'leap' },
  orbit: { label: '원 그리기', hint: '원 안쪽을 짧게', pose: 'windmill' },
  tempo: { label: '엇박자', hint: '멈춘 박자에 진입', pose: 'flatten' },
  clone: { label: '잔상 남기기', hint: '가운데가 진짜', pose: 'sidestep' },
  predict: { label: '다음 손 읽기', hint: '급하게 방향 전환', pose: 'matrix' },
  magnet: { label: '밀고 당기기', hint: '끌릴 때 파고들어', pose: 'paddle' },
  crab: { label: '옆걸음', hint: '가로 진로를 막아', pose: 'crab' },
  blink: { label: '순간이동', hint: '나타난 직후가 빈틈', pose: 'peek' },
  mirror: { label: '반대편', hint: '건너편을 먼저 봐', pose: 'matrix' },
  spiral: { label: '소용돌이', hint: '중앙으로 좁혀가', pose: 'windmill' },
  chaos: { label: '마음대로', hint: '전환 직후를 노려', pose: 'taunt' },
  guard: { label: '엉덩이 방어', hint: '엉덩이 말고 머리', pose: 'butt' },
  rage: { label: '점점 빠르게', hint: '초반에 끝내야 해', pose: 'panic' },
  overlord: { label: '전부 다', hint: '전환 직후가 기회', pose: 'taunt' },
};

export function phaseStepsFor(moveDelay: number) {
  return Math.max(3, Math.min(9, Math.round(2100 / moveDelay)));
}
