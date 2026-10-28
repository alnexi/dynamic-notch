use crate::media::get_current_media_session;
use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::time::Instant;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TaskKind {
    Media,
    Timer,
    Alarm,
    #[allow(dead_code)]
    Custom,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TaskSlot {
    Left,
    Right,
}

#[derive(Debug, Clone, Serialize)]
pub struct ActiveTask {
    pub id: String,
    pub kind: TaskKind,
    pub slot: TaskSlot,
    pub title: String,
    pub subtitle: Option<String>,
    pub icon_base64: Option<String>,
    pub icon_name: String,
    pub progress: Option<f32>,
    pub remaining_seconds: Option<u64>,
    pub is_playing: Option<bool>,
    pub position_seconds: Option<f64>,
    pub duration_seconds: Option<f64>,
}

#[derive(Debug, Clone)]
pub struct InternalTimer {
    pub id: String,
    pub label: String,
    pub duration_seconds: u64,
    pub start_time: Instant,
}

#[derive(Debug, Clone)]
pub struct InternalAlarm {
    pub id: String,
    pub label: String,
    pub hour: u32,
    pub minute: u32,
    pub is_enabled: bool,
}

#[derive(Default, Clone)]
pub struct TaskManager {
    pub timers: Arc<Mutex<Vec<InternalTimer>>>,
    pub alarms: Arc<Mutex<Vec<InternalAlarm>>>,
}

impl TaskManager {
    pub fn new() -> Self {
        Self {
            timers: Arc::new(Mutex::new(Vec::new())),
            alarms: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn start_timer(&self, duration_seconds: u64, label: Option<String>) -> String {
        let id = format!("timer_{}", Instant::now().elapsed().as_nanos());
        let timer = InternalTimer {
            id: id.clone(),
            label: label.unwrap_or_else(|| "Timer".to_string()),
            duration_seconds,
            start_time: Instant::now(),
        };
        if let Ok(mut lock) = self.timers.lock() {
            lock.push(timer);
        }
        id
    }

    pub fn cancel_timer(&self, id: &str) -> bool {
        if let Ok(mut lock) = self.timers.lock() {
            let initial_len = lock.len();
            lock.retain(|t| t.id != id);
            lock.len() < initial_len
        } else {
            false
        }
    }

    pub fn set_alarm(&self, hour: u32, minute: u32, label: Option<String>) -> String {
        let id = format!("alarm_{}_{}", hour, minute);
        let alarm = InternalAlarm {
            id: id.clone(),
            label: label.unwrap_or_else(|| format!("{:02}:{:02}", hour, minute)),
            hour,
            minute,
            is_enabled: true,
        };
        if let Ok(mut lock) = self.alarms.lock() {
            lock.retain(|a| a.id != id);
            lock.push(alarm);
        }
        id
    }

    pub fn cancel_alarm(&self, id: &str) -> bool {
        if let Ok(mut lock) = self.alarms.lock() {
            let initial_len = lock.len();
            lock.retain(|a| a.id != id);
            lock.len() < initial_len
        } else {
            false
        }
    }

    /// Queries all currently active tasks from real state sources.
    pub fn get_active_tasks(&self) -> Vec<ActiveTask> {
        let mut active = Vec::new();

        // 1. Query real Windows Media Playback Status
        if let Some(media) = get_current_media_session() {
            if media.is_playing || (!media.title.is_empty() && media.playback_status == "paused") {
                let progress = match (media.position_seconds, media.duration_seconds) {
                    (Some(pos), Some(dur)) if dur > 0.0 => Some((pos / dur).clamp(0.0, 1.0) as f32),
                    _ => None,
                };
                let remaining_seconds = match (media.position_seconds, media.duration_seconds) {
                    (Some(pos), Some(dur)) if dur >= pos => Some((dur - pos) as u64),
                    _ => None,
                };

                active.push(ActiveTask {
                    id: "system_media".to_string(),
                    kind: TaskKind::Media,
                    slot: TaskSlot::Left,
                    title: if !media.title.is_empty() {
                        media.title
                    } else {
                        "Media Playing".to_string()
                    },
                    subtitle: if !media.artist.is_empty() {
                        Some(media.artist)
                    } else {
                        None
                    },
                    icon_base64: media.thumbnail_base64,
                    icon_name: if !media.source_app.is_empty() {
                        media.source_app
                    } else {
                        "media".to_string()
                    },
                    progress,
                    remaining_seconds,
                    is_playing: Some(media.is_playing),
                    position_seconds: media.position_seconds,
                    duration_seconds: media.duration_seconds,
                });
            }
        }

        // 2. Query active running Timers
        if let Ok(mut lock) = self.timers.lock() {
            // Remove expired timers
            lock.retain(|t| t.start_time.elapsed().as_secs() < t.duration_seconds);

            for t in lock.iter() {
                let elapsed = t.start_time.elapsed().as_secs();
                let remaining = t.duration_seconds.saturating_sub(elapsed);
                let progress = if t.duration_seconds > 0 {
                    (elapsed as f32 / t.duration_seconds as f32).clamp(0.0, 1.0)
                } else {
                    1.0
                };

                active.push(ActiveTask {
                    id: t.id.clone(),
                    kind: TaskKind::Timer,
                    slot: TaskSlot::Right,
                    title: t.label.clone(),
                    subtitle: Some(format!("{:02}:{:02}", remaining / 60, remaining % 60)),
                    icon_base64: None,
                    icon_name: "timer".to_string(),
                    progress: Some(progress),
                    remaining_seconds: Some(remaining),
                    is_playing: None,
                    position_seconds: None,
                    duration_seconds: None,
                });
            }
        }

        // 3. Query active Alarms
        if let Ok(lock) = self.alarms.lock() {
            for a in lock.iter().filter(|a| a.is_enabled) {
                active.push(ActiveTask {
                    id: a.id.clone(),
                    kind: TaskKind::Alarm,
                    slot: TaskSlot::Right,
                    title: a.label.clone(),
                    subtitle: Some(format!("{:02}:{:02}", a.hour, a.minute)),
                    icon_base64: None,
                    icon_name: "alarm".to_string(),
                    progress: None,
                    remaining_seconds: None,
                    is_playing: None,
                    position_seconds: None,
                    duration_seconds: None,
                });
            }
        }

        active
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_task_manager_timer_lifecycle() {
        let manager = TaskManager::new();
        let initial_timers: Vec<_> = manager.get_active_tasks().into_iter().filter(|t| t.kind == TaskKind::Timer).collect();
        assert_eq!(initial_timers.len(), 0);

        let id = manager.start_timer(120, Some("Focus Timer".to_string()));
        let tasks: Vec<_> = manager.get_active_tasks().into_iter().filter(|t| t.kind == TaskKind::Timer).collect();
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].id, id);
        assert_eq!(tasks[0].kind, TaskKind::Timer);
        assert_eq!(tasks[0].slot, TaskSlot::Right);
        assert_eq!(tasks[0].title, "Focus Timer");
        assert!(tasks[0].remaining_seconds.unwrap() <= 120);

        assert!(manager.cancel_timer(&id));
        let remaining_timers: Vec<_> = manager.get_active_tasks().into_iter().filter(|t| t.kind == TaskKind::Timer).collect();
        assert_eq!(remaining_timers.len(), 0);
    }

    #[test]
    fn test_task_manager_alarm_lifecycle() {
        let manager = TaskManager::new();
        let alarm_id = manager.set_alarm(7, 30, Some("Morning Alarm".to_string()));

        let tasks: Vec<_> = manager.get_active_tasks().into_iter().filter(|t| t.kind == TaskKind::Alarm).collect();
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].id, alarm_id);
        assert_eq!(tasks[0].kind, TaskKind::Alarm);
        assert_eq!(tasks[0].slot, TaskSlot::Right);
        assert_eq!(tasks[0].title, "Morning Alarm");
        assert_eq!(tasks[0].subtitle.as_deref(), Some("07:30"));

        assert!(manager.cancel_alarm(&alarm_id));
        let remaining_alarms: Vec<_> = manager.get_active_tasks().into_iter().filter(|t| t.kind == TaskKind::Alarm).collect();
        assert_eq!(remaining_alarms.len(), 0);
    }
}
