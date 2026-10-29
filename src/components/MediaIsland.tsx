import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { ActiveTask, ContrastMode } from "../types/tasks";
import { Clock } from "./Clock";
import { TaskIcon } from "./TaskIcon";

export interface MediaMeasuredDimensionsPayload {
  naturalTitleWidth: number;
  naturalArtistWidth: number;
  measuredControlsHeight: number;
  measuredRightWidth: number;
}

interface MediaIslandProps {
  mediaTask: ActiveTask;
  rightTasks: ActiveTask[];
  contrastMode: ContrastMode;
  onDimensionsChange?: (dims: MediaMeasuredDimensionsPayload) => void;
  onBannerClick?: () => void;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function MediaIsland({
  mediaTask,
  rightTasks,
  contrastMode,
  onDimensionsChange,
  onBannerClick,
}: MediaIslandProps) {
  // Local optimistic playback tracking between 250ms backend polls
  const isPlaying = mediaTask.is_playing ?? false;
  const [currentPos, setCurrentPos] = useState<number>(mediaTask.position_seconds ?? 0);
  const [imgError, setImgError] = useState<boolean>(false);

  // Measurement refs
  const measTitleRef = useRef<HTMLSpanElement>(null);
  const measArtistRef = useRef<HTMLSpanElement>(null);
  const contentStackRef = useRef<HTMLDivElement>(null);
  const rightSectionRef = useRef<HTMLDivElement>(null);

  const lastReportedDimsRef = useRef({
    titleW: 0,
    artistW: 0,
    controlsH: 0,
    rightW: 0,
  });

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

  // True DOM measurement effect (runs before paint, measures unconstrained typography & layout stack)
  useLayoutEffect(() => {
    if (!onDimensionsChange) return;

    const titleW = measTitleRef.current
      ? Math.ceil(measTitleRef.current.getBoundingClientRect().width)
      : 0;
    const artistW = measArtistRef.current
      ? Math.ceil(measArtistRef.current.getBoundingClientRect().width)
      : 0;
    const controlsH = contentStackRef.current
      ? Math.ceil(contentStackRef.current.getBoundingClientRect().height)
      : 0;
    const rightW = rightSectionRef.current
      ? Math.ceil(rightSectionRef.current.getBoundingClientRect().width)
      : 48;

    const prev = lastReportedDimsRef.current;
    // Strict threshold check: ignore <2px jitter to strictly prevent resize feedback loops
    const hasMeaningfulDiff =
      Math.abs(titleW - prev.titleW) > 2 ||
      Math.abs(artistW - prev.artistW) > 2 ||
      Math.abs(controlsH - prev.controlsH) > 2 ||
      Math.abs(rightW - prev.rightW) > 2;

    if (hasMeaningfulDiff) {
      lastReportedDimsRef.current = { titleW, artistW, controlsH, rightW };
      onDimensionsChange({
        naturalTitleWidth: titleW,
        naturalArtistWidth: artistW,
        measuredControlsHeight: controlsH,
        measuredRightWidth: rightW,
      });
    }
  }, [
    mediaTask.title,
    mediaTask.subtitle,
    mediaTask.icon_name,
    hasDuration,
    rightTasks.length,
    onDimensionsChange,
  ]);

  // ResizeObserver on content stack height (tracks multi-line title wrapping changes with zero feedback loop)
  useEffect(() => {
    if (!contentStackRef.current || !onDimensionsChange) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = Math.ceil(entry.contentRect.height);
        const prev = lastReportedDimsRef.current;
        if (Math.abs(h - prev.controlsH) > 2) {
          lastReportedDimsRef.current.controlsH = h;
          onDimensionsChange({
            naturalTitleWidth: lastReportedDimsRef.current.titleW,
            naturalArtistWidth: lastReportedDimsRef.current.artistW,
            measuredControlsHeight: h,
            measuredRightWidth: lastReportedDimsRef.current.rightW,
          });
        }
      }
    });

    observer.observe(contentStackRef.current);
    return () => observer.disconnect();
  }, [onDimensionsChange]);

  return (
    <div
      className={`media-island-layout contrast-${contrastMode}`}
      onClick={onBannerClick}
      title="Click to open player panel"
      role="button"
      tabIndex={0}
    >
      {/* 
        High-fidelity DOM typography measurement nodes:
        - Detached/offscreen with visibility hidden and zero pointer events.
        - Exactly reflects DirectWrite / subpixel typography and letter-spacing for unconstrained text.
      */}
      <div
        style={{
          position: "absolute",
          top: -9999,
          left: -9999,
          visibility: "hidden",
          pointerEvents: "none",
          whiteSpace: "nowrap",
          zIndex: -1,
        }}
        aria-hidden="true"
      >
        <span
          ref={measTitleRef}
          style={{
            fontSize: "11.5px",
            fontWeight: 600,
            letterSpacing: "0.2px",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          }}
        >
          {mediaTask.title || "Unknown Track"}
        </span>
        <span
          ref={measArtistRef}
          style={{
            fontSize: "10px",
            fontWeight: 400,
            letterSpacing: "normal",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          }}
        >
          {mediaTask.subtitle || mediaTask.icon_name || "Unknown Artist"}
        </span>
      </div>

      {/* 
        1. Responsive Album Artwork on the Left (v0.6.1):
        - Scales proportionally with capsule height (H - 2 * 6px) with equal 6px top, bottom, and left margins.
        - Preserves strict 1:1 square aspect ratio and vertical centering.
        - Concentric rounded-rectangle corners (--media-artwork-radius) matching capsule curvature.
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
        - Inner stack (media-controls-content) maintains intrinsic natural height.
        - Title, Artist, Progress Bar, and Real Playback Controls.
      */}
      <div className="media-controls-container">
        <div className="media-controls-content" ref={contentStackRef}>
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
      </div>

      {/* 3. Subtle vertical divider */}
      <div className="media-section-divider" />

      {/* 
        4. Dedicated Clock & Right Status Section:
        - Vertically centered clock.
        - Supported status icons (timers/alarms).
      */}
      <div className="media-right-section" ref={rightSectionRef}>
        <Clock />
        {rightTasks.map((t) => (
          <TaskIcon key={t.id} task={t} />
        ))}
      </div>
    </div>
  );
}
