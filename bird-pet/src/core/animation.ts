import { CONFIG } from '../config';
import type { Manifest, AppEvents } from '../types';
import type { EventBus } from '../events';
import { loadImage } from '../utils';

/**
 * 帧动画引擎
 *
 * 封装 Canvas 2D 精灵图渲染与动画循环，
 * 通过 EventBus 通知外部动画状态变更。
 */
export class AnimationEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bus: EventBus<AppEvents>;

  private manifest!: Manifest;
  private sheets = new Map<string, HTMLImageElement>();

  private current = 'idle';
  private frame = 0;
  private lastTick = 0;
  private _actionLock = false;

  constructor(canvas: HTMLCanvasElement, bus: EventBus<AppEvents>) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true })!;
    this.bus = bus;
  }

  // ─── 公开 API ───

  /** 加载动画清单与所有精灵图 */
  async load(): Promise<void> {
    this.manifest = await fetch('/manifest.json').then(r => r.json());

    const [fw, fh] = this.manifest.frame_size;
    this.setCanvasSize(fw, fh);

    const uniqueSheets = new Set(
      Object.values(this.manifest.animations).map(a => a.sheet),
    );
    for (const sheet of uniqueSheets) {
      this.sheets.set(sheet, await loadImage('/' + sheet));
    }
  }

  /** 获取所有可用动画名称 */
  getAnimationNames(): string[] {
    return Object.keys(this.manifest.animations);
  }

  /** 当前正在播放的动画名称 */
  getCurrentAnimation(): string {
    return this.current;
  }

  /** 是否处于动作锁定（非循环动画播放期间） */
  isLocked(): boolean {
    return this._actionLock;
  }

  /** 播放指定动画，成功返回 true */
  play(name: string): boolean {
    if (!this.manifest.animations[name]) {
      console.warn(`动画不存在: ${name}`);
      return false;
    }
    this.current = name;
    this.frame = 0;
    this._actionLock = !this.manifest.animations[name].loop;
    this.bus.emit('animation:play', { name });
    return true;
  }

  /** 播放随机动作（look / tilt），锁定时返回 false */
  playRandomAction(): boolean {
    if (this._actionLock) return false;
    const action = Math.random() < 0.5 ? 'look' : 'tilt';
    return this.play(action);
  }

  /** 初始化并启动动画循环 */
  start(): void {
    this.play('idle');
    this.drawFrame();
    requestAnimationFrame(ts => this.tick(ts));
  }

  // ─── 内部方法 ───

  private setCanvasSize(w: number, h: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.MAX_DPR);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private drawFrame(): void {
    const def = this.manifest.animations[this.current];
    const img = this.sheets.get(def.sheet);
    if (!img) return;

    const [fw, fh] = this.manifest.frame_size;
    const col = this.frame % def.columns;
    const row = Math.floor(this.frame / def.columns);

    this.ctx.clearRect(0, 0, fw, fh);
    this.ctx.drawImage(img, col * fw, row * fh, fw, fh, 0, 0, fw, fh);
  }

  private tick(ts: number): void {
    const frameDuration = 1000 / this.manifest.fps;

    if (!this.lastTick) this.lastTick = ts;
    const dt = ts - this.lastTick;

    if (dt >= frameDuration) {
      this.lastTick = ts - (dt % frameDuration);

      const def = this.manifest.animations[this.current];
      this.frame++;

      if (this.frame >= def.frames) {
        if (def.loop) {
          this.frame = 0;
        } else {
          const completedName = this.current;
          this._actionLock = false;
          this.play('idle');
          this.bus.emit('animation:complete', { name: completedName });
          this.bus.emit('pet:idle');
        }
      }

      this.drawFrame();
    }

    requestAnimationFrame(t => this.tick(t));
  }
}
