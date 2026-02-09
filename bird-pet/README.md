# Bird Pet - 桌面宠物应用

一个基于 Tauri 2 开发的跨平台桌面宠物应用，使用 Canvas 实现帧动画系统，支持拖动、点击交互、右键菜单、点击穿透、独立气泡子窗口与多种“价值给予”功能。

## 🎯 核心特性

- **帧动画系统**：基于 Canvas 2D 的精灵图动画渲染
- **拖动支持**：长按 160ms 触发窗口拖动
- **点击交互**：快速点击触发随机动作（左右张望、歪头等）
- **右键菜单**：自定义上下文菜单，支持动画切换与功能开关
- **点击穿透模式**：窗口透明化，鼠标事件可穿透桌宠
- **全局快捷键**：
  - `Ctrl/Cmd + Shift + P`：切换点击穿透
  - `Ctrl/Cmd + Shift + Q`：退出应用
- **自动动作**：2.4 秒间隔，28% 概率自动播放随机动作
- **独立气泡系统**：子窗口显示对话（打字机效果 + 渐隐动画）
- **价值给予功能**：点击台词、久坐提醒、整点报时、番茄钟、系统监控
- **视觉反馈**：穿透模式下半透明+发光效果

## 🏗️ 技术栈

### 前端
- **框架**：Vite 6.x（多入口构建：主窗口 + 气泡窗口）
- **语言**：TypeScript（严格模式）
- **渲染**：Canvas 2D API
- **样式**：原生 CSS（Backdrop Filter、Transition、Transform）

### 后端
- **框架**：Tauri 2.x
- **语言**：Rust 2021 Edition
- **插件**：
  - `tauri-plugin-global-shortcut` - 全局快捷键支持
  - `tauri-plugin-process` - 进程管理（退出功能）
  - `tauri-plugin-opener` - 系统打开器
  - `tauri-plugin-updater` - 自动更新
- **系统监控**：`sysinfo` - CPU/内存指标

## 📦 项目结构

```
bird-pet/
├── src/                          # 前端源码
│   ├── main.ts                   # 应用入口（编排层）
│   ├── config.ts                 # 配置常量
│   ├── types.ts                  # 类型与事件声明
│   ├── events.ts                 # 类型安全 EventBus
│   ├── utils.ts                  # 通用工具
│   ├── style.css                 # 主窗口样式
│   ├── bubble.css                # 气泡窗口样式
│   ├── bubble-entry.ts           # 气泡子窗口入口
│   ├── core/                     # 核心模块
│   │   ├── animation.ts          # AnimationEngine
│   │   ├── click-through.ts      # ClickThroughManager
│   │   ├── interaction.ts        # 交互逻辑
│   │   ├── menu.ts               # 右键菜单（可扩展）
│   │   ├── updater.ts            # 自动更新
│   │   ├── bubble-manager.ts     # 气泡子窗口管理
│   │   └── message-queue.ts      # 消息队列
│   ├── features/                 # 价值功能模块
│   │   ├── messages.ts           # 台词库
│   │   ├── idle-care.ts          # 久坐关怀
│   │   ├── hourly-chime.ts       # 整点报时
│   │   ├── pomodoro.ts           # 番茄钟
│   │   └── system-monitor.ts     # 系统监控
│   └── assets/                   # 静态资源
├── src-tauri/                    # Rust 后端
│   ├── src/
│   │   ├── main.rs              # 应用入口 + 系统监控命令
│   │   └── lib.rs               # 库文件
│   ├── capabilities/            # Tauri 权限配置
│   │   └── default.json         # 默认权限集
│   ├── tauri.conf.json          # Tauri 配置
│   └── Cargo.toml               # Rust 依赖
├── public/
│   ├── manifest.json            # 动画配置清单
│   ├── idle_sheet.png           # 待机动画精灵图
│   ├── look_sheet.png           # 左右张望动画精灵图
│   └── tilt_sheet.png           # 歪头动画精灵图
├── bubble.html                   # 气泡窗口 HTML
├── package.json                 # Node.js 依赖
├── tsconfig.json                # TypeScript 配置
└── vite.config.ts               # Vite 配置
```

## 🎨 动画系统设计

### manifest.json 配置格式
```json
{
  "frame_size": [150, 150],      // 单帧尺寸
  "fps": 15,                      // 帧率
  "animations": {
    "idle": {
      "sheet": "idle_sheet.png",  // 精灵图路径
      "columns": 12,               // 列数
      "rows": 10,                  // 行数
      "frames": 116,               // 总帧数
      "loop": true                 // 是否循环
    }
  }
}
```

### 帧动画实现原理
1. **时间戳控制**：使用 `requestAnimationFrame` + `frameDuration` 精确控制帧率
2. **精灵图切割**：根据 `columns`、`rows` 计算每帧在精灵图上的坐标
3. **DPI 适配**：限制最大 `devicePixelRatio` 为 2x 优化性能
4. **动画锁**：非循环动画播放时锁定交互，防止冲突

## 🖱️ 交互逻辑详解

### 拖动机制
- `pointerdown` 事件启动 160ms 定时器
- 定时器触发后调用 `window.startDragging()`
- `pointerup` 时清除定时器，未拖动则触发点击动作

### 穿透模式
- 使用 Tauri API `setIgnoreCursorEvents(true)` 实现
- CSS 视觉反馈：`opacity: 0.65` + `drop-shadow` 蓝色光晕
- 右键菜单打开时临时关闭穿透，关闭后恢复

### 右键菜单
- 智能定位：固定在窗口左上角（4px padding）
- 动态内容：切换选项显示当前穿透状态（✓/🖱）
- 动态扩展：菜单项由 `MenuController` 渲染，可注入新增功能
- 防重复点击：操作时禁用所有菜单项
- 平滑动画：`opacity` + `transform: scale(0.95)` 过渡

### 气泡子窗口
- 独立 WebviewWindow：不改变主窗口大小
- 事件通信：通过 `emitTo`/`listen` 进行消息投递
- 自动定位：跟随主窗口移动，保持居中悬浮在宠物上方
- 打字机效果：逐字显示 + 渐入渐出动画

### 价值功能调度
- **点击台词**：点击宠物触发随机“元气”台词
- **久坐提醒**：30 分钟未活动自动提醒
- **整点报时**：整点自动播报
- **番茄钟**：25 分钟专注 + 5 分钟休息循环
- **系统监控**：CPU/内存过高时低优先级提示

## 🔧 配置常量

```typescript
const CONFIG = {
  DRAG_DELAY: 160,              // 拖动触发延迟（ms）
  TOGGLE_DEBOUNCE: 300,         // 穿透切换防抖（ms）
  AUTO_ACTION_INTERVAL: 2400,   // 自动动作间隔（ms）
  AUTO_ACTION_PROBABILITY: 0.28,// 自动动作概率
  HINT_DURATION: 1200,          // 提示显示时长（ms）
  MENU_PADDING: 4,              // 菜单边距（px）
  MAX_DPR: 2,                   // 最大设备像素比
};
```

## 🛡️ Tauri 权限配置

```json
{
  "permissions": [
    "core:default",
    "core:window:allow-start-dragging",
    "core:window:allow-set-ignore-cursor-events",
    "core:window:allow-close",
    "core:window:allow-show",
    "core:window:allow-hide",
    "core:window:allow-set-position",
    "core:window:allow-outer-position",
    "core:window:allow-outer-size",
    "core:window:allow-scale-factor",
    "core:webview:allow-create-webview-window",
    "process:allow-exit",
    "process:allow-restart",
    "global-shortcut:allow-register",
    "global-shortcut:allow-unregister",
    "global-shortcut:allow-unregister-all"
  ]
}
```

## 🚀 开发指南

### 环境要求
- Node.js 18+
- Rust 1.70+
- 操作系统：Windows、macOS、Linux

### 安装依赖
```bash
# 安装前端依赖
npm install

# Rust 依赖会在首次运行时自动安装
```

### 开发模式
```bash
npm run tauri dev
```

### 构建生产版本
```bash
npm run tauri build
```

### 添加新动画
1. 准备精灵图（PNG 格式，按 columns × rows 排列帧）
2. 在 `public/manifest.json` 中添加配置
3. 在 `main.ts` 的菜单项数组中添加对应菜单项
4. 重启应用即可

### 添加新台词或价值功能
1. 在 `src/features/messages.ts` 对应数组中追加台词
2. 若新增功能模块，创建 `features/xxx.ts` 并在 `main.ts` 中初始化
3. 通过 `EventBus` 订阅/触发事件减少模块间耦合

## 🎯 核心代码亮点

### 1. 时间戳驱动的帧动画系统
```typescript
function tick(ts: number) {
  const frameDuration = 1000 / manifest.fps;
  if (!lastTick) lastTick = ts;
  const dt = ts - lastTick;

  if (dt >= frameDuration) {
    lastTick = ts - (dt % frameDuration);
    // 绘制当前帧
    frame++;
    if (frame >= def.frames) {
      frame = def.loop ? 0 : frame - 1;
      actionLock = false;
    }
    drawFrame();
  }
  requestAnimationFrame(tick);
}
```

### 2. 防冲突的状态管理
```typescript
// 右键打开菜单时清除拖动定时器
canvas.addEventListener("contextmenu", async (e) => {
  e.preventDefault();
  clear(); // 清除拖动定时器
  await openMenuAt(x, y);
});
```

### 3. 气泡子窗口与队列调度
```typescript
bubble.say({ text: '嘿嘿！今天也要加油鸭！💪', priority: 'normal' });
// MessageQueue 会自动排队播放，优先级高的消息会抢占
```

## 🐛 已知问题与优化

### 已修复
- ✅ 右键与拖动定时器冲突 → 右键时清除定时器
- ✅ 穿透状态不显示 → 动态更新菜单文本
- ✅ 退出功能失效 → 添加 process 插件和权限
- ✅ 菜单项可重复点击 → 添加 disabled 状态
- ✅ 缺少错误处理 → 所有异步操作添加 try-catch

### 性能优化
- 限制最大 DPR 为 2x，避免高分屏过度绘制
- 使用 `requestAnimationFrame` 而非 `setInterval`
- 定时器统一管理和清理，防止内存泄漏
- 系统监控采用低频轮询 + 冷却时间，减少性能开销

## 📝 开发日志

### 2026-02-10
- ✨ 模块化重构（核心逻辑拆分为 core/ 与 features/）
- 💬 新增独立气泡子窗口（打字机效果 + 队列）
- 🧠 新增价值功能：点击台词、久坐提醒、整点报时、番茄钟
- 🖥️ 新增系统资源监控（CPU/内存）

### 2026-02-09
- ✨ 初始化项目结构
- 🎨 实现 Canvas 帧动画系统
- 🖱️ 添加拖动和点击交互
- 📋 实现右键上下文菜单
- 🔄 添加点击穿透功能
- ⌨️ 集成全局快捷键
- 🎭 添加穿透模式视觉反馈
- 🐛 修复退出功能和交互冲突问题
- 📦 完善权限配置和错误处理

## 📄 License

MIT

## 👨‍💻 Author

Built with ❤️ using Tauri + TypeScript
