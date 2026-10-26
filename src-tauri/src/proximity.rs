use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{Emitter, WebviewWindow};

#[repr(C)]
#[derive(Default, Clone, Copy, Debug)]
pub struct POINT {
    pub x: i32,
    pub y: i32,
}

#[cfg(target_os = "windows")]
#[link(name = "user32")]
extern "system" {
    fn GetCursorPos(lpPoint: *mut POINT) -> i32;
}

#[cfg(target_os = "windows")]
fn get_cursor_position() -> Option<(i32, i32)> {
    let mut pt = POINT { x: 0, y: 0 };
    let res = unsafe { GetCursorPos(&mut pt) };
    if res != 0 {
        Some((pt.x, pt.y))
    } else {
        None
    }
}

#[cfg(not(target_os = "windows"))]
fn get_cursor_position() -> Option<(i32, i32)> {
    None
}

/// Proximity level representing the interaction state along the top edge.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProximityLevel {
    Idle = 0,
    Approaching = 1,
    Hovered = 2,
}

/// Event payload emitted to the frontend for tracking and activation.
#[derive(Debug, Clone, Copy, serde::Serialize)]
pub struct ProximityPayload {
    pub level: ProximityLevel,
    pub cursor_x: f32,
    pub cursor_y: f32,
    pub anchor_x: f32,
    pub offset_x: f32,
    pub is_locked: bool,
}

/// Configuration parameters for pointer tracking along the top edge.
pub struct ProximityConfig {
    pub top_proximity_threshold: f32, // Logical px from top edge to trigger approaching
    pub bubble_radius: f32,            // Logical px radius to detect entry
    pub leave_threshold: f32,          // Logical px to auto-unlock if cursor leaves far away
    pub poll_interval: Duration,
    pub leave_delay: Duration,
}

impl Default for ProximityConfig {
    fn default() -> Self {
        Self {
            top_proximity_threshold: 90.0,
            bubble_radius: 24.0,
            leave_threshold: 80.0,
            poll_interval: Duration::from_millis(20),
            leave_delay: Duration::from_millis(150),
        }
    }
}

/// Computes the clamped anchor X coordinate and window X coordinate.
/// Clamps so that the 148px capsule (half-width 74px) with margin stays fully on-screen.
pub fn compute_anchor_and_window(cursor_x: f32, monitor_width: f32) -> (f32, f32, f32) {
    let anchor_x = cursor_x.clamp(78.0, monitor_width - 78.0);
    let win_x_logical = (anchor_x - 120.0).clamp(0.0, monitor_width - 240.0);
    let offset_x = anchor_x - win_x_logical;
    (anchor_x, win_x_logical, offset_x)
}

/// Starts the lightweight background pointer-tracking and proximity detector.
pub fn start_proximity_detector(
    window: WebviewWindow,
    is_running: Arc<AtomicBool>,
    is_anchor_locked: Arc<AtomicBool>,
    config: ProximityConfig,
) {
    thread::spawn(move || {
        let mut current_level = ProximityLevel::Idle;
        let mut last_anchor_x = 0.0f32;
        let mut last_offset_x = 120.0f32;
        let mut last_win_phys_x = -9999i32;
        let mut pending_downgrade: Option<(ProximityLevel, Instant)> = None;

        println!("[NovaIsland] Pointer-anchored proximity detector thread started.");

        while is_running.load(Ordering::Relaxed) {
            if let Ok(Some(monitor)) = window.primary_monitor() {
                let monitor_pos = monitor.position();
                let monitor_size = monitor.size();
                let scale = monitor.scale_factor();

                if let Some((raw_x, raw_y)) = get_cursor_position() {
                    let rel_x = (raw_x - monitor_pos.x) as f32 / scale as f32;
                    let rel_y = (raw_y - monitor_pos.y) as f32 / scale as f32;
                    let mon_width = monitor_size.width as f32 / scale as f32;

                    let locked = is_anchor_locked.load(Ordering::Relaxed);

                    if locked {
                        // While locked (capsule expanded at anchor X), the window position is FROZEN.
                        // Auto-unlock if cursor moves away from the capsule
                        let dx = (rel_x - last_anchor_x).abs();
                        if rel_y > config.leave_threshold || dx > 120.0 || rel_y < -20.0 {
                            is_anchor_locked.store(false, Ordering::Relaxed);
                            current_level = if rel_y <= config.top_proximity_threshold && rel_y >= 0.0 {
                                ProximityLevel::Approaching
                            } else {
                                ProximityLevel::Idle
                            };
                            let _ = window.emit(
                                "nova-proximity",
                                ProximityPayload {
                                    level: current_level,
                                    cursor_x: rel_x,
                                    cursor_y: rel_y,
                                    anchor_x: last_anchor_x,
                                    offset_x: last_offset_x,
                                    is_locked: false,
                                },
                            );
                        }
                    } else {
                        // Unlocked: Track pointer across the entire top edge
                        let dy = rel_y;

                        if dy > config.top_proximity_threshold || dy < 0.0 {
                            // Outside top proximity zone: Idle (invisible)
                            let now = Instant::now();
                            let should_downgrade = match pending_downgrade {
                                Some((ProximityLevel::Idle, expire)) if now >= expire => true,
                                Some((ProximityLevel::Idle, _)) => false,
                                _ => {
                                    pending_downgrade = Some((ProximityLevel::Idle, now + config.leave_delay));
                                    false
                                }
                            };

                            if should_downgrade && current_level != ProximityLevel::Idle {
                                current_level = ProximityLevel::Idle;
                                pending_downgrade = None;
                                let _ = window.emit(
                                    "nova-proximity",
                                    ProximityPayload {
                                        level: ProximityLevel::Idle,
                                        cursor_x: rel_x,
                                        cursor_y: rel_y,
                                        anchor_x: last_anchor_x,
                                        offset_x: last_offset_x,
                                        is_locked: false,
                                    },
                                );
                            }
                        } else {
                            // Inside top proximity zone: smoothly track pointer horizontal position
                            pending_downgrade = None;

                            let (anchor_x, win_x_logical, offset_x) =
                                compute_anchor_and_window(rel_x, mon_width);

                            last_anchor_x = anchor_x;
                            last_offset_x = offset_x;

                            // Calculate physical window coordinate
                            let win_x_phys = monitor_pos.x + (win_x_logical * scale as f32).round() as i32;
                            let win_y_phys = monitor_pos.y;

                            // Reposition native window if physical X changed by at least 1px
                            if (win_x_phys - last_win_phys_x).abs() >= 1 {
                                last_win_phys_x = win_x_phys;
                                let _ = window.set_position(tauri::Position::Physical(
                                    tauri::PhysicalPosition::new(win_x_phys, win_y_phys),
                                ));
                            }

                            // Check if cursor entered the visible bubble (activation trigger)
                            let in_bubble = dy <= 32.0 && (rel_x - anchor_x).abs() <= config.bubble_radius;
                            let raw_level = if in_bubble {
                                ProximityLevel::Hovered
                            } else {
                                ProximityLevel::Approaching
                            };

                            if raw_level == ProximityLevel::Hovered {
                                is_anchor_locked.store(true, Ordering::Relaxed);
                            }

                            current_level = raw_level;

                            let _ = window.emit(
                                "nova-proximity",
                                ProximityPayload {
                                    level: current_level,
                                    cursor_x: rel_x,
                                    cursor_y: rel_y,
                                    anchor_x,
                                    offset_x,
                                    is_locked: is_anchor_locked.load(Ordering::Relaxed),
                                },
                            );
                        }
                    }
                }
            }

            thread::sleep(config.poll_interval);
        }

        println!("[NovaIsland] Pointer-anchored proximity detector thread terminated.");
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tracking_coordinates_and_clamping() {
        let mon_width = 1920.0f32;

        // 1. Far Left (cursor at x = 10px):
        // Anchor clamps to 78.0 so 148px capsule stays fully on-screen
        let (anchor_x, win_x, offset_x) = compute_anchor_and_window(10.0, mon_width);
        assert_eq!(anchor_x, 78.0);
        assert_eq!(win_x, 0.0);
        assert_eq!(offset_x, 78.0);
        // Physical position of anchor on monitor = win_x + offset_x
        assert_eq!(win_x + offset_x, 78.0);

        // 2. Left-Middle (cursor at x = 400px):
        let (anchor_x, win_x, offset_x) = compute_anchor_and_window(400.0, mon_width);
        assert_eq!(anchor_x, 400.0);
        assert_eq!(win_x, 280.0);
        assert_eq!(offset_x, 120.0);
        assert_eq!(win_x + offset_x, 400.0);

        // 3. Center (cursor at x = 960px):
        let (anchor_x, win_x, offset_x) = compute_anchor_and_window(960.0, mon_width);
        assert_eq!(anchor_x, 960.0);
        assert_eq!(win_x, 840.0);
        assert_eq!(offset_x, 120.0);
        assert_eq!(win_x + offset_x, 960.0);

        // 4. Right-Middle (cursor at x = 1500px):
        let (anchor_x, win_x, offset_x) = compute_anchor_and_window(1500.0, mon_width);
        assert_eq!(anchor_x, 1500.0);
        assert_eq!(win_x, 1380.0);
        assert_eq!(offset_x, 120.0);
        assert_eq!(win_x + offset_x, 1500.0);

        // 5. Far Right (cursor at x = 1910px on a 1920 monitor):
        // Anchor clamps to 1842.0 (1920 - 78)
        let (anchor_x, win_x, offset_x) = compute_anchor_and_window(1910.0, mon_width);
        assert_eq!(anchor_x, 1842.0);
        assert_eq!(win_x, 1680.0);
        assert_eq!(offset_x, 162.0);
        assert_eq!(win_x + offset_x, 1842.0);
    }
}
