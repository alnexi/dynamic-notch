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

/// Proximity level representing the cursor distance to the top-center island.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProximityLevel {
    Idle = 0,
    Approaching = 1,
    Near = 2,
    Hovered = 3,
}

/// Event payload emitted to the frontend when proximity level changes.
#[derive(Debug, Clone, Copy, serde::Serialize)]
pub struct ProximityPayload {
    pub level: ProximityLevel,
    pub distance: f32,
    pub dx: f32,
    pub dy: f32,
}

/// Configuration thresholds in logical pixels.
pub struct ProximityConfig {
    pub hovered_threshold: f32,
    pub near_threshold: f32,
    pub approaching_threshold: f32,
    pub aspect_ratio: f32,
    pub poll_interval: Duration,
    pub leave_delay: Duration,
}

impl Default for ProximityConfig {
    fn default() -> Self {
        Self {
            hovered_threshold: 45.0,
            near_threshold: 120.0,
            approaching_threshold: 240.0,
            aspect_ratio: 1.6,
            poll_interval: Duration::from_millis(30),
            leave_delay: Duration::from_millis(200),
        }
    }
}

/// Computes the effective elliptical distance and raw proximity level
/// given horizontal distance `dx` from island center and vertical distance `dy` from top edge.
pub fn compute_proximity(dx: f32, dy: f32, config: &ProximityConfig) -> (ProximityLevel, f32) {
    let effective_dist = ((dx / config.aspect_ratio).powi(2) + dy.powi(2)).sqrt();
    let is_in_droplet = dx <= 42.0 && dy <= 45.0;

    let level = if is_in_droplet || effective_dist <= config.hovered_threshold {
        ProximityLevel::Hovered
    } else if effective_dist <= config.near_threshold {
        ProximityLevel::Near
    } else if effective_dist <= config.approaching_threshold {
        ProximityLevel::Approaching
    } else {
        ProximityLevel::Idle
    };

    (level, effective_dist)
}

/// Starts the lightweight background proximity detector.
pub fn start_proximity_detector(
    window: WebviewWindow,
    is_running: Arc<AtomicBool>,
    config: ProximityConfig,
) {
    thread::spawn(move || {
        let mut current_level = ProximityLevel::Idle;
        let mut pending_downgrade: Option<(ProximityLevel, Instant)> = None;

        println!("[NovaIsland] Proximity detector thread started.");

        while is_running.load(Ordering::Relaxed) {
            // Get monitor properties
            if let Ok(Some(monitor)) = window.primary_monitor() {
                let monitor_pos = monitor.position();
                let monitor_size = monitor.size();
                let scale_factor = monitor.scale_factor();

                if let Some((raw_x, raw_y)) = get_cursor_position() {
                    // Coordinates relative to primary monitor in logical pixels
                    let rel_x = (raw_x - monitor_pos.x) as f32 / scale_factor as f32;
                    let rel_y = (raw_y - monitor_pos.y) as f32 / scale_factor as f32;
                    let island_center_x = (monitor_size.width as f32 / scale_factor as f32) / 2.0;

                    let dx = (rel_x - island_center_x).abs();
                    let dy = rel_y.max(0.0);

                    let (raw_level, effective_dist) = compute_proximity(dx, dy, &config);

                    // Handle hysteresis / cooldown when stepping down
                    let next_level = if raw_level >= current_level {
                        // Immediately step up to higher proximity (instant responsiveness)
                        pending_downgrade = None;
                        raw_level
                    } else {
                        // Stepping down: apply leave_delay hysteresis
                        let now = Instant::now();
                        match pending_downgrade {
                            Some((target, expire_at)) if target == raw_level => {
                                if now >= expire_at {
                                    pending_downgrade = None;
                                    raw_level
                                } else {
                                    current_level
                                }
                            }
                            _ => {
                                pending_downgrade = Some((raw_level, now + config.leave_delay));
                                current_level
                            }
                        }
                    };

                    // Only emit when the active proximity level transitions
                    if next_level != current_level {
                        current_level = next_level;
                        println!(
                            "[NovaIsland] Proximity level changed: {:?} (dist: {:.1}px, dx: {:.1}px, dy: {:.1}px)",
                            current_level, effective_dist, dx, dy
                        );
                        let payload = ProximityPayload {
                            level: current_level,
                            distance: effective_dist,
                            dx,
                            dy,
                        };
                        let _ = window.emit("nova-proximity", payload);
                    }
                }
            }

            thread::sleep(config.poll_interval);
        }

        println!("[NovaIsland] Proximity detector thread terminated cleanly.");
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_distance_thresholds() {
        let config = ProximityConfig::default();

        // 1. Right on the island (dx = 0, dy = 10) -> Hovered
        let (level, dist) = compute_proximity(0.0, 10.0, &config);
        assert_eq!(level, ProximityLevel::Hovered);
        assert!(dist <= 45.0);

        // 2. Near region (dx = 40, dy = 70) -> Near
        let (level, dist) = compute_proximity(40.0, 70.0, &config);
        assert_eq!(level, ProximityLevel::Near);
        assert!(dist > 45.0 && dist <= 120.0);

        // 3. Approaching region (dx = 150, dy = 120) -> Approaching
        let (level, dist) = compute_proximity(150.0, 120.0, &config);
        assert_eq!(level, ProximityLevel::Approaching);
        assert!(dist > 120.0 && dist <= 240.0);

        // 4. Far Left of screen on a 1920 display (dx = 960, dy = 0) -> Idle
        let (level, dist) = compute_proximity(960.0, 0.0, &config);
        assert_eq!(level, ProximityLevel::Idle);
        assert_eq!(dist, 600.0); // 960 / 1.6 = 600.0

        // 5. Far Right of screen on a 1920 display (dx = 960, dy = 0) -> Idle
        let (level, dist) = compute_proximity(960.0, 0.0, &config);
        assert_eq!(level, ProximityLevel::Idle);
        assert_eq!(dist, 600.0);

        // 6. Center bottom of screen on a 1080 display (dx = 0, dy = 1080) -> Idle
        let (level, dist) = compute_proximity(0.0, 1080.0, &config);
        assert_eq!(level, ProximityLevel::Idle);
        assert_eq!(dist, 1080.0);
    }
}
