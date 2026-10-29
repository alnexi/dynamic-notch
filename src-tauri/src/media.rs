use serde::Serialize;
use std::sync::Mutex;
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession,
    GlobalSystemMediaTransportControlsSessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus,
};
use windows::Storage::Streams::DataReader;

#[derive(Debug, Clone, Serialize, Default)]
pub struct MediaSessionInfo {
    pub is_playing: bool,
    pub title: String,
    pub artist: String,
    pub source_app: String,
    pub playback_status: String,
    pub thumbnail_base64: Option<String>,
    pub position_seconds: Option<f64>,
    pub duration_seconds: Option<f64>,
}

/// Cache holding (track_identifier_key, cached_thumbnail_base64) to avoid
/// re-reading large thumbnail streams (e.g. 2.5MB+ BMP/JPEG) on every 250ms tick.
static THUMBNAIL_CACHE: Mutex<Option<(String, Option<String>)>> = Mutex::new(None);

/// Identifies the active media session, falling back to any Playing or Paused
/// session in GetSessions() if GetCurrentSession() returns None.
fn get_best_session(
    manager: &GlobalSystemMediaTransportControlsSessionManager,
) -> Option<GlobalSystemMediaTransportControlsSession> {
    if let Ok(session) = manager.GetCurrentSession() {
        return Some(session);
    }
    if let Ok(sessions) = manager.GetSessions() {
        let mut fallback = None;
        for s in sessions {
            if let Ok(info) = s.GetPlaybackInfo() {
                if let Ok(status) = info.PlaybackStatus() {
                    if status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing {
                        return Some(s);
                    } else if status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Paused && fallback.is_none() {
                        fallback = Some(s);
                    }
                }
            }
        }
        if fallback.is_some() {
            return fallback;
        }
    }
    None
}

pub fn media_play_pause() -> bool {
    let Ok(async_op) = GlobalSystemMediaTransportControlsSessionManager::RequestAsync() else { return false; };
    let Ok(manager) = async_op.join() else { return false; };
    let Some(session) = get_best_session(&manager) else { return false; };
    if let Ok(op) = session.TryTogglePlayPauseAsync() {
        op.join().unwrap_or(false)
    } else {
        false
    }
}

pub fn media_next() -> bool {
    let Ok(async_op) = GlobalSystemMediaTransportControlsSessionManager::RequestAsync() else { return false; };
    let Ok(manager) = async_op.join() else { return false; };
    let Some(session) = get_best_session(&manager) else { return false; };
    if let Ok(op) = session.TrySkipNextAsync() {
        op.join().unwrap_or(false)
    } else {
        false
    }
}

pub fn media_previous() -> bool {
    let Ok(async_op) = GlobalSystemMediaTransportControlsSessionManager::RequestAsync() else { return false; };
    let Ok(manager) = async_op.join() else { return false; };
    let Some(session) = get_best_session(&manager) else { return false; };
    if let Ok(op) = session.TrySkipPreviousAsync() {
        op.join().unwrap_or(false)
    } else {
        false
    }
}

const B64_CHARS: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn base64_encode(data: &[u8]) -> String {
    let mut result = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0];
        let b1 = if chunk.len() > 1 { chunk[1] } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] } else { 0 };
        result.push(B64_CHARS[(b0 >> 2) as usize] as char);
        result.push(B64_CHARS[(((b0 & 3) << 4) | (b1 >> 4)) as usize] as char);
        if chunk.len() > 1 {
            result.push(B64_CHARS[(((b1 & 0xF) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(B64_CHARS[(b2 & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

pub fn get_current_media_session() -> Option<MediaSessionInfo> {
    let async_op = GlobalSystemMediaTransportControlsSessionManager::RequestAsync().ok()?;
    let manager = async_op.join().ok()?;
    let session = get_best_session(&manager)?;
    let playback_info = session.GetPlaybackInfo().ok()?;
    let status = playback_info.PlaybackStatus().ok()?;

    let is_playing = status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing;
    let status_str = match status {
        GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing => "playing",
        GlobalSystemMediaTransportControlsSessionPlaybackStatus::Paused => "paused",
        GlobalSystemMediaTransportControlsSessionPlaybackStatus::Stopped => "stopped",
        _ => "idle",
    };

    let source_app = session
        .SourceAppUserModelId()
        .map(|h| h.to_string_lossy())
        .unwrap_or_default();

    let mut title = String::new();
    let mut artist = String::new();
    let mut thumbnail_base64 = None;
    let mut position_seconds = None;
    let mut duration_seconds = None;

    if let Ok(timeline) = session.GetTimelineProperties() {
        if let Ok(pos) = timeline.Position() {
            let sec = pos.Duration as f64 / 10_000_000.0;
            if sec >= 0.0 {
                position_seconds = Some(sec);
            }
        }
        if let Ok(end) = timeline.EndTime() {
            let sec = end.Duration as f64 / 10_000_000.0;
            if sec > 0.0 {
                duration_seconds = Some(sec);
            }
        }
    }

    if let Ok(async_props) = session.TryGetMediaPropertiesAsync() {
        if let Ok(props) = async_props.join() {
            if let Ok(t) = props.Title() {
                title = t.to_string_lossy();
            }
            if let Ok(a) = props.Artist() {
                artist = a.to_string_lossy();
            }

            let track_key = format!("{}|{}|{}", source_app, title, artist);

            // Check in-memory thumbnail cache first
            let mut cache_hit = false;
            if let Ok(lock) = THUMBNAIL_CACHE.lock() {
                if let Some((ref cached_key, ref cached_thumb)) = *lock {
                    if cached_key == &track_key {
                        thumbnail_base64 = cached_thumb.clone();
                        cache_hit = true;
                    }
                }
            }

            // If not cached, retrieve album artwork thumbnail from GSMTC
            if !cache_hit {
                let mut fetched_thumb = None;
                if let Ok(thumb_ref) = props.Thumbnail() {
                    if let Ok(async_stream) = thumb_ref.OpenReadAsync() {
                        if let Ok(stream) = async_stream.join() {
                            if let Ok(size) = stream.Size() {
                                // Support up to 15MB for uncompressed BMP/high-res artwork
                                if size > 0 && size <= 15 * 1024 * 1024 {
                                    let content_type = stream
                                        .ContentType()
                                        .map(|h| h.to_string_lossy())
                                        .unwrap_or_default();

                                    if let Ok(reader) = DataReader::CreateDataReader(&stream) {
                                        if let Ok(load_op) = reader.LoadAsync(size as u32) {
                                            if load_op.join().is_ok() {
                                                let mut bytes = vec![0u8; size as usize];
                                                if reader.ReadBytes(&mut bytes).is_ok() {
                                                    // Detect MIME type from ContentType or binary magic bytes
                                                    let mime = if !content_type.is_empty() && content_type.starts_with("image/") {
                                                        content_type
                                                    } else if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
                                                        "image/png".to_string()
                                                    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
                                                        "image/jpeg".to_string()
                                                    } else if bytes.starts_with(b"RIFF") && bytes.len() >= 12 && &bytes[8..12] == b"WEBP" {
                                                        "image/webp".to_string()
                                                    } else if bytes.starts_with(b"GIF8") {
                                                        "image/gif".to_string()
                                                    } else if bytes.starts_with(b"BM") {
                                                        "image/bmp".to_string()
                                                    } else {
                                                        "image/jpeg".to_string()
                                                    };
                                                    let encoded = base64_encode(&bytes);
                                                    fetched_thumb = Some(format!("data:{};base64,{}", mime, encoded));
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                thumbnail_base64 = fetched_thumb.clone();
                if let Ok(mut lock) = THUMBNAIL_CACHE.lock() {
                    *lock = Some((track_key, fetched_thumb));
                }
            }
        }
    }

    Some(MediaSessionInfo {
        is_playing,
        title,
        artist,
        source_app,
        playback_status: status_str.to_string(),
        thumbnail_base64,
        position_seconds,
        duration_seconds,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_live_media_session() {
        let session = get_current_media_session();
        if let Some(ref s) = session {
            println!(
                "TEST LIVE MEDIA: title='{}', artist='{}', app='{}', is_playing={}, thumb_len={:?}",
                s.title,
                s.artist,
                s.source_app,
                s.is_playing,
                s.thumbnail_base64.as_ref().map(|t| t.len())
            );
        } else {
            println!("TEST LIVE MEDIA: None");
        }
    }

    #[test]
    fn test_base64_encode() {
        let sample = b"Nova Island Media Artwork Test";
        let encoded = base64_encode(sample);
        assert!(!encoded.is_empty());
    }

    #[test]
    fn test_thumbnail_cache_reuse() {
        // Prime the cache
        {
            let mut lock = THUMBNAIL_CACHE.lock().unwrap();
            *lock = Some(("test_app|test_title|test_artist".to_string(), Some("data:image/png;base64,abc".to_string())));
        }
        // Check cache contents
        let lock = THUMBNAIL_CACHE.lock().unwrap();
        assert!(lock.is_some());
        let (key, val) = lock.as_ref().unwrap();
        assert_eq!(key, "test_app|test_title|test_artist");
        assert_eq!(val.as_deref(), Some("data:image/png;base64,abc"));
    }
}

