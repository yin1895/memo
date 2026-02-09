# Bird Pet - 桌面宠物应用

一个基于 Tauri 2 开发的跨平台桌面宠物应用，使用 Canvas 实现帧动画系统，支持拖动、点击交互、右键菜单、点击穿透等功能。

## 🎯 核心特性

- **帧动画系统**：基于 Canvas 2D 的精灵图动画渲染
- **拖动支持**：长按 160ms 触发窗口拖动
- **点击交互**：快速点击触发随机动作（左右张望、歪头等）
- **右键菜单**：自定义上下文菜单，支持动画切换和功能操作
- **点击穿透模式**：窗口透明化，鼠标事件可穿透桌宠
- **全局快捷键**：
  - `Ctrl/Cmd + Shift + P`：切换点击穿透
  - `Ctrl/Cmd + Shift + Q`：退出应用
- **自动动作**：2.4 秒间隔，28% 概率自动播放随机动作
- **视觉反馈**：穿透模式下半透明+发光效果

## 🏗️ 技术栈

### 前端
- **框架**：Vite 6.4.1
- **语言**：TypeScript 5.6.2（严格模式）
- **渲染**：Canvas 2D API
- **样式**：原生 CSS（Backdrop Filter、Transition、Transform）

### 后端
- **框架**：Tauri 2.10.0
- **语言**：Rust 2021 Edition
- **插件**：
  - `tauri-plugin-global-shortcut` - 全局快捷键支持
  - `tauri-plugin-process` - 进程管理（退出功能）
  - `tauri-plugin-opener` - 系统打开器

## 📦 项目结构

```
bird-pet/
├── src/                          # 前端源码
│   ├── main.ts                   # 主逻辑（动画、交互、菜单）
│   ├── style.css                 # 样式（菜单、穿透效果）
│   └── assets/                   # 静态资源
├── src-tauri/                    # Rust 后端
│   ├── src/
│   │   ├── main.rs              # 应用入口
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
- 智能定位：限制在窗口边界内（4px padding）
- 动态内容：切换选项显示当前穿透状态（✓/🖱）
- 防重复点击：操作时禁用所有菜单项
- 平滑动画：`opacity` + `transform: scale(0.95)` 过渡

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
    "process:allow-exit",
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
1. 准备精灵图（PNG 格式，按照 columns × rows 排列帧）
2. 在 `public/manifest.json` 中添加配置
3. 在 `main.ts` 的菜单 HTML 中添加菜单项
4. 重启应用即可

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

### 3. 智能菜单定位算法
```typescript
const mw = Math.min(menu.offsetWidth || 0, rect.width - PADDING * 2);
const px = clamp(x, PADDING, Math.max(PADDING, rect.width - mw - PADDING));
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

## 📝 开发日志

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
