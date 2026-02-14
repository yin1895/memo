/** 精灵图动画定义 */
export interface AnimDef {
  sheet: string;
  columns: number;
  rows: number;
  frames: number;
  loop: boolean;
}

/** 动画清单（对应 public/manifest.json） */
export interface Manifest {
  frame_size: [number, number];
  fps: number;
  animations: Record<string, AnimDef>;
}

/** 主窗口 -> 气泡窗口显示消息载荷 */
export interface BubbleShowPayload {
  text: string;
  duration: number;
  messageId: string;
}

/** 气泡窗口 -> 主窗口消失回执载荷 */
export interface BubbleDismissedPayload {
  messageId: string;
}

// ────────────────────────────────────────
// 记忆系统数据类型（v0.4.0）
// ────────────────────────────────────────

import type { AppContext } from './features/dialogue-engine';

/** 记忆事件类型 */
export type MemoryEventType = 'interaction' | 'context_switch' | 'pomodoro_complete' | 'app_active';

/** 单条记忆事件 */
export interface MemoryEvent {
  type: MemoryEventType;
  timestamp: number;
  data?: Record<string, unknown>;
}

/** 每日汇总 */
export interface DailySummary {
  /** 日期 YYYY-MM-DD */
  date: string;
  /** 活跃小时范围 [最早, 最晚] */
  activeHours: [number, number];
  /** 当日主要行为上下文 */
  dominantContext: AppContext;
  /** 各上下文的持续时长（分钟） */
  contextDurations: Partial<Record<AppContext, number>>;
  /** 当日交互次数 */
  interactionCount: number;
  /** 当日完成的番茄数 */
  pomodoroCount: number;
}

/** 用户画像（持久化） */
export interface UserProfile {
  /** 亲密度等级原始值：累计总交互次数 */
  totalInteractions: number;
  /** 连续使用天数 */
  streakDays: number;
  /** 最后活跃日期 YYYY-MM-DD */
  lastActiveDate: string;
  /** 最近 7 天的每日汇总 */
  dailySummaries: DailySummary[];
}

/** 记忆快照（传入对话引擎的聚合数据） */
export interface MemorySnapshot {
  affinityLevel: number;
  sleepPattern: 'normal' | 'night_owl' | 'early_bird';
  dominantApp: AppContext;
  streak: number;
  workloadTrend: 'increasing' | 'stable' | 'decreasing';
}

/**
 * EventBus 事件类型映射
 *
 * 所有模块间通信事件在此集中声明，
 * 新增功能只需扩展此类型即可接入事件系统。
 */
export type AppEvents = {
  /** 用户快速点击了宠物 */
  'pet:clicked': void;
  /** 用户开始拖动宠物 */
  'pet:dragged': void;
  /** 宠物回到闲置状态 */
  'pet:idle': void;
  /** 动画开始播放 */
  'animation:play': { name: string };
  /** 非循环动画播放完毕 */
  'animation:complete': { name: string };
  /** 右键菜单打开 */
  'menu:opened': void;
  /** 右键菜单关闭 */
  'menu:closed': void;
  /** 点击穿透状态变更 */
  'clickthrough:changed': { enabled: boolean };
  /** 番茄钟状态变更 */
  'pomodoro:focus': void;
  'pomodoro:break': void;
  'pomodoro:stop': void;
  /** 行为上下文变更（v0.3.0） */
  'context:changed': { from: AppContext; to: AppContext };
  /** 记忆系统洞察事件（v0.4.0） */
  'memory:insight': { type: string; message: string };
  /** 记忆系统里程碑事件（v1.0.0） */
  'memory:milestone': { kind: string; value: number; message: string };
};
