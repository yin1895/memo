#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::sync::Mutex;
use sysinfo::System;
use tauri::State;

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

fn main() {
    // 初始化系统监控（做一次基线刷新以便后续 CPU 读数准确）
    let mut sys = System::new();
    sys.refresh_cpu_usage();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(SystemMonitor {
            system: Mutex::new(sys),
        })
        .invoke_handler(tauri::generate_handler![get_system_stats])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
