/**
 * 持久化存储服务
 *
 * 基于 tauri-plugin-store，将宠物状态、用户偏好等数据
 * 持久化到本地文件（pet-state.json），跨重启保留。
 */
import { LazyStore } from '@tauri-apps/plugin-store';

/** 存储文件名 */
const STORE_FILE = 'pet-state.json';

/** 预定义的存储 key */
export const STORE_KEYS = {
  /** 总交互次数（点击 + 拖拽） */
  INTERACTION_COUNT: 'interactionCount',
  /** 最后活跃日期（YYYY-MM-DD） */
  LAST_ACTIVE_DATE: 'lastActiveDate',
  /** 功能开关偏好 */
  PREFERENCES: 'preferences',
  /** 记忆事件原始日志（v0.4.0） */
  MEMORY_EVENTS: 'memoryEvents',
  /** 用户画像（v0.4.0） */
  USER_PROFILE: 'userProfile',
} as const;

/** 用户偏好结构 */
export interface UserPreferences {
  /** 是否启用整点报时 */
  hourlyChimeEnabled: boolean;
  /** 是否启用系统监控 */
  systemMonitorEnabled: boolean;
  /** 是否启用行为感知 */
  contextAwarenessEnabled: boolean;
}

/** 默认偏好 */
const DEFAULT_PREFERENCES: UserPreferences = {
  hourlyChimeEnabled: true,
  systemMonitorEnabled: true,
  contextAwarenessEnabled: true,
};

export class StorageService {
  private store: LazyStore;

  constructor() {
    this.store = new LazyStore(STORE_FILE);
  }

  /** 读取指定 key 的值 */
  async get<T>(key: string, fallback: T): Promise<T> {
    try {
      const val = await this.store.get<T>(key);
      return val ?? fallback;
    } catch {
      return fallback;
    }
  }

  /** 写入值（不会立即持久化，由自动保存机制处理） */
  async set(key: string, value: unknown): Promise<void> {
    await this.store.set(key, value);
  }

  /** 手动持久化 */
  async save(): Promise<void> {
    await this.store.save();
  }

  // ─── 便捷方法 ───

  /** 获取总交互次数 */
  async getInteractionCount(): Promise<number> {
    return this.get(STORE_KEYS.INTERACTION_COUNT, 0);
  }

  /** 递增交互次数 */
  async incrementInteraction(): Promise<number> {
    const count = (await this.getInteractionCount()) + 1;
    await this.set(STORE_KEYS.INTERACTION_COUNT, count);
    return count;
  }

  /** 记录今日活跃 */
  async recordActivity(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    await this.set(STORE_KEYS.LAST_ACTIVE_DATE, today);
  }

  /** 获取用户偏好 */
  async getPreferences(): Promise<UserPreferences> {
    return this.get(STORE_KEYS.PREFERENCES, DEFAULT_PREFERENCES);
  }

  /** 更新用户偏好 */
  async setPreferences(prefs: Partial<UserPreferences>): Promise<void> {
    const current = await this.getPreferences();
    await this.set(STORE_KEYS.PREFERENCES, { ...current, ...prefs });
  }
}
