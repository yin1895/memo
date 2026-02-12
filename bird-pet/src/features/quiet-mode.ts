/**
 * 低打扰智能模式
 *
 * v1.0.0 新增。
 * 根据用户偏好和当前状态动态控制提醒节奏：
 * 1. 勿扰时段：用户自定义时段内暂停所有主动气泡
 * 2. 深夜降频：23:00-6:00 自动降低打扰频率
 * 3. 会议静默：检测到会议上下文时自动静音
 * 4. 专注保护：连续编码 >30min 时降低气泡频率
 *
 * 其他模块通过调用 shouldSuppress() 判断是否抑制消息。
 */
import type { EventBus } from '../events';
import type { AppEvents } from '../types';
import type { StorageService, UserPreferences } from '../core/storage';

/** 静默原因 */
export type SuppressReason =
  | 'quiet_hours'
  | 'night_mode'
  | 'meeting'
  | 'deep_focus'
  | null;

export class QuietModeManager {
  private bus: EventBus<AppEvents>;
  private storage: StorageService;
  private preferences: UserPreferences | null = null;

  /** 当前是否处于会议 */
  private inMeeting = false;
  /** 连续编码开始时间（ms），0 表示非编码 */
  private codingStartTime = 0;
  /** 取消订阅列表 */
  private unsubscribers: (() => void)[] = [];

  /** 深夜时段 */
  private readonly NIGHT_START = 23;
  private readonly NIGHT_END = 6;
  /** 深夜降频概率倍数 */
  readonly NIGHT_ACTION_PROBABILITY = 0.10;
  /** 专注保护阈值（ms）：30 分钟 */
  private readonly DEEP_FOCUS_THRESHOLD = 30 * 60 * 1000;

  constructor(bus: EventBus<AppEvents>, storage: StorageService) {
    this.bus = bus;
    this.storage = storage;
  }

  async start(): Promise<void> {
    this.preferences = await this.storage.getPreferences();

    // 监听行为上下文变更
    this.unsubscribers.push(
      this.bus.on('context:changed', ({ to }) => {
        // 会议检测
        this.inMeeting = to === 'meeting';

        // 编码持续时间追踪
        if (to === 'coding') {
          if (this.codingStartTime === 0) {
            this.codingStartTime = Date.now();
          }
        } else {
          this.codingStartTime = 0;
        }
      }),
    );
  }

  stop(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
  }

  /**
   * 检查当前是否应该抑制主动消息
   * @returns 抑制原因（null = 不抑制）
   */
  shouldSuppress(): SuppressReason {
    const hour = new Date().getHours();

    // 1. 勿扰时段
    if (this.preferences && this.preferences.quietHoursStart >= 0) {
      const { quietHoursStart: start, quietHoursEnd: end } = this.preferences;
      if (start <= end) {
        if (hour >= start && hour < end) return 'quiet_hours';
      } else {
        // 跨午夜
        if (hour >= start || hour < end) return 'quiet_hours';
      }
    }

    // 2. 会议静默
    if (this.inMeeting) return 'meeting';

    // 3. 深夜降频（不完全屏蔽，但标记为 night_mode）
    if (this.preferences?.nightModeEnabled) {
      if (hour >= this.NIGHT_START || hour < this.NIGHT_END) {
        return 'night_mode';
      }
    }

    // 4. 专注保护（连续编码 >30min）
    if (this.codingStartTime > 0) {
      const codingDuration = Date.now() - this.codingStartTime;
      if (codingDuration > this.DEEP_FOCUS_THRESHOLD) {
        return 'deep_focus';
      }
    }

    return null;
  }

  /**
   * 是否处于深夜模式（用于降低自动动作概率）
   */
  isNightMode(): boolean {
    if (!this.preferences?.nightModeEnabled) return false;
    const hour = new Date().getHours();
    return hour >= this.NIGHT_START || hour < this.NIGHT_END;
  }

  /**
   * 是否完全静默（勿扰/会议时完全不发气泡）
   */
  isFullSilent(): boolean {
    const reason = this.shouldSuppress();
    return reason === 'quiet_hours' || reason === 'meeting';
  }

  /** 刷新偏好设置 */
  async refreshPreferences(): Promise<void> {
    this.preferences = await this.storage.getPreferences();
  }
}
