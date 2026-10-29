import React, { useState, useEffect } from "react";
import { ActiveTask, ContrastMode } from "../types/tasks";
import { Clock } from "./Clock";
import { TaskIcon } from "./TaskIcon";

interface MediaIslandProps {
  mediaTask: ActiveTask;
  rightTasks: ActiveTask[];
  contrastMode: ContrastMode;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function MediaIsland({ mediaTask, rightTasks, contrastMode }: MediaIslandProps) {
  // Local optimistic playback tracking between 250ms backend polls
  const isPlaying = mediaTask.is_playing ?? false;
  const [currentPos, setCurrentPos] = useState<number>(mediaTask.position_seconds ?? 0);
  const [imgError, setImgError] = useState<boolean>(false);

  // Reset imgError whenever the artwork URL/data URI changes
  useEffect(() => {
    setImgError(false);
  }, [mediaTask.icon_base64]);

  useEffect(() => {
    if (typeof mediaTask.position_seconds === "number") {
      setCurrentPos(mediaTask.position_seconds);
    }
  }, [mediaTask.position_seconds]);

  // Smoothly advance playback timer while actively playing
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentPos((prev) => {
        if (typeof mediaTask.duration_seconds === "number" && prev >= mediaTask.duration_seconds) {
          return prev;
        }
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, mediaTask.duration_seconds]);

  const handlePlayPause = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("media_play_pause");
    } catch (err) {
      console.warn("Failed to toggle play/pause:", err);
    }
  };

  const handleNext = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("media_next");
    } catch (err) {
      console.warn("Failed to skip next track:", err);
    }
  };

  const handlePrev = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("media_previous");
    } catch (err) {
      console.warn("Failed to skip previous track:", err);
    }
  };

  const hasDuration = typeof mediaTask.duration_seconds === "number" && mediaTask.duration_seconds > 0;
  const dur = mediaTask.duration_seconds ?? 0;
  const progressPercent = hasDuration ? Math.min(100, Math.max(0, (currentPos / dur) * 100)) : 0;

  return (
    <div className={`media-island-layout contrast-${contrastMode}`}>
      {/* 
        1. Large Album Artwork on the Left:
        - Occupies full vertical area (48x48px in 60px capsule with 6px inset).
        - Controlled rounded-rectangle corners (--media-artwork-radius: 10px) visually matching capsule curvature.
        - Graceful fallback with zero broken image artifacts on load error.
      */}
      <div className="media-artwork-container">
        {mediaTask.icon_base64 && !imgError ? (
          <img
            src={mediaTask.icon_base64}
            alt={mediaTask.title}
            className="media-artwork-img"
            loading="eager"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="media-artwork-fallback" title="No album artwork available">
            <svg viewBox="0 0 24 24" fill="currentColor" className="media-artwork-fallback-icon">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
          </div>
        )}
      </div>

      {/* 
        2. Track Details & Playback Controls immediately to the RIGHT of the artwork:
        - Never placed underneath the artwork.
        - Title, Artist, Progress Bar, and Real Playback Controls.
      */}
      <div className="media-controls-container">
        <div className="media-track-info">
          <div className="media-title" title={mediaTask.title}>
            {mediaTask.title || "Unknown Track"}
          </div>
          <div className="media-artist" title={mediaTask.subtitle || ""}>
            {mediaTask.subtitle || mediaTask.icon_name || "Unknown Artist"}
          </div>
        </div>

        {/* Playback progress bar with timestamps if available */}
        {hasDuration && (
          <div className="media-progress-bar-wrapper">
            <div className="media-progress-track">
              <div
                className="media-progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="media-time-labels">
              <span>{formatTime(currentPos)}</span>
              <span>{formatTime(dur)}</span>
            </div>
          </div>
        )}

        {/* Playback controls buttons row */}
        <div className="media-buttons-row">
          <button
            type="button"
            className="media-btn media-btn-prev"
            onClick={handlePrev}
            title="Previous track"
            aria-label="Previous track"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
            </svg>
          </button>

          <button
            type="button"
            className="media-btn media-btn-playpause"
            onClick={handlePlayPause}
            title={isPlaying ? "Pause" : "Play"}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <button
            type="button"
            className="media-btn media-btn-next"
            onClick={handleNext}
            title="Next track"
            aria-label="Next track"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* 3. Subtle vertical divider */}
      <div className="media-section-divider" />

      {/* 
        4. Dedicated Clock & Right Status Section:
        - Vertically centered clock.
        - Supported status icons (timers/alarms).
      */}
      <div className="media-right-section">
        <Clock />
        {rightTasks.map((t) => (
          <TaskIcon key={t.id} task={t} />
        ))}
      </div>
    </div>
  );
}
