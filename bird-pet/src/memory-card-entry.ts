/**
 * 回忆卡片子窗口入口
 *
 * v1.0.0 新增。
 * 接收来自主窗口的回忆数据，渲染为卡片样式。
 * 自动 8 秒后渐隐关闭，或可点击关闭按钮。
 */
import './memory-card.css';
import { listen, emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

/** 回忆卡片数据 */
interface MemoryCardData {
  /** 连续使用天数 */
  streak: number;
  /** 距离认识日天数 */
  daysSinceMet: number;
  /** 总交互次数 */
  totalInteractions: number;
  /** 亲密度等级名称 */
  affinityName: string;
  /** 亲密度等级 1-4 */
  affinityLevel: number;
  /** 昨日主要行为 */
  yesterdayContext: string;
  /** 昨日交互次数 */
  yesterdayInteractions: number;
  /** 里程碑消息（可为空） */
  milestone: string;
  /** 主人称呼 */
  nickname: string;
}

const AFFINITY_EMOJIS: Record<number, string> = {
  1: '🌱',
  2: '🌿',
  3: '💕',
  4: '💖',
};

const CONTEXT_NAMES: Record<string, string> = {
  coding: '写代码 💻',
  browsing: '冲浪 🌐',
  gaming: '玩游戏 🎮',
  music: '听音乐 🎵',
  meeting: '开会 📋',
  idle: '放松 ☁️',
  unknown: '各种事 ✨',
};

function renderCard(data: MemoryCardData): void {
  const card = document.getElementById('memory-card')!;
  const mainStat = document.getElementById('card-main-stat')!;
  const details = document.getElementById('card-details')!;
  const milestoneEl = document.getElementById('card-milestone')!;

  // 主统计
  mainStat.innerHTML = `
    <div class="stat-row stat-hero">
      <span class="stat-emoji">📅</span>
      <span class="stat-text">认识 <strong>${data.daysSinceMet}</strong> 天 · 连续 <strong>${data.streak}</strong> 天</span>
    </div>
    <div class="stat-row">
      <span class="stat-emoji">${AFFINITY_EMOJIS[data.affinityLevel] || '🌱'}</span>
      <span class="stat-text">亲密度：${data.affinityName}</span>
    </div>
  `;

  // 昨日详情
  const contextName = CONTEXT_NAMES[data.yesterdayContext] || data.yesterdayContext;
  details.innerHTML = `
    <div class="detail-label">昨日回顾</div>
    <div class="detail-row">
      <span>互动 ${data.yesterdayInteractions} 次 · 主要在${contextName}</span>
    </div>
    <div class="detail-row">
      <span>总共互动了 ${data.totalInteractions} 次 ✨</span>
    </div>
  `;

  // 里程碑
  if (data.milestone) {
    milestoneEl.innerHTML = `<div class="milestone-text">🏆 ${data.milestone}</div>`;
    milestoneEl.style.display = 'block';
  } else {
    milestoneEl.style.display = 'none';
  }

  // 显示
  card.classList.remove('card-hidden');
  card.classList.add('card-visible');

  // 8 秒后自动关闭
  setTimeout(closeCard, 8000);
}

function closeCard(): void {
  const card = document.getElementById('memory-card')!;
  card.classList.remove('card-visible');
  card.classList.add('card-fadeout');
  setTimeout(async () => {
    await getCurrentWindow().hide();
  }, 500);
}

// 初始化
document.getElementById('card-close')?.addEventListener('click', closeCard);

// 等待主窗口发送数据
listen<MemoryCardData>('memory-card:show', (event) => {
  renderCard(event.payload);
});

// 通知主窗口已就绪（使用全局 emit，确保主窗口的全局 listen 能接收到）
emit('memory-card:ready');
