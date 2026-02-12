/**
 * 闲置关怀调度器
 *
 * 跟踪用户在电脑前的活动状态：
 * - 久坐提醒：每 30 分钟提醒一次伸展
 * - 低频正能量/反思性对话：长时间闲置时偶尔鼓励或回忆
 *
 * v0.4.0: 集成记忆系统，正能量触发时有 50% 概率改为反思性对话。
 */
import type { AppEvents, MemorySnapshot } from '../types';
import type { EventBus } from '../events';
import type { BubbleManager } from '../core/bubble-manager';
import type { DialogueEngine, DialogueScene } from './dialogue-engine';
import type { MemorySystem } from '../core/memory';
import type { QuietModeManager } from './quiet-mode';

/** 久坐提醒间隔（毫秒）= 30 分钟 */
const SEDENTARY_INTERVAL = 30 * 60 * 1000;
/** 正能量触发间隔（毫秒）= 2 小时 */
const AFFIRMATION_INTERVAL = 2 * 60 * 60 * 1000;
/** 正能量触发概率 */
const AFFIRMATION_PROBABILITY = 0.6;
/** 反思性对话概率（在正能量触发后） */
const REFLECTIVE_PROBABILITY = 0.5;
/** 深夜降频后的正能量概率 */
const NIGHT_AFFIRMATION_PROBABILITY = 0.15;

/** 反思性对话场景列表 */
const REFLECTIVE_SCENES: DialogueScene[] = [
  'reflective_sleep',
  'reflective_streak',
  'reflective_affinity',
  'reflective_app_habit',
];

export class IdleCareScheduler {
  private bus: EventBus<AppEvents>;
  private bubble: BubbleManager;
  private dialogue: DialogueEngine;
  private memory: MemorySystem;
  private quietMode: QuietModeManager | null;

  private sedentaryTimer: number | null = null;
  private affirmationTimer: number | null = null;
  private lastActivity = Date.now();
  /** 深夜关怀：每晚最多触发一次 */
  private deepNightCaredTonight = false;

  constructor(
    bus: EventBus<AppEvents>,
    bubble: BubbleManager,
    dialogue: DialogueEngine,
    memory: MemorySystem,
    quietMode?: QuietModeManager,
  ) {
    this.bus = bus;
    this.bubble = bubble;
    this.dialogue = dialogue;
    this.memory = memory;
    this.quietMode = quietMode ?? null;
  }

  /** 启动调度 */
  start(): void {
    // 监听用户活动事件，重置计时
    this.bus.on('pet:clicked', () => this.recordActivity());
    this.bus.on('pet:dragged', () => this.recordActivity());
    this.bus.on('menu:opened', () => this.recordActivity());

    // 久坐提醒定时器
    this.sedentaryTimer = window.setInterval(() => {
      // 完全静默时跳过久坐提醒
      if (this.quietMode?.isFullSilent()) return;

      const elapsed = Date.now() - this.lastActivity;
      if (elapsed >= SEDENTARY_INTERVAL) {
        this.bubble.say({
          text: this.dialogue.getLine('idle_care'),
          priority: 'normal',
          duration: 5000,
        });
        // 提醒后重置，避免连续触发
        this.lastActivity = Date.now();
      }
    }, 60 * 1000); // 每分钟检查一次

    // 正能量 / 反思性对话定时器
    this.affirmationTimer = window.setInterval(() => {
      // 完全静默时跳过
      if (this.quietMode?.isFullSilent()) return;

      // 深夜模式：降低触发概率
      const probability = this.quietMode?.isNightMode()
        ? NIGHT_AFFIRMATION_PROBABILITY
        : AFFIRMATION_PROBABILITY;

      // 深夜关怀：午夜后用户仍在线，发一次温柔提醒
      if (this.quietMode?.isNightMode()) {
        const hour = new Date().getHours();
        if (hour >= 0 && hour < 5 && !this.deepNightCaredTonight) {
          this.deepNightCaredTonight = true;
          this.bubble.say({
            text: this.dialogue.getLine('greeting_latenight'),
            priority: 'normal',
            duration: 6000,
          });
          return;
        }
      } else {
        // 不在深夜，重置标记（为下次午夜准备）
        this.deepNightCaredTonight = false;
      }

      // 专注保护时完全跳过
      if (this.quietMode?.shouldSuppress() === 'deep_focus') return;

      if (Math.random() < probability) {
        if (Math.random() < REFLECTIVE_PROBABILITY) {
          this.tryReflectiveDialogue();
        } else {
          this.bubble.say({
            text: this.dialogue.getLine('affirmation'),
            priority: 'low',
            duration: 5000,
          });
        }
      }
    }, AFFIRMATION_INTERVAL);
  }

  /** 停止调度 */
  stop(): void {
    if (this.sedentaryTimer !== null) {
      clearInterval(this.sedentaryTimer);
      this.sedentaryTimer = null;
    }
    if (this.affirmationTimer !== null) {
      clearInterval(this.affirmationTimer);
      this.affirmationTimer = null;
    }
  }

  private recordActivity(): void {
    this.lastActivity = Date.now();
  }

  /**
   * 尝试从反思性场景中选取一条有意义的台词
   * 如果所有反思场景都无匹配，回退到普通正能量
   */
  private tryReflectiveDialogue(): void {
    const snapshot: Partial<MemorySnapshot> = this.memory.getSnapshot();
    const ctx = { hour: new Date().getHours(), ...snapshot };

    // 随机打乱场景顺序，尝试找到一个有匹配的场景
    const shuffled = [...REFLECTIVE_SCENES].sort(() => Math.random() - 0.5);

    for (const scene of shuffled) {
      const line = this.dialogue.getLine(scene, ctx);
      if (line !== '啾啾！') {
        // 成功匹配到反思性台词
        this.bubble.say({ text: line, priority: 'low', duration: 6000 });
        return;
      }
    }

    // 无匹配 → 回退到普通正能量
    this.bubble.say({
      text: this.dialogue.getLine('affirmation'),
      priority: 'low',
      duration: 5000,
    });
  }
}
