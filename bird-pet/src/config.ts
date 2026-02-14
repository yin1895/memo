/** 全局配置常量 */
export const CONFIG = {
  /** 长按多久触发拖动（毫秒） */
  DRAG_DELAY: 160,
  /** 穿透切换防抖时间（毫秒） */
  TOGGLE_DEBOUNCE: 300,
  /** 自动动作触发间隔（毫秒） */
  AUTO_ACTION_INTERVAL: 2400,
  /** 自动动作触发概率 */
  AUTO_ACTION_PROBABILITY: 0.28,
  /** 提示显示时长（毫秒） */
  HINT_DURATION: 1200,
  /** 菜单边距（像素） */
  MENU_PADDING: 4,
  /** 最大设备像素比（优化性能） */
  MAX_DPR: 2,
} as const;

/** 平台检测 */
const platformHint =
  (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
  navigator.userAgent;
export const IS_MAC = /mac/i.test(platformHint);
export const MODIFIER_KEY = IS_MAC ? '⌘' : 'Ctrl';
