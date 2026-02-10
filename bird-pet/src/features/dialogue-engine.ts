/**
 * 对话引擎
 *
 * 替代原有的 randomLine() 分散调用，提供统一的、
 * 基于上下文条件匹配的台词选取系统。
 *
 * 核心流程：
 * 1. 各模块传入场景类型 + 当前上下文
 * 2. 引擎从 DIALOGUE_ENTRIES 中筛选匹配条目
 * 3. 在匹配结果中随机选取一条台词返回
 * 4. 无匹配时回退到通用台词池
 */

/** 用户行为上下文类型 */
export type AppContext =
  | 'coding'
  | 'browsing'
  | 'gaming'
  | 'music'
  | 'meeting'
  | 'idle'
  | 'unknown';

/** 对话场景标识 */
export type DialogueScene =
  | 'click'
  | 'idle_care'
  | 'hourly'
  | 'affirmation'
  | 'pomodoro_start'
  | 'pomodoro_break'
  | 'pomodoro_resume'
  | 'context_coding'
  | 'context_browsing'
  | 'context_gaming'
  | 'context_music'
  | 'context_meeting'
  | 'context_idle';

/** 对话条件 */
export interface DialogueCondition {
  /** 小时范围 [start, end)，如 [22, 6] 表示深夜 */
  hourRange?: [number, number];
  /** 需要匹配的行为上下文 */
  appContext?: AppContext;
}

/** 对话条目 */
export interface DialogueEntry {
  /** 场景标识 */
  scene: DialogueScene;
  /** 台词列表 */
  lines: string[];
  /** 可选的附加条件 */
  conditions?: DialogueCondition;
  /** 优先级（默认 normal） */
  priority?: 'high' | 'normal' | 'low';
}

/** 当前对话上下文（传入引擎的运行时信息） */
export interface DialogueContext {
  /** 当前小时（0-23） */
  hour: number;
  /** 当前行为上下文 */
  appContext: AppContext;
}

/** 最近台词去重队列容量 */
const RECENT_LINES_CAPACITY = 10;

/**
 * 对话引擎主类
 *
 * v0.4.0: 新增台词去重机制，最近 10 条不重复。
 */
export class DialogueEngine {
  private entries: DialogueEntry[];
  /** 最近使用的台词队列（FIFO），用于去重 */
  private recentLines: string[] = [];

  constructor(entries: DialogueEntry[]) {
    this.entries = entries;
  }

  /**
   * 获取指定场景下的一条台词（带去重）
   *
   * @param scene - 对话场景
   * @param ctx   - 当前运行时上下文（可选，不传则只按场景匹配）
   * @returns 随机选取的台词
   */
  getLine(scene: DialogueScene, ctx?: Partial<DialogueContext>): string {
    // 筛选匹配该场景的条目
    const candidates = this.entries.filter((e) => {
      if (e.scene !== scene) return false;
      if (!e.conditions || !ctx) return true;
      return this.matchConditions(e.conditions, ctx);
    });

    // 有匹配 → 随机取；无匹配 → 从同场景无条件的条目中取
    const pool =
      candidates.length > 0
        ? candidates
        : this.entries.filter((e) => e.scene === scene && !e.conditions);

    if (pool.length === 0) return '啾啾！'; // 兜底

    // 汇总所有台词
    const allLines = pool.flatMap((e) => e.lines);
    return this.pickWithDedup(allLines);
  }

  /**
   * 根据当前行为上下文获取对应的 context_* 场景台词（带去重）
   */
  getContextLine(appContext: AppContext): string | null {
    const sceneMap: Record<string, DialogueScene> = {
      coding: 'context_coding',
      browsing: 'context_browsing',
      gaming: 'context_gaming',
      music: 'context_music',
      meeting: 'context_meeting',
      idle: 'context_idle',
    };
    const scene = sceneMap[appContext];
    if (!scene) return null;

    const entries = this.entries.filter((e) => e.scene === scene);
    if (entries.length === 0) return null;

    const allLines = entries.flatMap((e) => e.lines);
    return this.pickWithDedup(allLines);
  }

  /** 检查条件是否满足 */
  private matchConditions(
    cond: DialogueCondition,
    ctx: Partial<DialogueContext>,
  ): boolean {
    if (cond.hourRange && ctx.hour !== undefined) {
      const [start, end] = cond.hourRange;
      if (start <= end) {
        if (ctx.hour < start || ctx.hour >= end) return false;
      } else {
        // 跨午夜，如 [22, 6)
        if (ctx.hour < start && ctx.hour >= end) return false;
      }
    }
    if (cond.appContext && ctx.appContext) {
      if (cond.appContext !== ctx.appContext) return false;
    }
    return true;
  }

  /**
   * 从候选台词中去重选取
   *
   * 优先排除最近使用过的台词；若全部用过则回退到完整池。
   */
  private pickWithDedup(allLines: string[]): string {
    // 过滤掉最近说过的台词
    const fresh = allLines.filter((l) => !this.recentLines.includes(l));
    // 若过滤后池非空则取 fresh，否则回退到全量（避免台词 <= 10 条时死循环）
    const pickPool = fresh.length > 0 ? fresh : allLines;
    const line = pickPool[Math.floor(Math.random() * pickPool.length)];

    // 推入去重队列
    this.recentLines.push(line);
    if (this.recentLines.length > RECENT_LINES_CAPACITY) {
      this.recentLines.shift();
    }
    return line;
  }
}
