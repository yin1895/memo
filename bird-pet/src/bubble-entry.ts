/**
 * 气泡子窗口入口脚本
 *
 * 运行在独立的 WebviewWindow 中，通过 Tauri 事件接收来自主窗口的消息，
 * 负责渲染文字（打字机效果）和动画。
 */
import './bubble.css';
import { listen, emit } from '@tauri-apps/api/event';

/** 来自主窗口的显示消息载荷 */
interface BubbleShowPayload {
  text: string;
  duration: number;
}

const bubble = document.getElementById('bubble')!;
const textEl = document.getElementById('bubble-text')!;

/** 每字打字间隔（毫秒） */
const CHAR_INTERVAL = 40;

let typewriterTimer: number | null = null;
let hideTimer: number | null = null;

function clearTimers(): void {
  if (typewriterTimer !== null) {
    clearInterval(typewriterTimer);
    typewriterTimer = null;
  }
  if (hideTimer !== null) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function showBubble(text: string, duration: number): void {
  clearTimers();

  // 重置状态
  textEl.textContent = '';
  bubble.classList.remove('bubble-hidden', 'bubble-fadeout');
  bubble.classList.add('bubble-fadein');

  // 打字机效果：逐字显示
  let idx = 0;
  typewriterTimer = window.setInterval(() => {
    if (idx < text.length) {
      textEl.textContent += text[idx];
      idx++;
    } else {
      if (typewriterTimer !== null) clearInterval(typewriterTimer);
      typewriterTimer = null;
      // 打字完成后等待 duration 再消失
      hideTimer = window.setTimeout(() => hideBubble(), duration);
    }
  }, CHAR_INTERVAL);
}

function hideBubble(): void {
  clearTimers();
  bubble.classList.remove('bubble-fadein');
  bubble.classList.add('bubble-fadeout');
  // 等淡出动画完成后隐藏
  setTimeout(() => {
    bubble.classList.add('bubble-hidden');
    // 通知主窗口气泡已消失
    emit('bubble:dismissed');
  }, 350);
}

// ─── 事件监听 ───

listen<BubbleShowPayload>('bubble:show', (event) => {
  showBubble(event.payload.text, event.payload.duration);
});

listen('bubble:hide', () => {
  hideBubble();
});

// 通知主窗口：气泡窗口已就绪
emit('bubble:ready');
