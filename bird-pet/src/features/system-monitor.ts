/**
 * 系统资源监控
 *
 * 周期性调用 Rust 后端获取 CPU/内存使用情况，
 * 在资源紧张时通过气泡提醒用户。
 */
import { invoke } from '@tauri-apps/api/core';
import type { BubbleManager } from '../core/bubble-manager';
import type { StorageService } from '../core/storage';

/** Rust 端 get_system_stats 返回的数据结构 */
interface SystemStats {
  cpu_usage: number;
  memory_used_gb: number;
  memory_total_gb: number;
  memory_usage_percent: number;
}

/** CPU 报警阈值（%） */
const CPU_ALERT_THRESHOLD = 85;
/** 内存报警阈值（%） */
const MEMORY_ALERT_THRESHOLD = 90;
/** 轮询间隔（毫秒）= 30 秒 */
const POLL_INTERVAL = 30 * 1000;
/** 报警冷却时间（毫秒）= 5 分钟 */
const ALERT_COOLDOWN = 5 * 60 * 1000;
/** 首次检查延迟（毫秒，留时间给 CPU 基线） */
const FIRST_CHECK_DELAY = 15 * 1000;

export class SystemMonitor {
  private bubble: BubbleManager;
  private storage: StorageService | null;
  private delayTimer: number | null = null;
  private timer: number | null = null;
  private lastAlertAt = 0;

  constructor(bubble: BubbleManager, storage?: StorageService) {
    this.bubble = bubble;
    this.storage = storage ?? null;
  }

  /** 启动系统监控轮询 */
  async start(): Promise<void> {
    // 防重入：先清理可能存在的旧定时器
    this.stop();

    if (this.storage) {
      const prefs = await this.storage.getPreferences();
      if (!prefs.systemMonitorEnabled) return;
    }
    // 首次延迟检查（让 Rust 端 CPU 基线稳定）
    this.delayTimer = window.setTimeout(() => {
      this.delayTimer = null;
      this.poll();
      this.timer = window.setInterval(() => this.poll(), POLL_INTERVAL);
    }, FIRST_CHECK_DELAY);
  }

  /** 停止监控 */
  stop(): void {
    if (this.delayTimer !== null) {
      clearTimeout(this.delayTimer);
      this.delayTimer = null;
    }
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async poll(): Promise<void> {
    try {
      const stats = await invoke<SystemStats>('get_system_stats');
      this.evaluate(stats);
    } catch (err) {
      // Rust 命令失败时静默处理，不影响用户体验
      console.warn('System stats poll failed:', err);
    }
  }

  private evaluate(stats: SystemStats): void {
    const now = Date.now();
    if (now - this.lastAlertAt < ALERT_COOLDOWN) return;

    // CPU 过高
    if (stats.cpu_usage > CPU_ALERT_THRESHOLD) {
      this.bubble.say({
        text: `电脑好努力哦！CPU ${Math.round(stats.cpu_usage)}%，要不要关些程序？🥵`,
        priority: 'low',
        duration: 4000,
      });
      this.lastAlertAt = now;
      return; // 一次只提醒一个
    }

    // 内存过高
    if (stats.memory_usage_percent > MEMORY_ALERT_THRESHOLD) {
      this.bubble.say({
        text: `内存快满啦！${stats.memory_used_gb.toFixed(1)}/${stats.memory_total_gb.toFixed(1)} GB 💾`,
        priority: 'low',
        duration: 4000,
      });
      this.lastAlertAt = now;
    }
  }
}
