use crate::contrast::{get_adaptive_contrast_mode, ContrastMode};
use crate::tasks::{ActiveTask, TaskManager};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{Emitter, PhysicalPosition, Position, WebviewWindow};

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

/// Progressive proximity level representing the interaction state along the top edge.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProximityLevel {
    Idle = 0,
    Approaching = 1,
    Near = 2,
    Hovered = 3,
}

/// Constants for capsule expansion and safe edge positioning
pub const EXPANSION_FACTOR: f32 = 3.5;
pub const SCREEN_MARGIN: f32 = 10.0;
pub const DEFAULT_MEDIA_WIDTH: f32 = 360.0;
pub const DEFAULT_MEDIA_HEIGHT: f32 = 60.0;

/// Event payload emitted to the frontend for tracking, active tasks, and adaptive contrast.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ProximityPayload {
    pub level: ProximityLevel,
    pub cursor_x: f32,
    pub cursor_y: f32,
    pub anchor_x: f32,
    pub offset_x: f32,
    pub monitor_width: f32,
    pub is_locked: bool,
    pub is_expanded: bool,
    pub expansion_mode: String,
    pub contrast_mode: ContrastMode,
    pub active_tasks: Vec<ActiveTask>,
}

/// Configuration parameters for subtle pointer tracking along the top edge.
pub struct ProximityConfig {
    pub top_proximity_threshold: f32, // Logical px from top edge for initial reveal (~90.0)
    pub near_threshold: f32,          // Logical px from top edge for progressive closer reveal (~45.0)
    pub entry_y_threshold: f32,       // Logical px max Y to detect entry into visible protrusion (~7.0)
    pub entry_radius: f32,            // Logical px half-width of protrusion entry (~16.0)
    pub leave_threshold: f32,         // Logical px to auto-unlock if cursor leaves capsule (~70.0)
    pub poll_interval: Duration,
    pub leave_delay: Duration,
}

impl Default for ProximityConfig {
    fn default() -> Self {
        Self {
            top_proximity_threshold: 90.0,
            near_threshold: 45.0,
            entry_y_threshold: 7.0,
            entry_radius: 16.0,
            leave_threshold: 70.0,
            poll_interval: Duration::from_millis(20),
            leave_delay: Duration::from_millis(150),
        }
    }
}

/// Computes the clamped anchor X coordinate and window X coordinate.
#[allow(dead_code)]
pub fn compute_anchor_and_window(cursor_x: f32, monitor_width: f32) -> (f32, f32, f32) {
    let anchor_x = cursor_x.clamp(78.0, monitor_width - 78.0);
    let win_x_logical = (anchor_x - 120.0).clamp(0.0, monitor_width - 240.0);
    let offset_x = anchor_x - win_x_logical;
    (anchor_x, win_x_logical, offset_x)
}

/// Computes the dynamic capsule half-width based on the number of active tasks.
pub fn get_capsule_half_width(active_task_count: usize) -> f32 {
    match active_task_count {
        0 => 46.0,  // ~88-92px clock-only
        1 => 68.0,  // ~132-136px with 1 task
        2 => 86.0,  // ~168-172px with 2 tasks
        _ => 104.0, // ~204-208px with 3+ tasks
    }
}

/// Computes the expanded bounds (left, right, center) for the capsule at anchor_x.
/// - Media mode: uses content-adaptive dynamic width (280px-560px), defaulting to DEFAULT_MEDIA_WIDTH.
/// - Standard mode: uses approximately 3.5x collapsed width.
/// Clamped to screen boundaries [SCREEN_MARGIN, mon_width - SCREEN_MARGIN].
/// - Near center: expands symmetrically around anchor_x.
/// - Near left corner: pins left to SCREEN_MARGIN and expands rightward.
/// - Near right corner: pins right to mon_width - SCREEN_MARGIN and expands leftward.
pub fn compute_expanded_bounds(
    anchor_x: f32,
    active_task_count: usize,
    is_media_mode: bool,
    media_custom_width: Option<f32>,
    mon_width: f32,
) -> (f32, f32, f32) {
    let safe_mon_width = mon_width.max(800.0);
    let target_w = if is_media_mode {
        let desired = media_custom_width.unwrap_or(DEFAULT_MEDIA_WIDTH);
        desired.min(safe_mon_width - 2.0 * SCREEN_MARGIN)
    } else {
        let collapsed_w = get_capsule_half_width(active_task_count) * 2.0;
        (collapsed_w * EXPANSION_FACTOR).min(safe_mon_width - 2.0 * SCREEN_MARGIN)
    };
    let half_w = target_w / 2.0;

    let min_left = SCREEN_MARGIN;
    let max_right = safe_mon_width - SCREEN_MARGIN;

    let mut left = anchor_x - half_w;
    let mut right = anchor_x + half_w;

    if left < min_left {
        left = min_left;
        right = (min_left + target_w).min(max_right);
    } else if right > max_right {
        right = max_right;
        left = (max_right - target_w).max(min_left);
    }

    let center = (left + right) / 2.0;
    (left, right, center)
}

/// Checks if the cursor is within the physical interactive bounds of the expanded capsule.
pub fn is_cursor_in_expanded_capsule(
    rel_x: f32,
    rel_y: f32,
    left: f32,
    right: f32,
    is_media_mode: bool,
    media_custom_height: Option<f32>,
) -> bool {
    let max_y = if is_media_mode {
        media_custom_height.unwrap_or(DEFAULT_MEDIA_HEIGHT) + 8.0
    } else {
        42.0
    };
    rel_y >= 0.0 && rel_y <= max_y && rel_x >= (left - 4.0) && rel_x <= (right + 4.0)
}

/// Checks if the cursor is within the physical interactive bounds of the collapsed capsule.
pub fn is_cursor_in_capsule(rel_x: f32, rel_y: f32, anchor_x: f32, active_task_count: usize) -> bool {
    let half_width = get_capsule_half_width(active_task_count);
    rel_y >= 0.0 && rel_y <= 38.0 && (rel_x - anchor_x).abs() <= half_width
}

/// Checks if the cursor is within the physical bounds of the tiny visible protrusion (28x4px).
pub fn is_cursor_in_protrusion(
    rel_x: f32,
    rel_y: f32,
    anchor_x: f32,
    config: &ProximityConfig,
) -> bool {
    rel_y >= 0.0 && rel_y <= config.entry_y_threshold && (rel_x - anchor_x).abs() <= config.entry_radius
}

/// Determines the progressive proximity level.
pub fn determine_proximity_level(
    dy: f32,
    dx_to_anchor: f32,
    config: &ProximityConfig,
) -> ProximityLevel {
    if dy > config.top_proximity_threshold || dy < 0.0 {
        ProximityLevel::Idle
    } else if is_cursor_in_protrusion(dx_to_anchor, dy, 0.0, config) {
        ProximityLevel::Hovered
    } else if dy <= config.near_threshold {
        ProximityLevel::Near
    } else {
        ProximityLevel::Approaching
    }
}

/// Starts the lightweight background pointer-tracking and proximity detector with dynamic input pass-through.
pub fn start_proximity_detector(
    window: WebviewWindow,
    is_running: Arc<AtomicBool>,
    is_anchor_locked: Arc<AtomicBool>,
    is_capsule_expanded: Arc<AtomicBool>,
    is_media_mode: Arc<AtomicBool>,
    dynamic_expanded_width: Arc<Mutex<Option<f32>>>,
    dynamic_expanded_height: Arc<Mutex<Option<f32>>>,
    task_manager: TaskManager,
    config: ProximityConfig,
) {
    thread::spawn(move || {
        let mut current_level = ProximityLevel::Idle;
        let mut last_anchor_x = 0.0f32;
        let mut last_offset_x = 120.0f32;
        let mut pending_downgrade: Option<(ProximityLevel, Instant)> = None;

        // Tracks input transparency to prevent redundant OS system calls
        let mut last_ignore: Option<bool> = None;
        let mut update_ignore = |ignore: bool| {
            if last_ignore != Some(ignore) {
                last_ignore = Some(ignore);
                let _ = window.set_ignore_cursor_events(ignore);
            }
        };

        // Poll active tasks and background contrast at sensible intervals (250ms)
        let mut last_task_poll = Instant::now() - Duration::from_secs(1);
        let mut cached_tasks: Vec<ActiveTask> = Vec::new();
        let mut cached_contrast = ContrastMode::DarkBg;

        // Start with input pass-through active so desktop and Chrome tabs are 100% interactive
        update_ignore(true);

        println!("[NovaIsland] Smart capsule proximity detector thread started.");

        while is_running.load(Ordering::Relaxed) {
            if let Ok(Some(monitor)) = window.primary_monitor() {
                let monitor_pos = monitor.position();
                let monitor_size = monitor.size();
                let scale = monitor.scale_factor();

                if let Some((raw_x, raw_y)) = get_cursor_position() {
                    let rel_x = (raw_x - monitor_pos.x) as f32 / scale as f32;
                    let rel_y = (raw_y - monitor_pos.y) as f32 / scale as f32;
                    let mon_width = monitor_size.width as f32 / scale as f32;

                    // Periodic poll for media sessions and adaptive contrast
                    if last_task_poll.elapsed() >= Duration::from_millis(250) {
                        last_task_poll = Instant::now();
                        cached_tasks = task_manager.get_active_tasks();
                        let sample_x = monitor_pos.x + (last_anchor_x * scale as f32).round() as i32;
                        cached_contrast = get_adaptive_contrast_mode(sample_x, monitor_pos.y + 20);
                    }

                    let locked = is_anchor_locked.load(Ordering::Relaxed);
                    let is_expanded = is_capsule_expanded.load(Ordering::Relaxed);
                    let is_media = is_media_mode.load(Ordering::Relaxed);

                    if locked || is_expanded {
                        let dyn_width = dynamic_expanded_width.lock().ok().and_then(|g| *g);
                        let dyn_height = dynamic_expanded_height.lock().ok().and_then(|g| *g);

                        // While locked/expanded at anchor X, calculate interactive bounds
                        let (exp_left, exp_right, _exp_center) =
                            compute_expanded_bounds(last_anchor_x, cached_tasks.len(), is_media, dyn_width, mon_width);

                        let in_capsule = if is_expanded {
                            is_cursor_in_expanded_capsule(rel_x, rel_y, exp_left, exp_right, is_media, dyn_height)
                        } else {
                            is_cursor_in_capsule(rel_x, rel_y, last_anchor_x, cached_tasks.len())
                        };

                        // If cursor is inside: interact. Outside: pass clicks directly through to Chrome/desktop!
                        update_ignore(!in_capsule);

                        // Auto-unlock/collapse if cursor moves far away from the capsule
                        let is_far_away = if is_expanded {
                            let base_height = if is_media { dyn_height.unwrap_or(DEFAULT_MEDIA_HEIGHT) } else { 34.0 };
                            let max_leave_y = base_height + 26.0;
                            rel_y > max_leave_y
                                || rel_x < (exp_left - 30.0)
                                || rel_x > (exp_right + 30.0)
                                || rel_y < -20.0
                        } else {
                            let dx = (rel_x - last_anchor_x).abs();
                            rel_y > config.leave_threshold || dx > 110.0 || rel_y < -20.0
                        };

                        if is_far_away {
                            is_anchor_locked.store(false, Ordering::Relaxed);
                            is_capsule_expanded.store(false, Ordering::Relaxed);
                            is_media_mode.store(false, Ordering::Relaxed);
                            if let Ok(mut lock) = dynamic_expanded_width.lock() {
                                *lock = None;
                            }
                            if let Ok(mut lock) = dynamic_expanded_height.lock() {
                                *lock = None;
                            }
                            update_ignore(true);
                            if let Ok(Some(monitor)) = window.primary_monitor() {
                                let monitor_pos = monitor.position();
                                let monitor_size = monitor.size();
                                let scale = monitor.scale_factor();
                                let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(
                                    monitor_size.width,
                                    (100.0 * scale).round() as u32,
                                )));
                                let _ = window.set_position(Position::Physical(PhysicalPosition {
                                    x: monitor_pos.x,
                                    y: monitor_pos.y,
                                }));
                            }

                            current_level = if rel_y <= config.top_proximity_threshold && rel_y >= 0.0 {
                                if rel_y <= config.near_threshold {
                                    ProximityLevel::Near
                                } else {
                                    ProximityLevel::Approaching
                                }
                            } else {
                                ProximityLevel::Idle
                            };

                            let _ = window.emit("nova-collapse", ());
                            let _ = window.emit(
                                "nova-proximity",
                                ProximityPayload {
                                    level: current_level,
                                    cursor_x: rel_x,
                                    cursor_y: rel_y,
                                    anchor_x: last_anchor_x,
                                    offset_x: last_offset_x,
                                    monitor_width: mon_width,
                                    is_locked: false,
                                    is_expanded: false,
                                    expansion_mode: "none".to_string(),
                                    contrast_mode: cached_contrast,
                                    active_tasks: cached_tasks.clone(),
                                },
                            );
                        }
                    } else {
                        // Unlocked: Track pointer across the entire top edge
                        let dy = rel_y;

                        if dy > config.top_proximity_threshold || dy < 0.0 {
                            // Outside top proximity zone: Idle (invisible) -> 100% desktop click-through
                            update_ignore(true);

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
                                        monitor_width: mon_width,
                                        is_locked: false,
                                        is_expanded: false,
                                        expansion_mode: "none".to_string(),
                                        contrast_mode: cached_contrast,
                                        active_tasks: cached_tasks.clone(),
                                    },
                                );
                            }
                        } else {
                            // Inside top proximity zone: smoothly track pointer horizontal position
                            pending_downgrade = None;

                            let anchor_x = rel_x.clamp(SCREEN_MARGIN, mon_width - SCREEN_MARGIN);
                            last_anchor_x = anchor_x;
                            last_offset_x = anchor_x;

                            // Progressive reveal level based on distance to top edge:
                            let dx_to_anchor = rel_x - anchor_x;
                            let raw_level = determine_proximity_level(dy, dx_to_anchor, &config);

                            if raw_level == ProximityLevel::Hovered {
                                // Entering the protrusion: enable interactions and freeze anchor
                                update_ignore(false);
                                is_anchor_locked.store(true, Ordering::Relaxed);
                            } else {
                                // Preview visible, but cursor is outside the tiny protrusion:
                                // Keep input pass-through active so Chrome tabs & controls receive 100% of clicks!
                                update_ignore(true);
                            }

                            current_level = raw_level;

                            let expansion_str = if is_expanded {
                                if is_media { "media" } else { "standard" }
                            } else {
                                "none"
                            };

                            let _ = window.emit(
                                "nova-proximity",
                                ProximityPayload {
                                    level: current_level,
                                    cursor_x: rel_x,
                                    cursor_y: rel_y,
                                    anchor_x,
                                    offset_x: anchor_x,
                                    monitor_width: mon_width,
                                    is_locked: is_anchor_locked.load(Ordering::Relaxed),
                                    is_expanded: is_capsule_expanded.load(Ordering::Relaxed),
                                    expansion_mode: expansion_str.to_string(),
                                    contrast_mode: cached_contrast,
                                    active_tasks: cached_tasks.clone(),
                                },
                            );
                        }
                    }
                }
            }

            thread::sleep(config.poll_interval);
        }

        println!("[NovaIsland] Smart capsule proximity detector thread terminated.");
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tracking_coordinates_and_clamping() {
        let mon_width = 1920.0f32;

        let (anchor_x, win_x, offset_x) = compute_anchor_and_window(10.0, mon_width);
        assert_eq!(anchor_x, 78.0);
        assert_eq!(win_x, 0.0);
        assert_eq!(offset_x, 78.0);
        assert_eq!(win_x + offset_x, 78.0);

        let (anchor_x, win_x, offset_x) = compute_anchor_and_window(960.0, mon_width);
        assert_eq!(anchor_x, 960.0);
        assert_eq!(win_x, 840.0);
        assert_eq!(offset_x, 120.0);
        assert_eq!(win_x + offset_x, 960.0);
    }

    #[test]
    fn test_dynamic_capsule_half_width() {
        assert_eq!(get_capsule_half_width(0), 46.0); // 92px
        assert_eq!(get_capsule_half_width(1), 68.0); // 136px
        assert_eq!(get_capsule_half_width(2), 86.0); // 172px
        assert_eq!(get_capsule_half_width(3), 104.0); // 208px
    }

    #[test]
    fn test_progressive_reveal_levels_and_no_proximity_opening() {
        let config = ProximityConfig::default();

        assert_eq!(
            determine_proximity_level(150.0, 0.0, &config),
            ProximityLevel::Idle
        );
        assert_eq!(
            determine_proximity_level(70.0, 0.0, &config),
            ProximityLevel::Approaching
        );
        assert_eq!(
            determine_proximity_level(20.0, 0.0, &config),
            ProximityLevel::Near
        );
        assert_eq!(
            determine_proximity_level(5.0, 2.0, &config),
            ProximityLevel::Hovered
        );
    }

    #[test]
    fn test_click_through_hit_test_boundaries() {
        let config = ProximityConfig::default();
        let anchor_x = 960.0f32;

        assert!(is_cursor_in_protrusion(960.0, 4.0, anchor_x, &config));
        assert!(!is_cursor_in_protrusion(960.0, 20.0, anchor_x, &config));

        // 0 active tasks: capsule is ~92px wide (half-width 46px)
        assert!(is_cursor_in_capsule(960.0, 15.0, anchor_x, 0));
        assert!(is_cursor_in_capsule(960.0 + 40.0, 20.0, anchor_x, 0));
        assert!(!is_cursor_in_capsule(960.0 + 55.0, 20.0, anchor_x, 0));

        // 2 active tasks: capsule expands to ~172px wide (half-width 86px)
        assert!(is_cursor_in_capsule(960.0 + 80.0, 20.0, anchor_x, 2));
        assert!(!is_cursor_in_capsule(960.0 + 95.0, 20.0, anchor_x, 2));
    }

    #[test]
    fn test_expanded_capsule_geometry_center() {
        let mon_width = 1920.0f32;
        // 0 active tasks (collapsed width 92px -> 3.5x = 322px, half-width 161px)
        let (left, right, center) = compute_expanded_bounds(960.0, 0, false, None, mon_width);
        assert_eq!(center, 960.0);
        assert_eq!(left, 960.0 - 161.0);
        assert_eq!(right, 960.0 + 161.0);
        assert_eq!(right - left, 322.0);
    }

    #[test]
    fn test_expanded_capsule_geometry_left_corner() {
        let mon_width = 1920.0f32;
        // Anchor near left bezel: anchor_x = 50.0
        let (left, right, center) = compute_expanded_bounds(50.0, 0, false, None, mon_width);
        assert_eq!(left, SCREEN_MARGIN); // Pinned to left margin (10.0)
        assert_eq!(right, 10.0 + 322.0); // 332.0
        assert_eq!(center, (10.0 + 332.0) / 2.0); // 171.0
        assert_eq!(right - left, 322.0);
        assert!(left >= SCREEN_MARGIN);
    }

    #[test]
    fn test_expanded_capsule_geometry_right_corner() {
        let mon_width = 1920.0f32;
        // Anchor near right bezel: anchor_x = 1890.0
        let (left, right, center) = compute_expanded_bounds(1890.0, 0, false, None, mon_width);
        assert_eq!(right, mon_width - SCREEN_MARGIN); // 1910.0
        assert_eq!(left, 1910.0 - 322.0); // 1588.0
        assert_eq!(center, (1588.0 + 1910.0) / 2.0);
        assert_eq!(right - left, 322.0);
        assert!(right <= mon_width - SCREEN_MARGIN);
    }

    #[test]
    fn test_expanded_capsule_factor_3_5() {
        let mon_width = 1920.0f32;
        // 1 active task (collapsed = 136px -> 3.5x = 476px)
        let (left, right, _) = compute_expanded_bounds(960.0, 1, false, None, mon_width);
        assert_eq!(right - left, 476.0);

        // 2 active tasks (collapsed = 172px -> 3.5x = 602px)
        let (left, right, _) = compute_expanded_bounds(960.0, 2, false, None, mon_width);
        assert_eq!(right - left, 602.0);

        // 3 active tasks (collapsed = 208px -> 3.5x = 728px)
        let (left, right, _) = compute_expanded_bounds(960.0, 3, false, None, mon_width);
        assert_eq!(right - left, 728.0);
    }

    #[test]
    fn test_expanded_hit_test_boundaries() {
        let (left, right, _) = compute_expanded_bounds(960.0, 0, false, None, 1920.0);
        // Inside expanded bounds
        assert!(is_cursor_in_expanded_capsule(960.0, 20.0, left, right, false, None));
        assert!(is_cursor_in_expanded_capsule(left, 20.0, left, right, false, None));
        assert!(is_cursor_in_expanded_capsule(right, 20.0, left, right, false, None));

        // Outside expanded bounds (horizontal)
        assert!(!is_cursor_in_expanded_capsule(left - 10.0, 20.0, left, right, false, None));
        assert!(!is_cursor_in_expanded_capsule(right + 10.0, 20.0, left, right, false, None));

        // Outside expanded bounds (vertical)
        assert!(!is_cursor_in_expanded_capsule(960.0, 50.0, left, right, false, None));
    }

    #[test]
    fn test_media_expanded_bounds_center() {
        let mon_width = 1920.0f32;
        // Content-adaptive: test compact width 280px
        let (left, right, center) = compute_expanded_bounds(960.0, 1, true, Some(280.0), mon_width);
        assert_eq!(center, 960.0);
        assert_eq!(left, 960.0 - 140.0);
        assert_eq!(right, 960.0 + 140.0);
        assert_eq!(right - left, 280.0);

        // Content-adaptive: test wide width 480px
        let (left_w, right_w, center_w) = compute_expanded_bounds(960.0, 1, true, Some(480.0), mon_width);
        assert_eq!(center_w, 960.0);
        assert_eq!(right_w - left_w, 480.0);
    }

    #[test]
    fn test_media_expanded_bounds_left_corner() {
        let mon_width = 1920.0f32;
        // Anchor near left bezel: anchor_x = 50.0 with 300px width
        let (left, right, center) = compute_expanded_bounds(50.0, 1, true, Some(300.0), mon_width);
        assert_eq!(left, SCREEN_MARGIN); // 10.0
        assert_eq!(right, 10.0 + 300.0); // 310.0
        assert_eq!(center, (10.0 + 310.0) / 2.0); // 160.0
        assert_eq!(right - left, 300.0);
    }

    #[test]
    fn test_media_expanded_bounds_right_corner() {
        let mon_width = 1920.0f32;
        // Anchor near right bezel: anchor_x = 1890.0 with 320px width
        let (left, right, center) = compute_expanded_bounds(1890.0, 1, true, Some(320.0), mon_width);
        assert_eq!(right, mon_width - SCREEN_MARGIN); // 1910.0
        assert_eq!(left, 1910.0 - 320.0); // 1590.0
        assert_eq!(center, (1590.0 + 1910.0) / 2.0);
        assert_eq!(right - left, 320.0);
    }

    #[test]
    fn test_media_hit_test_boundaries() {
        let (left, right, _) = compute_expanded_bounds(960.0, 1, true, Some(340.0), 1920.0);
        // Base height (60px) -> max_y is 68.0
        assert!(is_cursor_in_expanded_capsule(960.0, 55.0, left, right, true, Some(60.0)));
        assert!(is_cursor_in_expanded_capsule(left, 30.0, left, right, true, Some(60.0)));
        assert!(is_cursor_in_expanded_capsule(right, 30.0, left, right, true, Some(60.0)));

        // Taller height (74px) -> max_y is 82.0
        assert!(is_cursor_in_expanded_capsule(960.0, 80.0, left, right, true, Some(74.0)));

        // Outside media bounds (vertical > 82)
        assert!(!is_cursor_in_expanded_capsule(960.0, 90.0, left, right, true, Some(74.0)));
        // Outside media bounds (horizontal)
        assert!(!is_cursor_in_expanded_capsule(left - 10.0, 30.0, left, right, true, Some(60.0)));
    }

    #[test]
    fn test_media_true_content_adaptive_width_without_arbitrary_caps() {
        let mon_width = 1920.0f32;
        // Test wide track title requiring 680px width: expands smoothly beyond legacy 560px cap
        let (left, right, center) = compute_expanded_bounds(960.0, 1, true, Some(680.0), mon_width);
        assert_eq!(center, 960.0);
        assert_eq!(right - left, 680.0);
        assert_eq!(left, 960.0 - 340.0);
        assert_eq!(right, 960.0 + 340.0);

        // Test very wide track title requiring 820px width
        let (left_wide, right_wide, center_wide) = compute_expanded_bounds(960.0, 1, true, Some(820.0), mon_width);
        assert_eq!(center_wide, 960.0);
        assert_eq!(right_wide - left_wide, 820.0);
        assert!(left_wide >= SCREEN_MARGIN);
        assert!(right_wide <= mon_width - SCREEN_MARGIN);

        // Clamping to screen width margin (1920 - 20 = 1900 max allowable)
        let (left_max, right_max, _) = compute_expanded_bounds(960.0, 1, true, Some(2200.0), mon_width);
        assert_eq!(right_max - left_max, 1900.0);
        assert_eq!(left_max, SCREEN_MARGIN);
        assert_eq!(right_max, mon_width - SCREEN_MARGIN);
    }

    #[test]
    fn test_media_true_content_adaptive_height_and_hit_testing() {
        let mon_width = 1920.0f32;
        let (left, right, _) = compute_expanded_bounds(960.0, 1, true, Some(500.0), mon_width);

        // 3-line wrapped title or extra content stack: height 88px -> max_y is 96.0
        assert!(is_cursor_in_expanded_capsule(960.0, 94.0, left, right, true, Some(88.0)));
        assert!(!is_cursor_in_expanded_capsule(960.0, 98.0, left, right, true, Some(88.0)));

        // Large expanded content: height 96px -> max_y is 104.0
        assert!(is_cursor_in_expanded_capsule(960.0, 102.0, left, right, true, Some(96.0)));
        assert!(!is_cursor_in_expanded_capsule(960.0, 106.0, left, right, true, Some(96.0)));

        // Extra tall content: height 110px -> max_y is 118.0
        assert!(is_cursor_in_expanded_capsule(960.0, 115.0, left, right, true, Some(110.0)));
        assert!(!is_cursor_in_expanded_capsule(960.0, 120.0, left, right, true, Some(110.0)));
    }

    #[test]
    fn test_music_player_panel_hit_testing() {
        let mon_width = 1920.0f32;
        let (left, right, center) = compute_expanded_bounds(960.0, 1, true, Some(390.0), mon_width);
        assert_eq!(center, 960.0);
        assert_eq!(right - left, 390.0);

        // State B: Base music player panel height (212px) -> max_y is 220.0
        assert!(is_cursor_in_expanded_capsule(960.0, 215.0, left, right, true, Some(212.0)));
        assert!(!is_cursor_in_expanded_capsule(960.0, 225.0, left, right, true, Some(212.0)));

        // State C: Expanded device menu height (334px) -> max_y is 342.0
        assert!(is_cursor_in_expanded_capsule(960.0, 338.0, left, right, true, Some(334.0)));
        assert!(!is_cursor_in_expanded_capsule(960.0, 345.0, left, right, true, Some(334.0)));

        // Pass-through horizontally outside the 390px panel
        assert!(!is_cursor_in_expanded_capsule(left - 10.0, 100.0, left, right, true, Some(212.0)));
        assert!(!is_cursor_in_expanded_capsule(right + 10.0, 100.0, left, right, true, Some(212.0)));
    }
}
