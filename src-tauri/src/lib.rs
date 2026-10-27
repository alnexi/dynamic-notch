mod contrast;
mod media;
mod proximity;
mod tasks;

use proximity::{start_proximity_detector, ProximityConfig};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tasks::{ActiveTask, TaskManager};
use tauri::{Listener, Manager, PhysicalPosition, Position};

#[tauri::command]
fn start_timer(state: tauri::State<TaskManager>, seconds: u64, label: Option<String>) -> String {
    state.start_timer(seconds, label)
}

#[tauri::command]
fn cancel_timer(state: tauri::State<TaskManager>, id: String) -> bool {
    state.cancel_timer(&id)
}

#[tauri::command]
fn set_alarm(state: tauri::State<TaskManager>, hour: u32, minute: u32, label: Option<String>) -> String {
    state.set_alarm(hour, minute, label)
}

#[tauri::command]
fn cancel_alarm(state: tauri::State<TaskManager>, id: String) -> bool {
    state.cancel_alarm(&id)
}

#[tauri::command]
fn get_active_tasks(state: tauri::State<TaskManager>) -> Vec<ActiveTask> {
    state.get_active_tasks()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let task_manager = TaskManager::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(task_manager.clone())
        .invoke_handler(tauri::generate_handler![
            start_timer,
            cancel_timer,
            set_alarm,
            cancel_alarm,
            get_active_tasks
        ])
        .setup(move |app| {
            println!("[NovaIsland] Setting up main window...");
            if let Some(window) = app.get_webview_window("main") {
                println!("[NovaIsland] Main window found.");
                if let Ok(Some(monitor)) = window.primary_monitor() {
                    let monitor_pos = monitor.position();
                    let monitor_size = monitor.size();
                    let scale = monitor.scale_factor();
                    let x = monitor_pos.x;
                    let y = monitor_pos.y;
                    let _ = window.set_position(Position::Physical(PhysicalPosition { x, y }));
                    let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(
                        monitor_size.width,
                        (56.0 * scale).round() as u32,
                    )));
                }

                // Native proximity detection, anchor locking, and capsule expansion
                let is_running = Arc::new(AtomicBool::new(true));
                let is_running_cleanup = Arc::clone(&is_running);

                let is_anchor_locked = Arc::new(AtomicBool::new(false));
                let lock_listener = Arc::clone(&is_anchor_locked);
                let unlock_listener = Arc::clone(&is_anchor_locked);

                let is_capsule_expanded = Arc::new(AtomicBool::new(false));
                let expand_listener = Arc::clone(&is_capsule_expanded);
                let collapse_listener = Arc::clone(&is_capsule_expanded);
                let unlock_collapse = Arc::clone(&is_capsule_expanded);

                window.listen("nova-lock-anchor", move |_| {
                    println!("[NovaIsland] Anchor locked by frontend.");
                    lock_listener.store(true, Ordering::Relaxed);
                });

                window.listen("nova-unlock-anchor", move |_| {
                    println!("[NovaIsland] Anchor unlocked by frontend.");
                    unlock_listener.store(false, Ordering::Relaxed);
                    unlock_collapse.store(false, Ordering::Relaxed);
                });

                window.listen("nova-expand-capsule", move |_| {
                    println!("[NovaIsland] Capsule expanded by frontend.");
                    expand_listener.store(true, Ordering::Relaxed);
                });

                window.listen("nova-collapse-capsule", move |_| {
                    println!("[NovaIsland] Capsule collapsed by frontend.");
                    collapse_listener.store(false, Ordering::Relaxed);
                });

                // Ensure clean thread shutdown when window closes
                let window_events = window.clone();
                window_events.on_window_event(move |event| {
                    if let tauri::WindowEvent::Destroyed = event {
                        is_running_cleanup.store(false, Ordering::Relaxed);
                    }
                });

                start_proximity_detector(
                    window.clone(),
                    is_running,
                    Arc::clone(&is_anchor_locked),
                    Arc::clone(&is_capsule_expanded),
                    task_manager,
                    ProximityConfig::default(),
                );

                // Configure native Windows window flags to prevent focus stealing from Chrome/active apps
                #[cfg(target_os = "windows")]
                {
                    #[link(name = "user32")]
                    extern "system" {
                        fn GetWindowLongW(hWnd: *mut std::ffi::c_void, nIndex: i32) -> i32;
                        fn SetWindowLongW(hWnd: *mut std::ffi::c_void, nIndex: i32, dwNewLong: i32) -> i32;
                    }
                    const GWL_EXSTYLE: i32 = -20;
                    const WS_EX_NOACTIVATE: i32 = 0x08000000;

                    if let Ok(hwnd) = window.hwnd() {
                        let hwnd_ptr = hwnd.0;
                        unsafe {
                            let ex_style = GetWindowLongW(hwnd_ptr, GWL_EXSTYLE);
                            SetWindowLongW(hwnd_ptr, GWL_EXSTYLE, ex_style | WS_EX_NOACTIVATE);
                        }
                    }
                }

                // Initial state: ignore cursor events so all desktop clicks pass through
                let _ = window.set_ignore_cursor_events(true);
                let _ = window.show();
            } else {
                eprintln!("[NovaIsland] ERROR: 'main' window not found!");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Nova Island application");
}
