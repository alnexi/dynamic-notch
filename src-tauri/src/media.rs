use serde::Serialize;
use windows::Media::Control::{
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
    let session = manager.GetCurrentSession().ok()?;
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

    if let Ok(async_props) = session.TryGetMediaPropertiesAsync() {
        if let Ok(props) = async_props.join() {
            if let Ok(t) = props.Title() {
                title = t.to_string_lossy();
            }
            if let Ok(a) = props.Artist() {
                artist = a.to_string_lossy();
            }

            // Extract album artwork thumbnail if available
            if let Ok(thumb_ref) = props.Thumbnail() {
                if let Ok(async_stream) = thumb_ref.OpenReadAsync() {
                    if let Ok(stream) = async_stream.join() {
                        if let Ok(size) = stream.Size() {
                            if size > 0 && size <= 2 * 1024 * 1024 {
                                if let Ok(reader) = DataReader::CreateDataReader(&stream) {
                                    if let Ok(load_op) = reader.LoadAsync(size as u32) {
                                        if load_op.join().is_ok() {
                                            let mut bytes = vec![0u8; size as usize];
                                            if reader.ReadBytes(&mut bytes).is_ok() {
                                                let encoded = base64_encode(&bytes);
                                                thumbnail_base64 = Some(format!("data:image/jpeg;base64,{}", encoded));
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
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
    })
}
