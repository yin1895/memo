// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type EventMap = {};
type Listener<T> = (data: T) => void;

/**
 * 类型安全的事件总线
 *
 * 用于模块间松耦合通信，所有模块通过事件而非直接调用来协作，
 * 方便后续新增功能模块无侵入地接入。
 *
 * @example
 * ```ts
 * const bus = new EventBus<AppEvents>();
 * const unsub = bus.on('pet:clicked', () => console.log('clicked!'));
 * bus.emit('pet:clicked');
 * unsub(); // 取消订阅
 * ```
 */
export class EventBus<Events extends EventMap> {
  private listeners = new Map<keyof Events, Set<Listener<never>>>();

  /** 订阅事件，返回取消订阅函数 */
  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as Listener<never>);
    return () => this.off(event, listener);
  }

  /** 触发事件（void 事件无需传参） */
  emit<K extends keyof Events>(
    event: K,
    ...args: Events[K] extends void ? [] : [Events[K]]
  ): void {
    const data = args[0] as Events[K];
    this.listeners.get(event)?.forEach(fn => (fn as Listener<Events[K]>)(data));
  }

  /** 取消订阅 */
  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    this.listeners.get(event)?.delete(listener as Listener<never>);
  }

  /** 一次性订阅：触发一次后自动取消 */
  once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    const wrapper = ((data: Events[K]) => {
      this.off(event, wrapper as Listener<Events[K]>);
      listener(data);
    }) as Listener<Events[K]>;
    return this.on(event, wrapper);
  }

  /** 销毁总线，清除所有监听器 */
  dispose(): void {
    this.listeners.clear();
  }
}
