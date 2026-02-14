/**
 * 持久化存储服务
 *
 * 基于 tauri-plugin-store，将宠物状态、用户偏好等数据
 * 持久化到本地文件（pet-state.json），跨重启保留。
 */
import { LazyStore } from '@tauri-apps/plugin-store';
import { getLocalDateKey } from '../utils';

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
  /** 特殊日期当日触发记录（v0.5.0） */
  SPECIAL_DATE_TRIGGERED: 'specialDateTriggered',
  /** 宠物主人信息（v1.0.0） */
  PET_OWNER: 'petOwner',
  /** 窗口位置记忆（v1.0.0） */
  WINDOW_POSITION: 'windowPosition',
  /** 已触发的里程碑集合（v1.1.0） */
  TRIGGERED_MILESTONES: 'triggeredMilestones',
  /** 今日番茄完成数量（v1.2.0） */
  POMODORO_COUNT: 'pomodoroCount',
  /** 番茄计数所属日期 YYYY-MM-DD（v1.2.0） */
  POMODORO_DATE: 'pomodoroDate',
} as const;

/** 宠物主人信息 */
export interface PetOwnerProfile {
  /** 名字 */
  name: string;
  /** 称呼池（随机选取） */
  nicknames: string[];
  /** 认识日期 YYYY-MM-DD */
  metDate: string;
  /** 生日 MM-DD */
  birthday: string;
}

/**
 * 默认主人信息（私人项目默认值）
 *
 * 若对外发布，请在初始化流程中引导用户配置，避免把默认私有资料当作公共默认值。
 */
const DEFAULT_PET_OWNER: PetOwnerProfile = {
  name: '雨芊',
  nicknames: ['芊芊', '雨芊', '小芊', '芊宝'],
  metDate: '2026-01-20',
  birthday: '09-20',
};

/** 用户偏好结构 */
export interface UserPreferences {
  /** 是否启用整点报时 */
  hourlyChimeEnabled: boolean;
  /** 是否启用系统监控 */
  systemMonitorEnabled: boolean;
  /** 是否启用行为感知 */
  contextAwarenessEnabled: boolean;
  /** 勿扰时段开始小时（0-23），-1 表示关闭 */
  quietHoursStart: number;
  /** 勿扰时段结束小时（0-23） */
  quietHoursEnd: number;
  /** 是否启用深夜降频 */
  nightModeEnabled: boolean;
  /** 是否开机自启动 */
  autoStartEnabled: boolean;
}

/** 默认偏好 */
const DEFAULT_PREFERENCES: UserPreferences = {
  hourlyChimeEnabled: true,
  systemMonitorEnabled: true,
  contextAwarenessEnabled: true,
  quietHoursStart: -1,
  quietHoursEnd: -1,
  nightModeEnabled: true,
  autoStartEnabled: true,
};

export class StorageService {
  private store: LazyStore;
  /** incrementInteraction 串行化链，避免并发覆盖写 */
  private _interactionLock: Promise<number> = Promise.resolve(0);

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

  /** 递增交互次数（串行化，避免并发覆盖写） */
  async incrementInteraction(): Promise<number> {
    const result = this._interactionLock = this._interactionLock.then(
      async () => {
        const count = (await this.getInteractionCount()) + 1;
        await this.set(STORE_KEYS.INTERACTION_COUNT, count);
        return count;
      },
      async () => {
        // 前一个链失败不影响后续
        const count = (await this.getInteractionCount()) + 1;
        await this.set(STORE_KEYS.INTERACTION_COUNT, count);
        return count;
      },
    );
    return result;
  }

  /** 记录今日活跃 */
  async recordActivity(): Promise<void> {
    const today = getLocalDateKey();
    await this.set(STORE_KEYS.LAST_ACTIVE_DATE, today);
  }

  /** 获取用户偏好（始终与默认值合并，兼容旧版数据缺字段） */
  async getPreferences(): Promise<UserPreferences> {
    const stored = await this.get(STORE_KEYS.PREFERENCES, DEFAULT_PREFERENCES);
    return { ...DEFAULT_PREFERENCES, ...stored };
  }

  /** 更新用户偏好 */
  async setPreferences(prefs: Partial<UserPreferences>): Promise<void> {
    const current = await this.getPreferences();
    await this.set(STORE_KEYS.PREFERENCES, { ...current, ...prefs });
  }

  /** 获取宠物主人信息（始终与默认值合并，兼容旧版数据缺字段） */
  async getPetOwner(): Promise<PetOwnerProfile> {
    const stored = await this.get(STORE_KEYS.PET_OWNER, DEFAULT_PET_OWNER);
    return { ...DEFAULT_PET_OWNER, ...stored };
  }

  /** 更新宠物主人信息 */
  async setPetOwner(owner: Partial<PetOwnerProfile>): Promise<void> {
    const current = await this.getPetOwner();
    await this.set(STORE_KEYS.PET_OWNER, { ...current, ...owner });
  }

  /** 获取窗口位置 */
  async getWindowPosition(): Promise<{ x: number; y: number } | null> {
    return this.get(STORE_KEYS.WINDOW_POSITION, null);
  }

  /** 保存窗口位置 */
  async setWindowPosition(pos: { x: number; y: number }): Promise<void> {
    await this.set(STORE_KEYS.WINDOW_POSITION, pos);
  }

  /** 获取已触发的里程碑集合 */
  async getTriggeredMilestones(): Promise<string[]> {
    return this.get(STORE_KEYS.TRIGGERED_MILESTONES, []);
  }

  /** 添加已触发的里程碑 */
  async addTriggeredMilestone(key: string): Promise<void> {
    const milestones = await this.getTriggeredMilestones();
    if (!milestones.includes(key)) {
      milestones.push(key);
      await this.set(STORE_KEYS.TRIGGERED_MILESTONES, milestones);
    }
  }
}
