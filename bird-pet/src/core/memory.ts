/**
 * 记忆系统
 *
 * v0.4.0 新增核心模块。
 * 采集用户行为事件，持久化到本地存储（7 天滚动窗口），
 * 并在应用启动时汇总昨日数据、分析用户模式，
 * 为对话引擎提供 MemorySnapshot 以驱动反思性对话。
 *
 * 隐私：所有数据仅存储在本地 pet-state.json，不会上传。
 */
import type { EventBus } from '../events';
import type {
  AppEvents,
  MemoryEvent,
  DailySummary,
  UserProfile,
  MemorySnapshot,
} from '../types';
import type { AppContext } from '../features/dialogue-engine';
import { StorageService, STORE_KEYS } from './storage';
import { getLocalDateKey } from '../utils';

/** 滚动窗口天数 */
const ROLLING_WINDOW_DAYS = 7;

/** 默认用户画像 */
const DEFAULT_PROFILE: UserProfile = {
  totalInteractions: 0,
  streakDays: 0,
  lastActiveDate: '',
  dailySummaries: [],
};

/**
 * 亲密度等级阈值
 * 0-49 → 1(陌生), 50-199 → 2(熟悉), 200-499 → 3(亲密), 500+ → 4(挚友)
 */
const AFFINITY_THRESHOLDS = [
  { min: 500, level: 4 },
  { min: 200, level: 3 },
  { min: 50, level: 2 },
  { min: 0, level: 1 },
];

export class MemorySystem {
  private bus: EventBus<AppEvents>;
  private storage: StorageService;
  private events: MemoryEvent[] = [];
  private profile: UserProfile = { ...DEFAULT_PROFILE };
  private unsubscribers: (() => void)[] = [];

  constructor(bus: EventBus<AppEvents>, storage: StorageService) {
    this.bus = bus;
    this.storage = storage;
  }

  // ─── 生命周期 ───

  /** 启动：加载数据、注册事件监听、汇总昨日 */
  async start(): Promise<void> {
    // 加载持久化数据
    this.events = await this.storage.get<MemoryEvent[]>(
      STORE_KEYS.MEMORY_EVENTS,
      [],
    );
    this.profile = await this.storage.get<UserProfile>(
      STORE_KEYS.USER_PROFILE,
      { ...DEFAULT_PROFILE },
    );

    // 执行日终汇总（检查是否跨天）
    this.summarizeDay();

    // 发送启动时洞察
    this.emitStartupInsights();

    // 注册事件监听
    this.unsubscribers.push(
      this.bus.on('pet:clicked', () => this.recordEvent({ type: 'interaction', timestamp: Date.now() })),
      this.bus.on('pet:dragged', () => this.recordEvent({ type: 'interaction', timestamp: Date.now() })),
      this.bus.on('context:changed', ({ from, to }) =>
        this.recordEvent({
          type: 'context_switch',
          timestamp: Date.now(),
          data: { from, to },
        }),
      ),
      this.bus.on('pomodoro:break', () =>
        this.recordEvent({ type: 'pomodoro_complete', timestamp: Date.now() }),
      ),
    );
  }

  /** 持久化并清理过期数据 */
  async save(): Promise<void> {
    this.pruneOldEvents();
    await this.storage.set(STORE_KEYS.MEMORY_EVENTS, this.events);
    await this.storage.set(STORE_KEYS.USER_PROFILE, this.profile);
  }

  /** 停止：解除事件监听 */
  stop(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
  }

  // ─── 模式分析 API ───

  /**
   * 获取亲密度等级
   * 1=陌生, 2=熟悉, 3=亲密, 4=挚友
   */
  getAffinityLevel(): number {
    const total = this.profile.totalInteractions;
    for (const t of AFFINITY_THRESHOLDS) {
      if (total >= t.min) return t.level;
    }
    return 1;
  }

  /**
   * 获取作息模式
   * 分析最近 3 天的末次活跃小时，超 2/3 在 23 点后 → night_owl
   */
  getSleepPattern(): 'normal' | 'night_owl' | 'early_bird' {
    const recent = this.profile.dailySummaries.slice(-3);
    if (recent.length < 2) return 'normal';

    let lateNightCount = 0;
    let earlyBirdCount = 0;

    for (const day of recent) {
      const latestHour = day.activeHours[1];
      if (latestHour >= 23 || latestHour <= 2) lateNightCount++;
      if (day.activeHours[0] <= 6 && day.activeHours[0] > 0) earlyBirdCount++;
    }

    const threshold = recent.length * (2 / 3);
    if (lateNightCount >= threshold) return 'night_owl';
    if (earlyBirdCount >= threshold) return 'early_bird';
    return 'normal';
  }

  /** 获取最近 7 天中占比最高的行为上下文 */
  getDominantApp(): AppContext {
    const totals: Partial<Record<AppContext, number>> = {};
    for (const day of this.profile.dailySummaries) {
      for (const [ctx, mins] of Object.entries(day.contextDurations)) {
        const key = ctx as AppContext;
        totals[key] = (totals[key] ?? 0) + (mins as number);
      }
    }
    let max = 0;
    let dominant: AppContext = 'idle';
    for (const [ctx, total] of Object.entries(totals)) {
      if (total! > max) {
        max = total!;
        dominant = ctx as AppContext;
      }
    }
    return dominant;
  }

  /** 获取连续使用天数 */
  getStreak(): number {
    return this.profile.streakDays;
  }

  /**
   * 获取工作量趋势
   * 比较最近 3 天 vs 前 4 天的平均交互量
   */
  getWorkloadTrend(): 'increasing' | 'stable' | 'decreasing' {
    const summaries = this.profile.dailySummaries;
    if (summaries.length < 4) return 'stable';

    const recent3 = summaries.slice(-3);
    const prev = summaries.slice(0, -3);

    const avgRecent =
      recent3.reduce((s, d) => s + d.interactionCount, 0) / recent3.length;
    const avgPrev =
      prev.reduce((s, d) => s + d.interactionCount, 0) / prev.length;

    const ratio = avgPrev > 0 ? avgRecent / avgPrev : 1;
    if (ratio > 1.3) return 'increasing';
    if (ratio < 0.7) return 'decreasing';
    return 'stable';
  }

  /** 聚合记忆快照（供对话引擎使用） */
  getSnapshot(): MemorySnapshot {
    return {
      affinityLevel: this.getAffinityLevel(),
      sleepPattern: this.getSleepPattern(),
      dominantApp: this.getDominantApp(),
      streak: this.getStreak(),
      workloadTrend: this.getWorkloadTrend(),
    };
  }

  /** 获取用户画像（只读） */
  getProfile(): Readonly<UserProfile> {
    return this.profile;
  }

  // ─── 内部方法 ───

  /**
   * 应用启动时发送洞察事件
   * 延迟 5 秒执行，避免与启动动画冲突
   */
  private emitStartupInsights(): void {
    window.setTimeout(() => {
      const streak = this.getStreak();
      const sleepPattern = this.getSleepPattern();

      // 连续天数洞察
      if (streak >= 3) {
        this.bus.emit('memory:insight', {
          type: 'streak',
          message: `连续使用 ${streak} 天`,
        });
        return; // 每次启动只发一条洞察，避免气泡轰炸
      }

      // 作息模式洞察
      if (sleepPattern === 'night_owl') {
        this.bus.emit('memory:insight', {
          type: 'sleep',
          message: '最近经常熬夜',
        });
        return;
      }

      if (sleepPattern === 'early_bird') {
        this.bus.emit('memory:insight', {
          type: 'sleep',
          message: '最近起得很早',
        });
        return;
      }
    }, 5000);
  }

  /** 记录一条事件 */
  private recordEvent(event: MemoryEvent): void {
    this.events.push(event);

    // 交互事件同时更新 totalInteractions
    if (event.type === 'interaction') {
      this.profile.totalInteractions++;
    }
  }

  /**
   * 日终汇总
   *
   * 如果 profile.lastActiveDate 不是今天，
   * 将昨日的原始事件汇总为 DailySummary，
   * 更新连续天数，然后标记今天为活跃日。
   */
  private summarizeDay(): void {
    const today = getLocalDateKey();

    if (this.profile.lastActiveDate === today) return; // 今天已汇总

    const yesterday = this.profile.lastActiveDate;

    if (yesterday) {
      // 汇总昨日事件
      const yesterdayEvents = this.events.filter((e) => {
        const d = getLocalDateKey(new Date(e.timestamp));
        return d === yesterday;
      });

      if (yesterdayEvents.length > 0) {
        const summary = this.buildDailySummary(yesterday, yesterdayEvents);
        this.profile.dailySummaries.push(summary);

        // 保持最多 ROLLING_WINDOW_DAYS 条
        if (this.profile.dailySummaries.length > ROLLING_WINDOW_DAYS) {
          this.profile.dailySummaries =
            this.profile.dailySummaries.slice(-ROLLING_WINDOW_DAYS);
        }
      }

      // 更新连续天数
      const yesterdayDate = new Date(yesterday);
      const todayDate = new Date(today);
      const diffMs = todayDate.getTime() - yesterdayDate.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        this.profile.streakDays++;
      } else {
        this.profile.streakDays = 1;
      }
    } else {
      // 首次使用
      this.profile.streakDays = 1;
    }

    this.profile.lastActiveDate = today;
  }

  /** 从事件列表构建每日汇总 */
  private buildDailySummary(
    date: string,
    events: MemoryEvent[],
  ): DailySummary {
    const hours = events.map((e) => new Date(e.timestamp).getHours());
    const minHour = Math.min(...hours);
    const maxHour = Math.max(...hours);

    const interactions = events.filter((e) => e.type === 'interaction').length;
    const pomodoros = events.filter(
      (e) => e.type === 'pomodoro_complete',
    ).length;

    // 统计上下文持续时长（简化：按切换次数估算每段 15 分钟）
    const contextDurations: Partial<Record<AppContext, number>> = {};
    const contextSwitches = events.filter(
      (e) => e.type === 'context_switch' && e.data?.to,
    );
    for (const ev of contextSwitches) {
      const ctx = ev.data!.to as AppContext;
      contextDurations[ctx] = (contextDurations[ctx] ?? 0) + 15;
    }

    // 确定主要上下文
    let dominant: AppContext = 'idle';
    let maxDuration = 0;
    for (const [ctx, dur] of Object.entries(contextDurations)) {
      if (dur! > maxDuration) {
        maxDuration = dur!;
        dominant = ctx as AppContext;
      }
    }

    return {
      date,
      activeHours: [minHour, maxHour],
      dominantContext: dominant,
      contextDurations,
      interactionCount: interactions,
      pomodoroCount: pomodoros,
    };
  }

  /** 清理超过 7 天的原始事件 */
  private pruneOldEvents(): void {
    const cutoff = Date.now() - ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    this.events = this.events.filter((e) => e.timestamp >= cutoff);
  }
}
