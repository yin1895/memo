/** 亲密度等级中文名 */
export const AFFINITY_NAMES: Record<number, string> = {
  1: '初识',
  2: '熟悉',
  3: '亲密',
  4: '挚友',
};

/** 亲密度阈值（按等级升序） */
export const AFFINITY_THRESHOLDS = [
  { level: 1, min: 0, next: 50 },
  { level: 2, min: 50, next: 200 },
  { level: 3, min: 200, next: 500 },
  { level: 4, min: 500, next: Infinity },
] as const;
