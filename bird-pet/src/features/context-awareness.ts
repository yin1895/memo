/**
 * 行为感知模块
 *
 * 定期检测当前活跃窗口（通过 Rust 后端），
 * 判断用户正在做什么（编码/浏览/游戏/音乐/会议/闲置），
 * 并在上下文切换时通过气泡发送对应的场景台词。
 *
 * 设计要点：
 * - 15 秒轮询间隔（性能友好）
 * - 5 分钟台词冷却（防止频繁切换窗口导致的气泡轰炸）
 * - 上下文切换时通过 EventBus 广播，其他模块可响应
 */
import { invoke } from '@tauri-apps/api/core';
import type { EventBus } from '../events';
import type { AppEvents } from '../types';
import type { BubbleManager } from '../core/bubble-manager';
import type { DialogueEngine, AppContext } from './dialogue-engine';

/** 活跃窗口信息（来自 Rust 后端） */
interface ActiveWindowInfo {
  app_name: string;
  title: string;
}

/** 轮询间隔（毫秒）= 15 秒 */
const POLL_INTERVAL = 15_000;
/** 台词冷却时间（毫秒）= 5 分钟 */
const LINE_COOLDOWN = 5 * 60 * 1000;

/**
 * 应用识别规则
 * key: AppContext, value: 匹配的应用名关键词（不区分大小写）
 */
const APP_RULES: Record<Exclude<AppContext, 'unknown'>, RegExp> = {
  coding: /code|visual studio|intellij|idea|webstorm|pycharm|sublime|vim|neovim|nvim|android studio|rider|clion|goland|cursor|windsurf/i,
  browsing: /chrome|firefox|edge|safari|brave|opera|vivaldi|arc|msedge/i,
  gaming: /steam|epic|riot|league|genshin|原神|valorant|minecraft|roblox|unity|unreal|bluestacks|遊戲|游戏/i,
  music: /spotify|网易云|cloudmusic|qqmusic|qq音乐|foobar|musicbee|aimp|apple music|itunes|酷狗|酷我/i,
  meeting: /zoom|teams|腾讯会议|wemeet|飞书|feishu|钉钉|dingtalk|slack|discord|webex|skype/i,
  idle: /explorer|桌面|desktop/i,
};

export class ContextAwareness {
  private bus: EventBus<AppEvents>;
  private bubble: BubbleManager;
  private dialogue: DialogueEngine;

  private timer: number | null = null;
  private _currentContext: AppContext = 'unknown';
  private lastLineTime = 0;

  /** 当前识别到的行为上下文 */
  get currentContext(): AppContext {
    return this._currentContext;
  }

  constructor(
    bus: EventBus<AppEvents>,
    bubble: BubbleManager,
    dialogue: DialogueEngine,
  ) {
    this.bus = bus;
    this.bubble = bubble;
    this.dialogue = dialogue;
  }

  /** 启动行为感知 */
  start(): void {
    // 立即执行一次检测
    this.poll();
    // 定时轮询
    this.timer = window.setInterval(() => this.poll(), POLL_INTERVAL);
  }

  /** 停止行为感知 */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** 销毁（停止 + 清理引用） */
  destroy(): void {
    this.stop();
  }

  // ─── 内部 ───

  private async poll(): Promise<void> {
    try {
      const info = await invoke<ActiveWindowInfo | null>('get_active_window_info');
      if (!info) return;

      const newContext = this.classify(info);

      // 上下文发生变化
      if (newContext !== this._currentContext && newContext !== 'unknown') {
        const oldContext = this._currentContext;
        this._currentContext = newContext;

        // 广播上下文变更事件
        this.bus.emit('context:changed', { from: oldContext, to: newContext });

        // 冷却检查：距上次台词 ≥ 5 分钟才说话
        const now = Date.now();
        if (now - this.lastLineTime >= LINE_COOLDOWN) {
          const line = this.dialogue.getContextLine(newContext);
          if (line) {
            this.bubble.say({ text: line, priority: 'low', duration: 4000 });
            this.lastLineTime = now;
          }
        }
      }
    } catch {
      // 获取活跃窗口失败（如权限问题），静默忽略
    }
  }

  /** 根据窗口信息分类用户行为 */
  private classify(info: ActiveWindowInfo): AppContext {
    const target = `${info.app_name} ${info.title}`;

    // 按优先级匹配（meeting > gaming > music > coding > browsing > idle）
    if (APP_RULES.meeting.test(target)) return 'meeting';
    if (APP_RULES.gaming.test(target)) return 'gaming';
    if (APP_RULES.music.test(target)) return 'music';
    if (APP_RULES.coding.test(target)) return 'coding';
    if (APP_RULES.browsing.test(target)) return 'browsing';
    if (APP_RULES.idle.test(target)) return 'idle';

    return 'unknown';
  }
}
