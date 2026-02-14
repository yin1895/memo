#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app_builder;
mod shutdown_state;

use app_builder::configure_builder;
use std::sync::Arc;
use shutdown_state::ShutdownState;
use tauri::{
    AppHandle,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Emitter, Listener, Manager, Runtime,
};
use std::time::Duration;

fn initiate_shutdown<R: Runtime>(app: &AppHandle<R>, state: Arc<ShutdownState>) {
    // 防止重复触发，避免创建多组监听器/线程
    if !state.try_begin_shutdown() {
        return;
    }

    // 通知前端执行统一清理后退出
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.emit("app:request-quit", ());
    }

    // 前端清理完成后会 emit "app:shutdown-complete"，收到后提前安全退出
    let state_for_ack = Arc::clone(&state);
    let handle_for_once = app.clone();
    let handle_for_ack_exit = app.clone();
    handle_for_once.once("app:shutdown-complete", move |_| {
        state_for_ack.mark_acked();
        handle_for_ack_exit.exit(0);
    });

    // 安全超时兜底：若前端未响应则 8 秒后强制退出
    let handle_for_timeout = app.clone();
    std::thread::spawn(move || {
        // 每 200ms 检查一次，共等待 8 秒（40 次）
        for _ in 0..40 {
            if state.is_acked() {
                // 前端已完成清理（once 回调会负责退出）
                return;
            }
            std::thread::sleep(Duration::from_millis(200));
        }
        // 超时，强制退出
        handle_for_timeout.exit(0);
    });
}

fn main() {
    configure_builder(tauri::Builder::default())
        .setup(|app| {
            // 仅接管主窗口关闭，其他窗口（如 memory-panel）保持默认关闭行为
            if let Some(main_window) = app.get_webview_window("main") {
                let app_handle = app.handle().clone();
                let shutdown_state = app.state::<Arc<ShutdownState>>().inner().clone();
                main_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        initiate_shutdown(&app_handle, Arc::clone(&shutdown_state));
                    }
                });
            }

            // ─── 系统托盘 ───
            let show_item = MenuItem::with_id(app, "show", "🐦 显示小鸟", true, None::<&str>)?;
            let memories_item = MenuItem::with_id(app, "memories", "📖 查看回忆", true, None::<&str>)?;
            let autostart_item = MenuItem::with_id(app, "autostart", "🚀 开机自启动", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "⛔ 退出", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[
                &show_item,
                &memories_item,
                &autostart_item,
                &sep,
                &quit_item,
            ])?;

            let mut tray_builder = TrayIconBuilder::<tauri::Wry>::new();
            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }
            tray_builder
                .tooltip("Bird Pet - 你的桌面小鸟")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "memories" => {
                        // 通知前端打开回忆面板
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.emit("tray:open-memories", ());
                        }
                    }
                    "autostart" => {
                        // 通知前端切换自启动状态
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.emit("tray:toggle-autostart", ());
                        }
                    }
                    "quit" => {
                        let shutdown_state = app.state::<Arc<ShutdownState>>().inner().clone();
                        initiate_shutdown(app, shutdown_state);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::DoubleClick { .. } = event {
                        if let Some(w) = tray.app_handle().get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
