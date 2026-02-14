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
 *
 * v0.4.0: 新增台词去重、记忆条件匹配、模板变量替换。
 */

import type { MemorySnapshot } from '../types';

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
  | 'context_idle'
  // v0.4.0: 反思性对话场景
  | 'reflective_sleep'
  | 'reflective_streak'
  | 'reflective_affinity'
  | 'reflective_app_habit'
  // v0.5.0: 特殊日期场景
  | 'special_birthday'
  | 'special_valentine'
  | 'special_christmas'
  | 'special_newyear'
  | 'special_520'
  // v1.0.0: 认识纪念日
  | 'special_anniversary'
  // v0.5.0: 时段问候场景
  | 'greeting_morning'
  | 'greeting_noon'
  | 'greeting_evening'
  | 'greeting_night'
  | 'greeting_latenight';

/** 对话条件（v0.4.0 扩展记忆相关字段） */
export interface DialogueCondition {
  /** 小时范围 [start, end)，如 [22, 6] 表示深夜 */
  hourRange?: [number, number];
  /** 需要匹配的行为上下文 */
  appContext?: AppContext;
  /** 匹配亲密度等级（>= 此值） */
  affinityLevel?: number;
  /** 匹配作息模式 */
  sleepPattern?: 'night_owl' | 'early_bird';
  /** 匹配连续天数（>= min） */
  streak?: { min: number };
  /** 匹配主要使用的应用上下文 */
  dominantApp?: AppContext;
}

/** 对话条目 */
export interface DialogueEntry {
  /** 场景标识 */
  scene: DialogueScene;
  /** 台词列表（支持 {key} 模板变量） */
  lines: string[];
  /** 可选的附加条件 */
  conditions?: DialogueCondition;
  /** 优先级（默认 normal） */
  priority?: 'high' | 'normal' | 'low';
}

/** 当前对话上下文（传入引擎的运行时信息，v0.4.0 扩展了记忆快照字段） */
export interface DialogueContext extends Partial<MemorySnapshot> {
  /** 当前小时（0-23） */
  hour: number;
  /** 当前行为上下文 */
  appContext: AppContext;
}

/** 最近台词去重队列容量 */
const RECENT_LINES_CAPACITY = 10;

/** 全局模板变量（在初始化时注入，台词中的 {nickname} / {name} / {daysSinceMet} 等会被替换） */
export interface GlobalTemplateVars {
  /** 主人名字 */
  name: string;
  /** 随机称呼（每次调用时从池中随机取） */
  nickname: string;
  /** 称呼池 */
  nicknames: string[];
  /** 认识日期 */
  metDate: string;
  /** 距离认识日的天数 */
  daysSinceMet: number;
}

/**
 * 对话引擎主类
 *
 * v0.4.0: 新增台词去重机制，最近 10 条不重复。
 */
export class DialogueEngine {
  private entries: DialogueEntry[];
  /** 最近使用的台词队列（FIFO），用于去重 */
  private recentLines: string[] = [];
  /** 全局模板变量 */
  private globalVars: GlobalTemplateVars | null = null;

  constructor(entries: DialogueEntry[]) {
    this.entries = entries;
  }

  /**
   * 设置全局模板变量（主人信息）
   * 应在应用启动时调用一次
   */
  setGlobalVars(vars: GlobalTemplateVars): void {
    this.globalVars = vars;
  }

  /**
   * 获取指定场景下的一条台词（带去重 + 模板替换）
   *
   * @param scene - 对话场景
   * @param ctx   - 当前运行时上下文（可选，不传则只按场景匹配）
   * @returns 随机选取的台词（已替换模板变量）
   */
  getLine(scene: DialogueScene, ctx?: Partial<DialogueContext>): string {
    // 筛选匹配该场景的条目
    const candidates = this.entries.filter((e) => {
      if (e.scene !== scene) return false;
      // 无条件条目始终匹配
      if (!e.conditions) return true;
      // 有条件但调用方未传上下文 → 排除，防止条件约束被悄悄绕过
      if (!ctx) return false;
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
    const line = this.pickWithDedup(allLines);
    return this.applyTemplate(line, ctx);
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
    return this.applyTemplate(this.pickWithDedup(allLines));
  }

  /** 检查条件是否满足（v0.4.0 扩展记忆条件） */
  private matchConditions(
    cond: DialogueCondition,
    ctx: Partial<DialogueContext>,
  ): boolean {
    // 小时范围
    if (cond.hourRange && ctx.hour !== undefined) {
      const [start, end] = cond.hourRange;
      if (start <= end) {
        if (ctx.hour < start || ctx.hour >= end) return false;
      } else {
        // 跨午夜，如 [22, 6)
        if (ctx.hour < start && ctx.hour >= end) return false;
      }
    }
    // 行为上下文
    if (cond.appContext && ctx.appContext) {
      if (cond.appContext !== ctx.appContext) return false;
    }
    // 亲密度等级
    if (cond.affinityLevel !== undefined && ctx.affinityLevel !== undefined) {
      if (ctx.affinityLevel < cond.affinityLevel) return false;
    }
    // 作息模式
    if (cond.sleepPattern && ctx.sleepPattern) {
      if (ctx.sleepPattern !== cond.sleepPattern) return false;
    }
    // 连续天数
    if (cond.streak && ctx.streak !== undefined) {
      if (ctx.streak < cond.streak.min) return false;
    }
    // 主要应用偏好
    if (cond.dominantApp && ctx.dominantApp) {
      if (ctx.dominantApp !== cond.dominantApp) return false;
    }
    return true;
  }

  /**
   * 简单模板变量替换
   * 将 {key} 占位符替换为 ctx 中的同名字段值，
   * 并注入全局模板变量（nickname 每次随机取）
   */
  private applyTemplate(
    line: string,
    ctx?: Partial<DialogueContext>,
  ): string {
    // 构建合并的变量池
    const vars: Record<string, unknown> = {};

    // 全局变量（主人信息）
    if (this.globalVars) {
      vars.name = this.globalVars.name;
      // 每次随机从称呼池取
      vars.nickname = this.globalVars.nicknames[
        Math.floor(Math.random() * this.globalVars.nicknames.length)
      ];
      vars.daysSinceMet = this.globalVars.daysSinceMet;
      vars.metDate = this.globalVars.metDate;
    }

    // 上下文变量（覆盖全局）
    if (ctx) {
      for (const [k, v] of Object.entries(ctx)) {
        if (v !== undefined && v !== null) vars[k] = v;
      }
    }

    return line.replace(/\{(\w+)\}/g, (match, key) => {
      const val = vars[key];
      return val !== undefined && val !== null ? String(val) : match;
    });
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
