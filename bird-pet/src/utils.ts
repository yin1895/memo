import { CONFIG } from './config';

let hintEl: HTMLDivElement | null = null;

/** 初始化提示元素引用（在 main 中调用一次） */
export function initHint(el: HTMLDivElement): void {
  hintEl = el;
}

/** 显示短暂提示信息 */
export function showHint(text: string, ms: number = CONFIG.HINT_DURATION): void {
  if (!hintEl) return;
  hintEl.textContent = text;
  hintEl.classList.remove('hidden');
  window.setTimeout(() => hintEl?.classList.add('hidden'), ms);
}

/**
 * 获取本地时区日期 key
 *
 * 返回格式：YYYY-MM-DD（零填充，本地时区）。
 * 用于所有"按用户视角的自然天"做判断的场景（首次启动、活跃记录、特殊日期等）。
 *
 * @param date - 可选，默认当前时间
 */
export function getLocalDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 异步加载图片，返回 Promise */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
