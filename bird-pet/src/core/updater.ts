import { check, type DownloadEvent } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { showHint } from '../utils';

const IGNORED_VERSION_KEY = 'bird-pet-ignored-version';

/** 更新对话框 DOM 元素集合 */
export interface UpdateElements {
  overlay: HTMLDivElement;
  message: HTMLDivElement;
  version: HTMLDivElement;
  progressWrap: HTMLDivElement;
  progressBar: HTMLDivElement;
  progressText: HTMLDivElement;
  btnNow: HTMLButtonElement;
  btnLater: HTMLButtonElement;
  btnSkip: HTMLButtonElement;
}

/** check() 返回的非空更新对象类型 */
type Update = NonNullable<Awaited<ReturnType<typeof check>>>;

/**
 * 自动更新控制器
 *
 * 支持手动/自动检查更新、版本忽略、下载进度展示。
 */
export class UpdateController {
  private el: UpdateElements;
  private currentCleanup: (() => void) | null = null;

  constructor(el: UpdateElements) {
    this.el = el;
  }

  /** 检查更新（manual=true 为用户主动触发） */
  async check(manual: boolean): Promise<void> {
    try {
      const update = await check({ timeout: 10000 });

      if (!update) {
        if (manual) showHint('已是最新版本 ✓', 2000);
        return;
      }

      // 非手动模式下跳过用户已忽略的版本
      if (!manual) {
        const ignored = localStorage.getItem(IGNORED_VERSION_KEY);
        if (ignored === update.version) {
          console.log(`版本 ${update.version} 已被用户忽略`);
          return;
        }
      }

      const customMsg = this.parseUpdateMessage(update.body);
      this.showDialog(customMsg || '发现新版本 🐦', update.version);
      this.bindButtons(update);
    } catch (err) {
      console.error('检查更新失败:', err);
      if (manual) showHint('检查更新失败', 2000);
    }
  }

  // ─── 内部方法 ───

  private parseUpdateMessage(body?: string): string | null {
    if (!body) return null;
    const match = body.match(/\[UPDATE_MESSAGE\]\s*(.+)/);
    return match ? match[1].trim() : null;
  }

  private showDialog(message: string, version: string): void {
    this.el.message.textContent = message;
    this.el.version.textContent = `新版本：v${version}`;
    this.el.progressWrap.classList.add('update-hidden');
    this.el.btnNow.style.display = '';
    this.el.btnLater.style.display = '';
    this.el.btnSkip.style.display = '';
    this.el.btnNow.disabled = false;
    this.el.btnNow.textContent = '立即更新';
    this.el.overlay.classList.remove('update-hidden');
  }

  private hideDialog(): void {
    this.el.overlay.classList.add('update-hidden');
  }

  private showProgress(percent: number): void {
    this.el.progressWrap.classList.remove('update-hidden');
    this.el.progressBar.style.width = `${percent}%`;
    this.el.progressText.textContent = `${Math.round(percent)}%`;
  }

  private bindButtons(update: Update): void {
    // 清除前一次绑定，防止回调叠加
    this.currentCleanup?.();

    const cleanup = () => {
      this.el.btnNow.removeEventListener('click', onNow);
      this.el.btnLater.removeEventListener('click', onLater);
      this.el.btnSkip.removeEventListener('click', onSkip);
      this.currentCleanup = null;
    };
    this.currentCleanup = cleanup;

    const onNow = async () => {
      this.el.btnNow.disabled = true;
      this.el.btnNow.textContent = '下载中...';
      this.el.btnLater.style.display = 'none';
      this.el.btnSkip.style.display = 'none';

      let total = 0;
      let downloaded = 0;

      try {
        await update.downloadAndInstall((event: DownloadEvent) => {
          if (event.event === 'Started') {
            total = event.data.contentLength ?? 0;
            downloaded = 0;
            this.showProgress(0);
          } else if (event.event === 'Progress') {
            downloaded += event.data.chunkLength;
            const pct = total > 0 ? Math.min((downloaded / total) * 100, 100) : 0;
            this.showProgress(pct);
          } else if (event.event === 'Finished') {
            this.showProgress(100);
          }
        });

        this.el.progressText.textContent = '安装完成！';
        cleanup();
        this.el.btnNow.textContent = '重启应用';
        this.el.btnNow.disabled = false;
        this.el.btnNow.addEventListener('click', () => relaunch(), { once: true });
      } catch (err) {
        console.error('更新下载失败:', err);
        cleanup();
        this.el.btnNow.textContent = '下载失败';
        this.el.btnLater.style.display = '';
        this.el.btnLater.textContent = '关闭';
        this.el.btnLater.addEventListener('click', () => this.hideDialog(), { once: true });
        showHint('更新下载失败', 2000);
      }
    };

    const onLater = () => {
      this.hideDialog();
      cleanup();
    };

    const onSkip = () => {
      localStorage.setItem(IGNORED_VERSION_KEY, update.version);
      this.hideDialog();
      cleanup();
      showHint('已忽略此版本', 1500);
    };

    this.el.btnNow.addEventListener('click', onNow);
    this.el.btnLater.addEventListener('click', onLater);
    this.el.btnSkip.addEventListener('click', onSkip);
  }
}
