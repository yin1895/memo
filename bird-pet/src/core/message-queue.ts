/**
 * 消息队列
 *
 * 管理气泡消息的排队与优先级：
 * - high: 立即播放（打断当前）
 * - normal: 按序排队
 * - low: 队列满时丢弃
 */

export type MessagePriority = 'low' | 'normal' | 'high';

export interface BubbleMessage {
  /** 气泡显示文本 */
  text: string;
  /** 打字完成后持续展示时长（毫秒），默认 3000 */
  duration?: number;
  /** 优先级，默认 normal */
  priority?: MessagePriority;
}

export interface QueuedMessage {
  text: string;
  duration: number;
  priority: MessagePriority;
}

const PRIORITY_WEIGHT: Record<MessagePriority, number> = {
  high: 3,
  normal: 2,
  low: 1,
};

const MAX_QUEUE_SIZE = 5;
const DEFAULT_DURATION = 3000;

type PlayHandler = (msg: QueuedMessage) => Promise<void>;

export class MessageQueue {
  private queue: QueuedMessage[] = [];
  private _playing = false;
  private playHandler: PlayHandler | null = null;

  /** 是否正在播放消息 */
  get playing(): boolean {
    return this._playing;
  }

  /** 设置消息播放回调 */
  onPlay(handler: PlayHandler): void {
    this.playHandler = handler;
  }

  /** 添加消息 */
  push(msg: BubbleMessage): void {
    const priority = msg.priority ?? 'normal';
    const duration = msg.duration ?? DEFAULT_DURATION;
    const queued: QueuedMessage = { text: msg.text, duration, priority };

    // 高优先级：立即播放
    if (priority === 'high') {
      this.queue.unshift(queued);
      if (this._playing) {
        this.forceNext();
        return;
      }
    } else {
      // 低优先级且队列已满 → 丢弃
      if (this.queue.length >= MAX_QUEUE_SIZE && priority === 'low') {
        return;
      }
      this.queue.push(queued);
    }

    if (!this._playing) {
      this.playNext();
    }
  }

  /** 当前消息播放完毕，推进队列 */
  done(): void {
    this._playing = false;
    this.playNext();
  }

  /** 清空队列 */
  clear(): void {
    this.queue = [];
    this._playing = false;
  }

  // ─── 内部 ───

  private async playNext(): Promise<void> {
    if (this._playing || this.queue.length === 0) return;

    // 按优先级排序
    this.queue.sort((a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]);

    const msg = this.queue.shift()!;
    this._playing = true;

    try {
      await this.playHandler?.(msg);
    } catch (err) {
      console.error('MessageQueue playHandler error:', err);
      this._playing = false;
      this.playNext();
    }
  }

  private async forceNext(): Promise<void> {
    this._playing = true;
    // 按优先级排序后取第一个
    this.queue.sort((a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]);
    const msg = this.queue.shift();
    if (!msg) {
      this._playing = false;
      return;
    }
    try {
      await this.playHandler?.(msg);
    } catch (err) {
      console.error('MessageQueue forcePlay error:', err);
      this._playing = false;
      this.playNext();
    }
  }
}
