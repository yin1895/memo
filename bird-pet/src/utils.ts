import { CONFIG } from './config';

let hintEl: HTMLDivElement | null = null;
let hintTimer: number | null = null;

/** 初始化提示元素引用（在 main 中调用一次） */
export function initHint(el: HTMLDivElement): void {
  hintEl = el;
}

/** 显示短暂提示信息 */
export function showHint(text: string, ms: number = CONFIG.HINT_DURATION): void {
  if (!hintEl) return;
  if (hintTimer !== null) {
    clearTimeout(hintTimer);
    hintTimer = null;
  }
  hintEl.textContent = text;
  hintEl.classList.remove('hidden');
  hintTimer = window.setTimeout(() => {
    hintEl?.classList.add('hidden');
    hintTimer = null;
  }, ms);
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

/** 计算从认识日到今天（本地自然日）的天数差 */
export function calcDaysSinceMet(metDate: string): number {
  const met = new Date(`${metDate}T00:00:00`);
  if (Number.isNaN(met.getTime())) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - met.getTime()) / (1000 * 60 * 60 * 24)));
}

/**
 * 获取两个日期键之间的日期（开区间）
 *
 * 输入输出格式均为 YYYY-MM-DD，返回 (from, to) 之间的所有日期，不含两端。
 */
export function getDatesBetween(from: string, to: string): string[] {
  const result: string[] = [];
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    return result;
  }

  const cursor = new Date(start);
  cursor.setDate(cursor.getDate() + 1);
  while (cursor < end) {
    result.push(getLocalDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
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
