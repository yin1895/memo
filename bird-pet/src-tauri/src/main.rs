#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use active_win_pos_rs::get_active_window;
use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use sysinfo::System;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, State,
};
use tauri_plugin_autostart::MacosLauncher;
use std::time::Duration;

/// 系统资源统计信息
#[derive(Debug, Serialize)]
struct SystemStats {
    /// CPU 使用率（0-100）
    cpu_usage: f32,
    /// 已用内存（GB）
    memory_used_gb: f64,
    /// 总内存（GB）
    memory_total_gb: f64,
    /// 内存使用百分比（0-100）
    memory_usage_percent: f64,
}

/// 系统监控状态（跨调用复用 System 实例）
struct SystemMonitor {
    system: Mutex<System>,
}

#[tauri::command]
fn get_system_stats(monitor: State<'_, SystemMonitor>) -> SystemStats {
    let mut sys = monitor.system.lock().expect("failed to lock system monitor");

    sys.refresh_cpu_usage();
    sys.refresh_memory();

    let cpu_usage = sys.global_cpu_usage();
    let bytes_to_gb = |b: u64| b as f64 / (1024.0 * 1024.0 * 1024.0);
    let memory_used = bytes_to_gb(sys.used_memory());
    let memory_total = bytes_to_gb(sys.total_memory());
    let memory_percent = if memory_total > 0.0 {
        (memory_used / memory_total) * 100.0
    } else {
        0.0
    };

    SystemStats {
        cpu_usage,
        memory_used_gb: memory_used,
        memory_total_gb: memory_total,
        memory_usage_percent: memory_percent,
    }
}

/// 当前活跃窗口信息
#[derive(Debug, Serialize)]
struct ActiveWindowInfo {
    /// 应用/进程名称
    app_name: String,
    /// 窗口标题
    title: String,
}

#[tauri::command]
fn get_active_window_info() -> Option<ActiveWindowInfo> {
    match get_active_window() {
        Ok(win) => Some(ActiveWindowInfo {
            app_name: win.app_name,
            title: win.title,
        }),
        Err(_) => None,
    }
}

fn main() {
    // 初始化系统监控（做一次基线刷新以便后续 CPU 读数准确）
    let mut sys = System::new();
    sys.refresh_cpu_usage();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .manage(SystemMonitor {
            system: Mutex::new(sys),
        })
        .invoke_handler(tauri::generate_handler![get_system_stats, get_active_window_info])
        .setup(|app| {
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
                        // 通知前端执行统一清理后退出
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.emit("app:request-quit", ());
                        }
                        // 安全超时兜底：若前端未响应则 8 秒后强制退出
                        // 前端清理完成后会 emit "app:shutdown-complete"，收到后提前安全退出
                        let shutdown_acked = Arc::new(AtomicBool::new(false));
                        let acked_clone = Arc::clone(&shutdown_acked);
                        let handle_for_listen = app.clone();
                        // 监听前端 ack 事件
                        handle_for_listen.listen("app:shutdown-complete", move |_| {
                            acked_clone.store(true, Ordering::SeqCst);
                        });
                        let handle = app.clone();
                        std::thread::spawn(move || {
                            // 每 200ms 检查一次，共等待 8 秒（40 次）
                            for _ in 0..40 {
                                if shutdown_acked.load(Ordering::SeqCst) {
                                    // 前端已完成清理，安全退出
                                    handle.exit(0);
                                    return;
                                }
                                std::thread::sleep(Duration::from_millis(200));
                            }
                            // 超时，强制退出
                            handle.exit(0);
                        });
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
