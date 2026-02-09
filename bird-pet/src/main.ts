import "./style.css";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import { exit, relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent } from "@tauri-apps/plugin-updater";

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
    <div class="menu-item" data-cmd="check-update">🔄 检查更新</div>
    <div class="menu-item" data-cmd="toggle-through">🖱 切换点击穿透</div>
    <div class="menu-item" data-cmd="quit">⛔ 退出</div>
  </div>

  <div id="update-overlay" class="update-hidden">
    <div id="update-dialog">
      <div id="update-message"></div>
      <div id="update-version"></div>
      <div id="update-progress-wrap" class="update-hidden">
        <div id="update-progress-bar"></div>
        <div id="update-progress-text">0%</div>
      </div>
      <div id="update-buttons">
        <button id="btn-update-now" class="update-btn primary">立即更新</button>
        <button id="btn-update-later" class="update-btn">稍后提醒</button>
        <button id="btn-update-skip" class="update-btn muted">不再提示</button>
      </div>
    </div>
  </div>
`;


const hintEl = document.getElementById("hint") as HTMLDivElement;
const canvas = document.getElementById("pet") as HTMLCanvasElement;
const ctx = canvas.getContext("2d", { alpha: true })!;
const menu = document.getElementById("menu") as HTMLDivElement;

// 更新对话框元素
const updateOverlay = document.getElementById("update-overlay") as HTMLDivElement;
const updateMessage = document.getElementById("update-message") as HTMLDivElement;
const updateVersion = document.getElementById("update-version") as HTMLDivElement;
const updateProgressWrap = document.getElementById("update-progress-wrap") as HTMLDivElement;
const updateProgressBar = document.getElementById("update-progress-bar") as HTMLDivElement;
const updateProgressText = document.getElementById("update-progress-text") as HTMLDivElement;
const btnUpdateNow = document.getElementById("btn-update-now") as HTMLButtonElement;
const btnUpdateLater = document.getElementById("btn-update-later") as HTMLButtonElement;
const btnUpdateSkip = document.getElementById("btn-update-skip") as HTMLButtonElement;

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

async function openMenuAt() {
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

    // 固定在窗口左上角，利用 CSS max-height + 滚动显示全部菜单项
    menu.style.left = `${CONFIG.MENU_PADDING}px`;
    menu.style.top = `${CONFIG.MENU_PADDING}px`;
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

    await openMenuAt();
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

      if (cmd === "check-update") {
        await closeMenu();
        await checkForUpdate(true);
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

// ========== 自动更新 ==========

const IGNORED_VERSION_KEY = "bird-pet-ignored-version";

/** 从 Release Notes body 中提取 [UPDATE_MESSAGE] 标记的自定义提示语 */
function parseUpdateMessage(body?: string): string | null {
  if (!body) return null;
  const match = body.match(/\[UPDATE_MESSAGE\]\s*(.+)/);
  return match ? match[1].trim() : null;
}

/** 显示更新对话框 */
function showUpdateDialog(message: string, version: string) {
  updateMessage.textContent = message;
  updateVersion.textContent = `新版本：v${version}`;
  updateProgressWrap.classList.add("update-hidden");
  btnUpdateNow.style.display = "";
  btnUpdateLater.style.display = "";
  btnUpdateSkip.style.display = "";
  btnUpdateNow.disabled = false;
  btnUpdateNow.textContent = "立即更新";
  updateOverlay.classList.remove("update-hidden");
}

function hideUpdateDialog() {
  updateOverlay.classList.add("update-hidden");
}

/** 显示下载进度 */
function showDownloadProgress(percent: number) {
  updateProgressWrap.classList.remove("update-hidden");
  updateProgressBar.style.width = `${percent}%`;
  updateProgressText.textContent = `${Math.round(percent)}%`;
}

/** 检查更新（manual=true 时即使被忽略也检查，并弹提示） */
async function checkForUpdate(manual: boolean) {
  try {
    const update = await check({ timeout: 10000 });
    
    if (!update) {
      if (manual) showHint("已是最新版本 ✓", 2000);
      return;
    }

    // 检查用户是否忽略了该版本
    if (!manual) {
      const ignoredVersion = localStorage.getItem(IGNORED_VERSION_KEY);
      if (ignoredVersion === update.version) {
        console.log(`版本 ${update.version} 已被用户忽略`);
        return;
      }
    }

    // 解析自定义提示语
    const customMessage = parseUpdateMessage(update.body);
    const displayMessage = customMessage || `发现新版本 🐦`;

    // 展示更新对话框
    showUpdateDialog(displayMessage, update.version);

    // 绑定按钮事件（一次性）
    const cleanup = () => {
      btnUpdateNow.removeEventListener("click", onUpdateNow);
      btnUpdateLater.removeEventListener("click", onLater);
      btnUpdateSkip.removeEventListener("click", onSkip);
    };

    const onUpdateNow = async () => {
      btnUpdateNow.disabled = true;
      btnUpdateNow.textContent = "下载中...";
      btnUpdateLater.style.display = "none";
      btnUpdateSkip.style.display = "none";
      
      let totalBytes = 0;
      let downloadedBytes = 0;

      try {
        await update.downloadAndInstall((event: DownloadEvent) => {
          if (event.event === "Started") {
            totalBytes = event.data.contentLength ?? 0;
            downloadedBytes = 0;
            showDownloadProgress(0);
          } else if (event.event === "Progress") {
            downloadedBytes += event.data.chunkLength;
            const percent = totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0;
            showDownloadProgress(Math.min(percent, 100));
          } else if (event.event === "Finished") {
            showDownloadProgress(100);
          }
        });

        // 安装完成，提示重启
        updateProgressText.textContent = "安装完成！";
        cleanup();
        btnUpdateNow.textContent = "重启应用";
        btnUpdateNow.disabled = false;
        btnUpdateNow.addEventListener("click", async () => {
          await relaunch();
        }, { once: true });
      } catch (err) {
        console.error("更新下载失败:", err);
        btnUpdateNow.textContent = "下载失败";
        btnUpdateLater.style.display = "";
        btnUpdateLater.textContent = "关闭";
        showHint("更新下载失败", 2000);
      }
    };

    const onLater = () => {
      hideUpdateDialog();
      cleanup();
    };

    const onSkip = () => {
      localStorage.setItem(IGNORED_VERSION_KEY, update.version);
      hideUpdateDialog();
      cleanup();
      showHint("已忽略此版本", 1500);
    };

    btnUpdateNow.addEventListener("click", onUpdateNow);
    btnUpdateLater.addEventListener("click", onLater);
    btnUpdateSkip.addEventListener("click", onSkip);

  } catch (err) {
    console.error("检查更新失败:", err);
    if (manual) showHint("检查更新失败", 2000);
  }
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

    // 启动时检查更新（静默，不阻塞主流程）
    setTimeout(() => checkForUpdate(false), 2000);
  } catch (e) {
    console.error("启动失败:", e);
    showHint("启动失败：打开控制台查看详情", 3000);
  }
}

main();
