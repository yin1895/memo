/** 精灵图动画定义 */
export interface AnimDef {
  sheet: string;
  columns: number;
  rows: number;
  frames: number;
  loop: boolean;
}

/** 动画清单（对应 public/manifest.json） */
export interface Manifest {
  frame_size: [number, number];
  fps: number;
  animations: Record<string, AnimDef>;
}

/**
 * EventBus 事件类型映射
 *
 * 所有模块间通信事件在此集中声明，
 * 新增功能只需扩展此类型即可接入事件系统。
 */
export type AppEvents = {
  /** 用户快速点击了宠物 */
  'pet:clicked': void;
  /** 用户开始拖动宠物 */
  'pet:dragged': void;
  /** 宠物回到闲置状态 */
  'pet:idle': void;
  /** 动画开始播放 */
  'animation:play': { name: string };
  /** 非循环动画播放完毕 */
  'animation:complete': { name: string };
  /** 右键菜单打开 */
  'menu:opened': void;
  /** 右键菜单关闭 */
  'menu:closed': void;
  /** 点击穿透状态变更 */
  'clickthrough:changed': { enabled: boolean };
  /** 番茄钟状态变更 */
  'pomodoro:focus': void;
  'pomodoro:break': void;
  'pomodoro:stop': void;
  /** 行为上下文变更（v0.3.0） */
  'context:changed': { from: string; to: string };
};
