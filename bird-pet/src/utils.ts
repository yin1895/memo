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

/** 异步加载图片，返回 Promise */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
