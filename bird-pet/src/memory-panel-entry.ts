/**
 * 回忆面板子窗口入口
 *
 * 监听主窗口发来的面板数据事件，渲染亲密度进度、
 * 统计数字、7 天热力图和洞察列表。
 */
import './memory-panel.css';
import { listen, emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { AFFINITY_THRESHOLDS } from './constants';
import { getLocalDateKey } from './utils';

/** 主窗口发来的面板数据结构 */
interface PanelData {
  affinityLevel: number;
  affinityLabel: string;
  totalInteractions: number;
  nextAffinityAt: number;
  streak: number;
  daysSinceMet: number;
  sleepPattern: string;
  dominantApp: string;
  workloadTrend: string;
  /** 最近 7 天汇总，按日期升序，可能不足 7 条 */
  dailySummaries: Array<{
    date: string;
    interactionCount: number;
    pomodoroCount: number;
    dominantContext: string;
    activeHours: [number, number];
  }>;
  totalPomodoros: number;
}

/** 作息模式中文 */
const SLEEP_LABELS: Record<string, string> = {
  normal: '作息规律 🌙',
  night_owl: '夜猫子型 🦉',
  early_bird: '早起鸟儿 🌅',
};

/** 行为上下文中文 */
const CONTEXT_LABELS: Record<string, string> = {
  coding: '编程 💻',
  browsing: '浏览网页 🌐',
  gaming: '打游戏 🎮',
  music: '听音乐 🎵',
  meeting: '开会 📞',
  idle: '休息 ☕',
  unknown: '其他',
};

/** 工作量趋势中文 */
const TREND_LABELS: Record<string, string> = {
  increasing: '最近越来越活跃 📈',
  stable: '互动频率稳定 📊',
  decreasing: '最近有点冷落小鸟 📉',
};

function renderPanel(data: PanelData): void {
  // ─── 亲密度 ───
  const affinityLabel = document.getElementById('affinity-label')!;
  const affinityHearts = document.getElementById('affinity-hearts')!;
  const affinityBar = document.getElementById('affinity-bar')! as HTMLDivElement;
  const affinityText = document.getElementById('affinity-progress-text')!;

  affinityLabel.textContent = `Lv.${data.affinityLevel} ${data.affinityLabel}`;
  affinityHearts.textContent = '❤️'.repeat(data.affinityLevel) + '🤍'.repeat(4 - data.affinityLevel);

  // 计算进度条
  const tier = AFFINITY_THRESHOLDS.find(t => t.level === data.affinityLevel)!;
  if (tier.next === Infinity) {
    affinityBar.style.width = '100%';
    affinityText.textContent = '已达到最高亲密度！';
  } else {
    const progress = ((data.totalInteractions - tier.min) / (tier.next - tier.min)) * 100;
    affinityBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    affinityText.textContent = `${data.totalInteractions} / ${tier.next} 次互动`;
  }

  // ─── 统计 ───
  document.getElementById('stat-streak')!.textContent = String(data.streak);
  document.getElementById('stat-met-days')!.textContent = String(data.daysSinceMet);
  document.getElementById('stat-interactions')!.textContent = String(data.totalInteractions);
  document.getElementById('stat-pomodoros')!.textContent = String(data.totalPomodoros);

  // ─── 7 天热力图 ───
  const heatmap = document.getElementById('heatmap')!;
  heatmap.innerHTML = '';

  // 生成最近 7 天日期（本地时区，与记忆系统一致）
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(getLocalDateKey(d));
  }

  const summaryMap = new Map(data.dailySummaries.map(s => [s.date, s]));
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  for (const dateStr of days) {
    const summary = summaryMap.get(dateStr);
    const count = summary?.interactionCount ?? 0;
    const level = count === 0 ? 0 : count < 10 ? 1 : count < 30 ? 2 : 3;

    const dayEl = document.createElement('div');
    dayEl.className = `heatmap-day level-${level}`;

    const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay();
    dayEl.innerHTML = `
      <span class="day-label">周${weekDays[dayOfWeek]}</span>
      <span class="day-count">${count}</span>
    `;
    heatmap.appendChild(dayEl);
  }

  // ─── 洞察 ───
  const insights = document.getElementById('insights')!;
  insights.innerHTML = '';

  const insightItems: string[] = [];

  // 作息
  insightItems.push(`作息模式：${SLEEP_LABELS[data.sleepPattern] ?? '暂无数据'}`);
  // 主要行为
  insightItems.push(`最常做的事：${CONTEXT_LABELS[data.dominantApp] ?? data.dominantApp}`);
  // 工作量趋势
  insightItems.push(TREND_LABELS[data.workloadTrend] ?? '互动频率稳定 📊');
  // 连续天数
  if (data.streak >= 7) {
    insightItems.push(`🔥 已连续陪伴 ${data.streak} 天，真棒！`);
  }

  for (const text of insightItems) {
    const el = document.createElement('div');
    el.className = 'insight-item';
    el.textContent = text;
    insights.appendChild(el);
  }
}

// ─── 入口 ───
async function init(): Promise<void> {
  // 监听主窗口发来的数据
  listen<PanelData>('memory-panel:show', (event) => {
    renderPanel(event.payload);
  });

  // 点击标题栏区域可拖动（可选）
  const header = document.querySelector('.panel-header');
  if (header) {
    header.addEventListener('mousedown', async () => {
      try {
        await getCurrentWindow().startDragging();
      } catch { /* ignore */ }
    });
  }

  // 通知主窗口：面板脚本已就绪
  await emit('memory-panel:ready');
}

init();
