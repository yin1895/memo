import "./style.css";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import { exit } from "@tauri-apps/plugin-process";

// 配置常量
const CONFIG = {
  DRAG_DELAY: 160,              // 长按多久触发拖动（毫秒）
  TOGGLE_DEBOUNCE: 300,         // 穿透切换防抖时间（毫秒）
  AUTO_ACTION_INTERVAL: 2400,   // 自动动作触发间隔（毫秒）
  AUTO_ACTION_PROBABILITY: 0.28,// 自动动作触发概率
  HINT_DURATION: 1200,          // 提示显示时长（毫秒）
  MENU_PADDING: 4,              // 菜单边距（像素）
  MAX_DPR: 2,                   // 最大设备像素比（优化性能）
} as const;

// 平台检测
const IS_MAC = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const MODIFIER_KEY = IS_MAC ? '⌘' : 'Ctrl';

type AnimDef = { sheet: string; columns: number; rows: number; frames: number; loop: boolean; };
type Manifest = { frame_size: [number, number]; fps: number; animations: Record<string, AnimDef>; };

const win = getCurrentWindow();

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <canvas id="pet"></canvas>
  <div id="hint" class="hidden"></div>

  <div id="menu" class="menu-hidden">
    <div class="menu-item" data-act="idle">▶ 待机（idle）</div>
    <div class="menu-item" data-act="look">👀 左右张望（look）</div>
    <div class="menu-item" data-act="tilt">🙂 歪头（tilt）</div>
    <div class="menu-sep"></div>
    <div class="menu-item" data-cmd="toggle-through">🖱 切换点击穿透</div>
    <div class="menu-item" data-cmd="quit">⛔ 退出</div>
  </div>
`;


const hintEl = document.getElementById("hint") as HTMLDivElement;
const canvas = document.getElementById("pet") as HTMLCanvasElement;
const ctx = canvas.getContext("2d", { alpha: true })!;
const menu = document.getElementById("menu") as HTMLDivElement;

let menuOpen = false;
let clickThroughBeforeMenu = false;

let lastToggleAt = 0;
let isToggling = false;  // 防止穿透切换竞态


let manifest: Manifest;
const sheets = new Map<string, HTMLImageElement>();

let current = "idle";
let frame = 0;
let lastTick = 0;

let clickThrough = false;
let actionLock = false;

function showHint(text: string, ms: number = CONFIG.HINT_DURATION) {
  hintEl.textContent = text;
  hintEl.classList.remove("hidden");
  window.setTimeout(() => hintEl.classList.add("hidden"), ms);
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function setCanvasSize(w: number, h: number) {
  // 限制最大 DPR 优化性能
  const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.MAX_DPR);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function play(name: string): boolean {
  if (!manifest.animations[name]) {
    console.warn(`动画不存在: ${name}`);
    showHint(`动画 "${name}" 不存在`, 2000);
    return false;
  }
  current = name;
  frame = 0;
  actionLock = !manifest.animations[name].loop;
  return true;
}

function drawFrame() {
  const def = manifest.animations[current];
  const img = sheets.get(def.sheet);
  if (!img) return;

  const [fw, fh] = manifest.frame_size;
  const col = frame % def.columns;
  const row = Math.floor(frame / def.columns);
  const sx = col * fw;
  const sy = row * fh;

  ctx.clearRect(0, 0, fw, fh);
  ctx.drawImage(img, sx, sy, fw, fh, 0, 0, fw, fh);
}

function tick(ts: number) {
  const frameDuration = 1000 / manifest.fps;

  if (!lastTick) lastTick = ts;
  const dt = ts - lastTick;

  if (dt >= frameDuration) {
    lastTick = ts - (dt % frameDuration);

    const def = manifest.animations[current];
    frame++;

    if (frame >= def.frames) {
      if (def.loop) {
        frame = 0;
      } else {
        actionLock = false;
        play("idle");
      }
    }
    drawFrame();
  }
  requestAnimationFrame(tick);
}

async function toggleClickThrough() {
  const now = Date.now();
  if (now - lastToggleAt < CONFIG.TOGGLE_DEBOUNCE || isToggling) return;
  
  isToggling = true;
  lastToggleAt = now;
  
  try {
    clickThrough = !clickThrough;
    await win.setIgnoreCursorEvents(clickThrough);
    
    // 更新视觉状态
    if (clickThrough) {
      app.classList.add('click-through');
      showHint(`穿透：开（${MODIFIER_KEY}+Shift+P 关闭）`);
    } else {
      app.classList.remove('click-through');
      showHint(`穿透：关（可拖动/可点击）`);
    }
  } catch (error) {
    console.error("切换穿透模式失败:", error);
    clickThrough = !clickThrough; // 回滚状态
    showHint("切换穿透模式失败", 2000);
  } finally {
    isToggling = false;
  }
}
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

async function openMenuAt(x: number, y: number) {
  try {
    // 如果当前是穿透，菜单无法点击，所以先临时关掉穿透
    clickThroughBeforeMenu = clickThrough;
    if (clickThrough) {
      clickThrough = false;
      await win.setIgnoreCursorEvents(false);
      app.classList.remove('click-through');
    }

    // 更新菜单内容显示当前状态
    updateMenuToggleText();

    // 先显示，才能拿到真实尺寸
    menu.classList.remove("menu-hidden");
    menuOpen = true;

    // 等待浏览器重排以获取正确尺寸
    await new Promise(resolve => requestAnimationFrame(resolve));

    const rect = app.getBoundingClientRect();
    const mw = Math.min(menu.offsetWidth || 0, rect.width - CONFIG.MENU_PADDING * 2);
    const mh = Math.min(menu.offsetHeight || 0, rect.height - CONFIG.MENU_PADDING * 2);

    // 把菜单限制在窗口内，不要溢出
    const px = clamp(x, CONFIG.MENU_PADDING, Math.max(CONFIG.MENU_PADDING, rect.width - mw - CONFIG.MENU_PADDING));
    const py = clamp(y, CONFIG.MENU_PADDING, Math.max(CONFIG.MENU_PADDING, rect.height - mh - CONFIG.MENU_PADDING));

    menu.style.left = `${px}px`;
    menu.style.top = `${py}px`;
  } catch (error) {
    console.error("打开菜单失败:", error);
    menuOpen = false;
    menu.classList.add("menu-hidden");
  }
}

async function closeMenu() {
  if (!menuOpen) return;
  menuOpen = false;
  menu.classList.add("menu-hidden");

  // 关闭菜单后，如果之前是穿透状态，则恢复
  if (clickThroughBeforeMenu) {
    try {
      clickThrough = true;
      await win.setIgnoreCursorEvents(true);
      app.classList.add('click-through');
      showHint(`穿透：开（${MODIFIER_KEY}+Shift+P 关闭）`);
      clickThroughBeforeMenu = false; // 重置状态
    } catch (error) {
      console.error("恢复穿透模式失败:", error);
      clickThrough = false; // 失败时确保状态一致
      app.classList.remove('click-through');
      showHint("恢复穿透模式失败", 2000);
    }
  }
}

// 更新菜单中穿透切换选项的文本
function updateMenuToggleText() {
  const toggleItem = menu.querySelector('[data-cmd="toggle-through"]');
  if (toggleItem) {
    const icon = clickThrough ? '✓' : '🖱';
    const text = clickThrough ? '关闭点击穿透' : '开启点击穿透';
    toggleItem.textContent = `${icon} ${text}`;
  }
}

async function setupShortcuts() {
  await register("CommandOrControl+Shift+P", toggleClickThrough);
  await register("CommandOrControl+Shift+Q", async () => {
    await unregisterAll();
    await exit(0);
  });
}

function setupInteraction() {
  let timer: number | null = null;
  let dragged = false;
  let isDragging = false;

  const clear = () => {
    if (timer) window.clearTimeout(timer);
    timer = null;
    isDragging = false;
  };

  // 右键打开菜单
  canvas.addEventListener("contextmenu", async (e) => {
    if (clickThrough || menuOpen) return; // 穿透时或菜单已打开时忽略
    e.preventDefault();
    
    // 清除可能存在的拖动定时器，避免冲突
    clear();

    const rect = app.getBoundingClientRect();
    await openMenuAt(e.clientX - rect.left, e.clientY - rect.top);
  });

  // 点击空白处关闭菜单
  app.addEventListener("pointerdown", async (e) => {
    if (!menuOpen) return;
    // 点到菜单内部不关
    if ((e.target as HTMLElement).closest("#menu")) return;
    await closeMenu();
  });

  // ESC 关闭菜单
  window.addEventListener("keydown", async (e) => {
    if (e.key === "Escape") await closeMenu();
  });

  // 菜单点击：动作/命令
  menu.addEventListener("click", async (e) => {
    const el = (e.target as HTMLElement).closest(".menu-item") as HTMLElement | null;
    if (!el || el.classList.contains('disabled')) return;

    const act = el.dataset.act;
    const cmd = el.dataset.cmd;

    // 禁用所有菜单项，防止重复点击
    const allItems = menu.querySelectorAll('.menu-item');
    allItems.forEach(item => item.classList.add('disabled'));

    try {
      if (act) {
        const success = play(act);
        if (success) {
          await closeMenu();
        }
        return;
      }

      if (cmd === "toggle-through") {
        await closeMenu();         // 先关菜单再切穿透更自然
        // 短暂延迟，让菜单关闭动画完成
        await new Promise(resolve => setTimeout(resolve, 100));
        await toggleClickThrough();
        return;
      }

      if (cmd === "quit") {
        el.textContent = "⏳ 正在退出...";
        try {
          await unregisterAll();
          await exit(0);
        } catch (error) {
          console.error("退出失败:", error);
          showHint("退出失败", 2000);
        }
        return;
      }
    } catch (error) {
      console.error("菜单操作失败:", error);
      showHint("操作失败", 2000);
    } finally {
      // 恢复菜单项状态
      allItems.forEach(item => item.classList.remove('disabled'));
    }
  });

  canvas.addEventListener("pointerdown", () => {
    if (clickThrough || menuOpen) return;
    dragged = false;
    isDragging = false;
    timer = window.setTimeout(async () => {
      isDragging = true;
      dragged = true;
      await win.startDragging();
    }, CONFIG.DRAG_DELAY);
  });

  canvas.addEventListener("pointerup", () => {
    if (clickThrough || isDragging) return;
    clear();
    if (!dragged && !actionLock) play(Math.random() < 0.5 ? "look" : "tilt");
  });

  canvas.addEventListener("pointerleave", clear);

  // 自动随机动作
  const autoPlayTimer = window.setInterval(() => {
    if (clickThrough || current !== "idle" || actionLock) return;
    if (Math.random() < CONFIG.AUTO_ACTION_PROBABILITY) {
      play(Math.random() < 0.5 ? "look" : "tilt");
    }
  }, CONFIG.AUTO_ACTION_INTERVAL);

  // 清理函数
  return () => {
    if (autoPlayTimer) window.clearInterval(autoPlayTimer);
  };
}

async function main() {
  try {
    manifest = await fetch("/manifest.json").then((r) => r.json());

    const [fw, fh] = manifest.frame_size;
    setCanvasSize(fw, fh);

    const unique = new Set(Object.values(manifest.animations).map((a) => a.sheet));
    for (const sheet of unique) {
      sheets.set(sheet, await loadImage("/" + sheet));
    }

    play("idle");
    drawFrame();
    const cleanup = setupInteraction();
    await setupShortcuts();

    requestAnimationFrame(tick);

    // 清理函数（应用关闭时）
    window.addEventListener("beforeunload", async () => {
      if (cleanup) cleanup();
      await unregisterAll();
    });
  } catch (e) {
    console.error("启动失败:", e);
    showHint("启动失败：打开控制台查看详情", 3000);
  }
}

main();
