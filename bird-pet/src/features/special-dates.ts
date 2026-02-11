/**
 * 特殊日期管理器
 *
 * v0.5.0 新增。
 * 在每天首次启动时检查是否命中特殊日期（生日、情人节等），
 * 命中时触发专属台词 + 专属粒子特效。
 * 同时提供"距离下一个特殊日期还有 X 天"的倒计时信息。
 *
 * 日期配置硬编码在本文件中，保持类型安全且简单。
 */
import type { BubbleManager } from '../core/bubble-manager';
import type { DialogueEngine, DialogueScene } from './dialogue-engine';
import type { EffectsManager } from '../core/effects';
import type { StorageService } from '../core/storage';
import { STORE_KEYS } from '../core/storage';

/** 特殊日期定义 */
export interface SpecialDate {
  /** 日期名称 */
  name: string;
  /** 月份 (1-12) */
  month: number;
  /** 日 (1-31) */
  day: number;
  /** 对应的对话引擎场景 */
  scene: DialogueScene;
  /** 粒子特效类型 */
  effectType: 'confetti' | 'sunshine' | 'hearts';
  /** 是否每年重复 */
  recurring: boolean;
  /** 非重复时的具体年份 */
  year?: number;
}

/**
 * 特殊日期配置表
 *
 * ⚠️ 请根据实际情况修改日期！
 */
const SPECIAL_DATES: SpecialDate[] = [
  {
    name: '生日',
    month: 9,
    day: 20,
    scene: 'special_birthday',
    effectType: 'confetti',
    recurring: true,
  },
  {
    name: '情人节',
    month: 2,
    day: 14,
    scene: 'special_valentine',
    effectType: 'hearts',
    recurring: true,
  },
  {
    name: '圣诞节',
    month: 12,
    day: 25,
    scene: 'special_christmas',
    effectType: 'confetti',
    recurring: true,
  },
  {
    name: '新年',
    month: 1,
    day: 1,
    scene: 'special_newyear',
    effectType: 'sunshine',
    recurring: true,
  },
  {
    name: '520',
    month: 5,
    day: 20,
    scene: 'special_520',
    effectType: 'hearts',
    recurring: true,
  },
];

export class SpecialDateManager {
  private bubble: BubbleManager;
  private dialogue: DialogueEngine;
  private effects: EffectsManager;
  private storage: StorageService;

  constructor(
    bubble: BubbleManager,
    dialogue: DialogueEngine,
    effects: EffectsManager,
    storage: StorageService,
  ) {
    this.bubble = bubble;
    this.dialogue = dialogue;
    this.effects = effects;
    this.storage = storage;
  }

  /**
   * 检查今天是否是特殊日期
   *
   * 命中时：发送专属台词 + 双波粒子特效。
   * 同一天重启不会重复触发（通过 StorageService 记录）。
   * 同时检查倒计时：距下一个特殊日期 ≤ 7 天时发送预告。
   */
  async checkToday(): Promise<void> {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const year = now.getFullYear();
    const todayKey = `${year}-${month}-${day}`;

    // 检查是否已触发
    const lastTriggered = await this.storage.get<string>(
      STORE_KEYS.SPECIAL_DATE_TRIGGERED,
      '',
    );
    if (lastTriggered === todayKey) return;

    // 匹配特殊日期
    const match = SPECIAL_DATES.find((sd) => {
      if (sd.month !== month || sd.day !== day) return false;
      if (!sd.recurring && sd.year !== year) return false;
      return true;
    });

    if (match) {
      // 标记今日已触发
      await this.storage.set(STORE_KEYS.SPECIAL_DATE_TRIGGERED, todayKey);

      // 发送专属台词
      const line = this.dialogue.getLine(match.scene);
      this.bubble.say({ text: line, priority: 'high', duration: 8000 });

      // 双波粒子特效（间隔 600ms）
      setTimeout(() => {
        this.playEffect(match.effectType);
        setTimeout(() => this.playEffect(match.effectType), 600);
      }, 500);

      return; // 特殊日期当天不发倒计时
    }

    // 标记已检查（避免重复检查倒计时）
    await this.storage.set(STORE_KEYS.SPECIAL_DATE_TRIGGERED, todayKey);

    // 倒计时预告（≤ 7 天）
    const next = this.getDaysUntilNext();
    if (next && next.days > 0 && next.days <= 7) {
      setTimeout(() => {
        const countdownLines = [
          `距离${next.name}还有 ${next.days} 天！好期待呀！✨`,
          `${next.name}快到啦！还有 ${next.days} 天～ 🎉`,
          `再过 ${next.days} 天就是${next.name}了！你准备好了吗？💕`,
        ];
        const line = countdownLines[Math.floor(Math.random() * countdownLines.length)];
        this.bubble.say({ text: line, priority: 'normal', duration: 5000 });
      }, 10000); // 延迟 10 秒，避免与其他启动消息冲突
    }
  }

  /**
   * 获取距离最近一个特殊日期的天数
   * @returns 天数和日期名称，无特殊日期时返回 null
   */
  getDaysUntilNext(): { days: number; name: string } | null {
    const now = new Date();
    now.setHours(0, 0, 0, 0); // 归零到当天零点
    const year = now.getFullYear();
    let closest: { days: number; name: string } | null = null;

    for (const sd of SPECIAL_DATES) {
      if (!sd.recurring) continue;

      let nextDate = new Date(year, sd.month - 1, sd.day);
      nextDate.setHours(0, 0, 0, 0);

      // 如果今年已过，用明年
      if (nextDate.getTime() <= now.getTime()) {
        nextDate = new Date(year + 1, sd.month - 1, sd.day);
        nextDate.setHours(0, 0, 0, 0);
      }

      const diff = Math.ceil(
        (nextDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (closest === null || diff < closest.days) {
        closest = { days: diff, name: sd.name };
      }
    }

    return closest;
  }

  // ─── 内部 ───

  private playEffect(type: 'confetti' | 'sunshine' | 'hearts'): void {
    switch (type) {
      case 'confetti':
        this.effects.playConfetti();
        break;
      case 'sunshine':
        this.effects.playSunshine();
        break;
      case 'hearts':
        this.effects.playHearts();
        break;
    }
  }
}
