/**
 * CSS 粒子特效管理器
 *
 * 在 Canvas 精灵动画上方叠加轻量的 CSS 粒子效果，
 * 丰富宠物的情感表达（心形、星星、音符、Zzz 等）。
 *
 * 设计要点：
 * - 粒子使用绝对定位的 span 元素 + CSS @keyframes
 * - 动画结束自动移除 DOM 节点（零残留）
 * - pointer-events: none 不阻碍鼠标交互
 * - 窗口 150×150，粒子数量控制在 3-5 个
 */

/** 特效类型 */
export type EffectType = 'hearts' | 'sparks' | 'notes' | 'zzz' | 'bounce' | 'confetti' | 'sunshine';

/** 特效配置 */
interface EffectConfig {
  /** 粒子内容（emoji 或字符） */
  chars: string[];
  /** CSS 动画类名 */
  animClass: string;
  /** 粒子数量 */
  count: number;
  /** 动画时长（ms） */
  duration: number;
}

const EFFECT_CONFIGS: Record<EffectType, EffectConfig> = {
  hearts: {
    chars: ['❤️', '💕', '💖', '💗'],
    animClass: 'fx-float-up',
    count: 4,
    duration: 1200,
  },
  sparks: {
    chars: ['✨', '⭐', '🌟', '💫'],
    animClass: 'fx-sparkle',
    count: 5,
    duration: 1000,
  },
  notes: {
    chars: ['🎵', '🎶', '♪', '♫'],
    animClass: 'fx-note-sway',
    count: 3,
    duration: 1500,
  },
  zzz: {
    chars: ['💤', 'Z', 'z'],
    animClass: 'fx-zzz-float',
    count: 3,
    duration: 1800,
  },
  bounce: {
    chars: ['🔥', '⚡', '💪'],
    animClass: 'fx-bounce',
    count: 3,
    duration: 800,
  },
  confetti: {
    chars: ['🎊', '🎉', '✨', '🎈', '💫'],
    animClass: 'fx-confetti',
    count: 5,
    duration: 1500,
  },
  sunshine: {
    chars: ['🌻', '☀️', '🌞', '✨'],
    animClass: 'fx-sunshine',
    count: 4,
    duration: 1400,
  },
};

export class EffectsManager {
  private container: HTMLDivElement;

  constructor() {
    // 查找或创建特效层
    let el = document.getElementById('effects') as HTMLDivElement | null;
    if (!el) {
      el = document.createElement('div');
      el.id = 'effects';
      el.className = 'effects-layer';
      document.getElementById('app')?.appendChild(el);
    }
    this.container = el;
  }

  /** 播放心形飘升特效（点击宠物） */
  playHearts(): void {
    this.spawn('hearts');
  }

  /** 播放星星闪烁特效（番茄钟/惊喜） */
  playSparks(): void {
    this.spawn('sparks');
  }

  /** 播放音符飘动特效（音乐场景） */
  playNotes(): void {
    this.spawn('notes');
  }

  /** 播放 Zzz 飘升特效（久坐/闲置） */
  playZzz(): void {
    this.spawn('zzz');
  }

  /** 播放弹跳特效（番茄钟开始） */
  playBounce(): void {
    this.spawn('bounce');
  }

  /** 播放彩纸特效（纪念日/生日） */
  playConfetti(): void {
    this.spawn('confetti');
  }

  /** 播放阳光特效（小太阳致敬） */
  playSunshine(): void {
    this.spawn('sunshine');
  }

  /** 根据行为上下文播放对应特效 */
  playForContext(context: string): void {
    switch (context) {
      case 'music':
        this.playNotes();
        break;
      case 'gaming':
        this.playSparks();
        break;
      case 'coding':
        this.playSparks();
        break;
      default:
        break;
    }
  }

  // ─── 内部 ───

  private spawn(type: EffectType): void {
    const config = EFFECT_CONFIGS[type];
    const { chars, animClass, count, duration } = config;

    for (let i = 0; i < count; i++) {
      const span = document.createElement('span');
      span.className = `fx-particle ${animClass}`;
      span.textContent = chars[Math.floor(Math.random() * chars.length)];

      // 随机位置（在 150×150 窗口内偏移）
      const x = 20 + Math.random() * 110; // 20-130px
      const y = 10 + Math.random() * 60;  // 10-70px（偏上方）
      span.style.left = `${x}px`;
      span.style.top = `${y}px`;

      // 随机延迟（错开粒子出现时间）
      span.style.animationDelay = `${i * (duration / count / 2)}ms`;
      span.style.animationDuration = `${duration}ms`;

      this.container.appendChild(span);

      // 兜底移除（防止 animationend 未触发）
      const fallbackTimer = setTimeout(() => span.remove(), duration + 500);
      // 动画结束后自动移除，并清理兜底定时器
      span.addEventListener('animationend', () => {
        clearTimeout(fallbackTimer);
        span.remove();
      }, { once: true });
    }
  }
}
