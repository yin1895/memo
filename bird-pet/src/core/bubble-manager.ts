/**
 * 气泡子窗口管理器
 *
 * 在主窗口中运行，负责：
 * 1. 创建/管理气泡 WebviewWindow
 * 2. 通过 Tauri 事件向气泡窗口发送消息
 * 3. 跟踪主窗口位置，保持气泡定位在宠物上方
 * 4. 通过 MessageQueue 管理消息排队
 */
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emitTo, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import type { BubbleDismissedPayload, BubbleShowPayload } from '../types';
import { MessageQueue, type BubbleMessage, type QueuedMessage } from './message-queue';

/** 气泡窗口尺寸（逻辑像素） */
const BUBBLE_WIDTH = 220;
const BUBBLE_HEIGHT = 110;
/** 气泡底部与宠物窗口顶部的重叠像素 */
const BUBBLE_OVERLAP = 4;
/** 打字机每字耗时（与 bubble-entry.ts 保持一致） */
const CHAR_INTERVAL = 40;

export class BubbleManager {
  private mainWin = getCurrentWindow();
  private bubbleWin: WebviewWindow | null = null;
  private queue: MessageQueue;

  private moveUnlisten: (() => void) | null = null;
  private dismissUnlisten: (() => void) | null = null;
  private hideTimer: number | null = null;
  private messageSeq = 0;
  private currentMessageId = '';

  constructor() {
    this.queue = new MessageQueue();
    this.queue.onPlay(msg => this.displayMessage(msg));
  }

  /**
   * 初始化气泡窗口（应用启动时调用一次）
   * 创建隐藏的 WebviewWindow，等待其内部脚本就绪。
   */
  /** 气泡就绪等待超时（毫秒） */
  static readonly READY_TIMEOUT = 10_000;

  async init(): Promise<void> {
    // 先注册 bubble:ready 监听，再创建窗口，消除竞态
    let readyResolve: (() => void) | null = null;
    const readyPromise = new Promise<void>((resolve) => {
      readyResolve = resolve;
    });
    const readyUnsubPromise = listen('bubble:ready', () => {
      readyResolve?.();
    });

    this.bubbleWin = new WebviewWindow('bubble', {
      url: '/bubble.html',
      width: BUBBLE_WIDTH,
      height: BUBBLE_HEIGHT,
      transparent: true,
      decorations: false,
      alwaysOnTop: true,
      shadow: false,
      skipTaskbar: true,
      visible: false,
      resizable: false,
      focus: false,
    });

    // 等待窗口创建完成
    await new Promise<void>((resolve, reject) => {
      this.bubbleWin!.once('tauri://created', () => resolve());
      this.bubbleWin!.once('tauri://error', (e) => reject(e));
    });

    try {
      // 等待气泡窗口内部脚本就绪（带超时保护）
      await Promise.race([
        readyPromise,
        new Promise<void>((_, reject) =>
          setTimeout(
            () => reject(new Error('bubble:ready timeout — 气泡窗口未在规定时间内就绪')),
            BubbleManager.READY_TIMEOUT,
          ),
        ),
      ]);
    } finally {
      // 无论成功/超时/异常，都释放 ready 监听器
      const readyUnsub = await readyUnsubPromise;
      readyUnsub();
    }

    // 监听主窗口移动，同步气泡位置
    this.moveUnlisten = await this.mainWin.onMoved(() => {
      this.repositionBubble();
    });

    // 监听气泡自行消失（动画结束后）
    const fn = await listen<BubbleDismissedPayload>('bubble:dismissed', (event) => {
      this.onBubbleDismissed(event.payload.messageId);
    });
    this.dismissUnlisten = fn;
  }

  /** 发送一条气泡消息 */
  say(msg: BubbleMessage): void {
    this.queue.push(msg);
  }

  /** 快捷：纯文字消息 */
  sayText(text: string, priority?: BubbleMessage['priority']): void {
    this.say({ text, priority });
  }

  /** 销毁气泡系统 */
  async dispose(): Promise<void> {
    this.queue.clear();
    this.clearHideTimer();
    this.currentMessageId = '';
    this.moveUnlisten?.();
    this.dismissUnlisten?.();
    try { await this.bubbleWin?.close(); } catch { /* 忽略 */ }
  }

  // ─── 内部方法 ───

  private async displayMessage(msg: QueuedMessage): Promise<void> {
    if (!this.bubbleWin) return;

    this.clearHideTimer();
    const messageId = `bubble-${++this.messageSeq}`;
    this.currentMessageId = messageId;

    await this.repositionBubble();
    await this.bubbleWin.show();
    const payload: BubbleShowPayload = {
      text: msg.text,
      duration: msg.duration,
      messageId,
    };
    await emitTo('bubble', 'bubble:show', payload);

    // 计算总展示时间 = 打字时间 + 持续时间 + 动画余量
    const typewriterMs = msg.text.length * CHAR_INTERVAL + 100;
    const totalMs = typewriterMs + msg.duration + 450;

    // 兜底定时器：如果 bubble:dismissed 未及时到达，自动推进队列
    this.hideTimer = setTimeout(() => {
      this.onBubbleDismissed(messageId);
    }, totalMs);
  }

  private onBubbleDismissed(messageId: string): void {
    if (!messageId || messageId !== this.currentMessageId) {
      return;
    }
    this.clearHideTimer();
    // 隐藏窗口
    this.bubbleWin?.hide().catch(() => {});
    this.currentMessageId = '';
    // 推进消息队列
    this.queue.done();
  }

  private clearHideTimer(): void {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  private async repositionBubble(): Promise<void> {
    if (!this.bubbleWin) return;
    try {
      const pos = await this.mainWin.outerPosition();
      const size = await this.mainWin.outerSize();
      const scale = await this.mainWin.scaleFactor();

      const bubblePhysW = Math.round(BUBBLE_WIDTH * scale);
      const bubblePhysH = Math.round(BUBBLE_HEIGHT * scale);

      // 水平居中于宠物窗口上方
      const x = Math.round(pos.x + (size.width - bubblePhysW) / 2);
      // 纵向紧贴宠物窗口上方（留少量重叠）
      const y = Math.round(pos.y - bubblePhysH + BUBBLE_OVERLAP * scale);

      await this.bubbleWin.setPosition(new PhysicalPosition(x, y));
    } catch (err) {
      console.error('repositionBubble failed:', err);
    }
  }
}
