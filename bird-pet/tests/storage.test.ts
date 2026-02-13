/**
 * StorageService 单元测试
 *
 * 覆盖 schema 迁移/兜底修复：验证 getPreferences() 和 getPetOwner()
 * 在存储数据缺少字段时自动补全默认值。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock tauri-plugin-store ───

let mockStoreData: Record<string, unknown> = {};

vi.mock('@tauri-apps/plugin-store', () => {
  class MockLazyStore {
    async get(key: string) {
      return mockStoreData[key] ?? null;
    }
    async set(key: string, value: unknown) {
      mockStoreData[key] = value;
    }
    async save() {}
  }
  return { LazyStore: MockLazyStore };
});

import { StorageService, type UserPreferences, type PetOwnerProfile } from '../src/core/storage';

describe('StorageService', () => {
  let storage: StorageService;

  beforeEach(() => {
    mockStoreData = {};
    storage = new StorageService();
  });

  describe('getPreferences - schema 兜底', () => {
    it('存储为空时返回完整默认偏好', async () => {
      const prefs = await storage.getPreferences();
      expect(prefs).toEqual({
        hourlyChimeEnabled: true,
        systemMonitorEnabled: true,
        contextAwarenessEnabled: true,
        quietHoursStart: -1,
        quietHoursEnd: -1,
        nightModeEnabled: true,
        autoStartEnabled: true,
      });
    });

    it('旧版数据缺少 nightModeEnabled/autoStartEnabled 时自动补全', async () => {
      // 模拟 v0.3.0 时代的旧数据（只有 3 个字段）
      mockStoreData['preferences'] = {
        hourlyChimeEnabled: true,
        systemMonitorEnabled: false,
        contextAwarenessEnabled: true,
      };

      const prefs = await storage.getPreferences();

      // 旧字段保持原值
      expect(prefs.hourlyChimeEnabled).toBe(true);
      expect(prefs.systemMonitorEnabled).toBe(false);
      expect(prefs.contextAwarenessEnabled).toBe(true);

      // 新字段应使用默认值
      expect(prefs.nightModeEnabled).toBe(true);
      expect(prefs.autoStartEnabled).toBe(true);
      expect(prefs.quietHoursStart).toBe(-1);
      expect(prefs.quietHoursEnd).toBe(-1);
    });

    it('用户修改的值不被默认值覆盖', async () => {
      mockStoreData['preferences'] = {
        hourlyChimeEnabled: false,
        systemMonitorEnabled: false,
        contextAwarenessEnabled: false,
        quietHoursStart: 23,
        quietHoursEnd: 7,
        nightModeEnabled: false,
        autoStartEnabled: false,
      };

      const prefs = await storage.getPreferences();
      expect(prefs.hourlyChimeEnabled).toBe(false);
      expect(prefs.nightModeEnabled).toBe(false);
      expect(prefs.autoStartEnabled).toBe(false);
      expect(prefs.quietHoursStart).toBe(23);
    });
  });

  describe('getPetOwner - schema 兜底', () => {
    it('存储为空时返回完整默认主人信息', async () => {
      const owner = await storage.getPetOwner();
      expect(owner.name).toBe('雨芊');
      expect(owner.nicknames).toEqual(['芊芊', '雨芊', '小芊', '芊宝']);
      expect(owner.metDate).toBe('2026-01-20');
      expect(owner.birthday).toBe('09-20');
    });

    it('旧版数据缺少 birthday 时自动补全', async () => {
      mockStoreData['petOwner'] = {
        name: '小明',
        nicknames: ['明明'],
        metDate: '2025-06-01',
        // 缺少 birthday
      };

      const owner = await storage.getPetOwner();
      expect(owner.name).toBe('小明');
      expect(owner.nicknames).toEqual(['明明']);
      expect(owner.birthday).toBe('09-20'); // 默认值
    });

    it('旧版数据缺少 nicknames 时自动补全（防止 undefined 访问）', async () => {
      mockStoreData['petOwner'] = {
        name: '小红',
        metDate: '2025-01-01',
        birthday: '03-15',
        // 缺少 nicknames
      };

      const owner = await storage.getPetOwner();
      expect(owner.nicknames).toEqual(['芊芊', '雨芊', '小芊', '芊宝']); // 默认值
    });
  });

  describe('setPreferences - 写入路径兼容', () => {
    it('部分更新应保留其他字段的完整性', async () => {
      // 先存入旧版不完整数据
      mockStoreData['preferences'] = {
        hourlyChimeEnabled: true,
        systemMonitorEnabled: true,
        contextAwarenessEnabled: true,
      };

      // 更新一个字段
      await storage.setPreferences({ systemMonitorEnabled: false });

      // 读回来应是完整结构
      const prefs = await storage.getPreferences();
      expect(prefs.systemMonitorEnabled).toBe(false);
      expect(prefs.nightModeEnabled).toBe(true); // 默认值被补全
      expect(prefs.autoStartEnabled).toBe(true); // 默认值被补全
    });
  });

  describe('基本读写', () => {
    it('get 对 null 值回退到 fallback', async () => {
      const count = await storage.getInteractionCount();
      expect(count).toBe(0);
    });

    it('incrementInteraction 应递增并返回新值', async () => {
      const c1 = await storage.incrementInteraction();
      expect(c1).toBe(1);
      const c2 = await storage.incrementInteraction();
      expect(c2).toBe(2);
    });
  });
});
