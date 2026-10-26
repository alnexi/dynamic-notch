mod proximity;

use proximity::{start_proximity_detector, ProximityConfig};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{Listener, Manager, PhysicalPosition, Position};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            println!("[NovaIsland] Setting up main window...");
            if let Some(window) = app.get_webview_window("main") {
                println!("[NovaIsland] Main window found.");
                if let Ok(Some(monitor)) = window.primary_monitor() {
                    let monitor_pos = monitor.position();
                    let monitor_size = monitor.size();
                    if let Ok(window_size) = window.outer_size() {
                        let x = monitor_pos.x + (monitor_size.width as i32 - window_size.width as i32) / 2;
                        let y = monitor_pos.y;
                        let _ = window.set_position(Position::Physical(PhysicalPosition { x, y }));
                    }
                }

                // Native proximity detection and anchor locking
                let is_running = Arc::new(AtomicBool::new(true));
                let is_running_cleanup = Arc::clone(&is_running);

                let is_anchor_locked = Arc::new(AtomicBool::new(false));
                let lock_listener = Arc::clone(&is_anchor_locked);
                let unlock_listener = Arc::clone(&is_anchor_locked);

                window.listen("nova-lock-anchor", move |_| {
                    println!("[NovaIsland] Anchor locked by frontend.");
                    lock_listener.store(true, Ordering::Relaxed);
                });

                window.listen("nova-unlock-anchor", move |_| {
                    println!("[NovaIsland] Anchor unlocked by frontend.");
                    unlock_listener.store(false, Ordering::Relaxed);
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
                    ProximityConfig::default(),
                );

                // Reveal the window once accurately positioned
                let _ = window.show();
            } else {
                eprintln!("[NovaIsland] ERROR: 'main' window not found!");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Nova Island application");
}
