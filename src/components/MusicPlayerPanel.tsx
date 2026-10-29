import React, { useState, useEffect, useRef } from "react";
import { ActiveTask, AudioDevice, ContrastMode } from "../types/tasks";

interface MusicPlayerPanelProps {
  mediaTask: ActiveTask;
  contrastMode: ContrastMode;
  onBackToBanner: () => void;
  isDeviceMenuOpen: boolean;
  setIsDeviceMenuOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  onDeviceCountChange?: (count: number) => void;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function MusicPlayerPanel({
  mediaTask,
  contrastMode,
  onBackToBanner,
  isDeviceMenuOpen,
  setIsDeviceMenuOpen,
  onDeviceCountChange,
}: MusicPlayerPanelProps) {
  const isPlaying = mediaTask.is_playing ?? false;
  const dur = mediaTask.duration_seconds ?? 0;
  const hasDuration = typeof mediaTask.duration_seconds === "number" && dur > 0;

  const [currentPos, setCurrentPos] = useState<number>(mediaTask.position_seconds ?? 0);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [scrubPos, setScrubPos] = useState<number>(0);
  const [imgError, setImgError] = useState<boolean>(false);

  // Audio devices state
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [currentDevice, setCurrentDevice] = useState<AudioDevice | null>(null);

  // Reset artwork error when URL changes
  useEffect(() => {
    setImgError(false);
  }, [mediaTask.icon_base64]);

  // Synchronize playback position from backend poll unless actively scrubbing
  useEffect(() => {
    if (!isScrubbing && typeof mediaTask.position_seconds === "number") {
      setCurrentPos(mediaTask.position_seconds);
    }
  }, [mediaTask.position_seconds, isScrubbing]);

  // Smooth local playback advance
  useEffect(() => {
    if (!isPlaying || isScrubbing) return;
    const interval = setInterval(() => {
      setCurrentPos((prev) => {
        if (hasDuration && prev >= dur) return prev;
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, isScrubbing, hasDuration, dur]);

  // Query real Windows audio output devices
  useEffect(() => {
    let isMounted = true;
    async function fetchDevices() {
      if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const devList = await invoke<AudioDevice[]>("get_audio_devices");
          if (isMounted && Array.isArray(devList)) {
            setDevices(devList);
            const def = devList.find((d) => d.is_default) || devList[0] || null;
            setCurrentDevice(def);
            onDeviceCountChange?.(devList.length);
          }
        } catch (err) {
          console.warn("Failed to fetch audio devices:", err);
        }
      }
    }
    fetchDevices();
    return () => {
      isMounted = false;
    };
  }, [onDeviceCountChange]);

  // Playback control handlers
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

  const handleToggleShuffle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("media_toggle_shuffle");
    } catch (err) {
      console.warn("Failed to toggle shuffle:", err);
    }
  };

  const handleCycleRepeat = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("media_cycle_repeat");
    } catch (err) {
      console.warn("Failed to cycle repeat:", err);
    }
  };

  // Seek bar interaction
  const progressBarRef = useRef<HTMLDivElement>(null);

  const calculateSeekSeconds = (clientX: number): number => {
    if (!progressBarRef.current || !hasDuration) return 0;
    const rect = progressBarRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * dur;
  };

  const handleSeekStart = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!hasDuration) return;
    setIsScrubbing(true);
    const targetSec = calculateSeekSeconds(e.clientX);
    setScrubPos(targetSec);
    setCurrentPos(targetSec);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const sec = calculateSeekSeconds(moveEvent.clientX);
      setScrubPos(sec);
      setCurrentPos(sec);
    };

    const handleMouseUp = async (upEvent: MouseEvent) => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      setIsScrubbing(false);
      const finalSec = calculateSeekSeconds(upEvent.clientX);
      setCurrentPos(finalSec);
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("media_seek", { seconds: finalSec });
      } catch (err) {
        console.warn("Failed to seek media:", err);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Device selection handler
  const handleSelectDevice = async (device: AudioDevice, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("set_audio_device", { id: device.id });
      // Update local state to reflect new default
      setDevices((prev) =>
        prev.map((d) => ({
          ...d,
          is_default: d.id === device.id,
        }))
      );
      setCurrentDevice({ ...device, is_default: true });
      setIsDeviceMenuOpen(false);
    } catch (err) {
      console.warn("Failed to set audio output device:", err);
    }
  };

  const activePos = isScrubbing ? scrubPos : currentPos;
  const progressRatio = hasDuration ? Math.min(1, Math.max(0, activePos / dur)) : 0;
  const progressPercent = progressRatio * 100;

  const shuffleActive = mediaTask.shuffle_active ?? false;
  const repeatMode = mediaTask.repeat_mode ?? "none";
  const canSeek = mediaTask.can_seek ?? hasDuration;
  const canShuffle = mediaTask.can_shuffle ?? true;
  const canRepeat = mediaTask.can_repeat ?? true;

  // Render appropriate endpoint icon
  const getDeviceIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case "headphones":
      case "headset":
        return (
          <svg viewBox="0 0 24 24" fill="currentColor" className="device-item-icon">
            <path d="M12 3a9 9 0 0 0-9 9v7c0 1.1.9 2 2 2h4v-8H5v-1a7 7 0 0 1 14 0v1h-4v8h4c1.1 0 2-.9 2-2v-7a9 9 0 0 0-9-9z" />
          </svg>
        );
      case "bluetooth":
        return (
          <svg viewBox="0 0 24 24" fill="currentColor" className="device-item-icon">
            <path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z" />
          </svg>
        );
      case "display":
        return (
          <svg viewBox="0 0 24 24" fill="currentColor" className="device-item-icon">
            <path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z" />
          </svg>
        );
      default:
        return (
          <svg viewBox="0 0 24 24" fill="currentColor" className="device-item-icon">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
          </svg>
        );
    }
  };

  return (
    <div className={`music-player-panel contrast-${contrastMode}`}>
      {/* 
        1. Top Section:
        - Album Artwork (48x48px, rounded 10px) on left.
        - Track Title and Artist beside it.
        - Collapse to banner button on top right.
        - Clicking anywhere on top header smoothly returns to State A.
      */}
      <div
        className="panel-header-row"
        onClick={onBackToBanner}
        title="Click to return to compact banner"
        role="button"
        tabIndex={0}
      >
        <div className="panel-artwork-box">
          {mediaTask.icon_base64 && !imgError ? (
            <img
              src={mediaTask.icon_base64}
              alt={mediaTask.title}
              className="panel-artwork-img"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="panel-artwork-fallback">
              <svg viewBox="0 0 24 24" fill="currentColor" className="panel-fallback-icon">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            </div>
          )}
        </div>

        <div className="panel-meta-box">
          <div className="panel-track-title" title={mediaTask.title}>
            {mediaTask.title || "Unknown Track"}
          </div>
          <div className="panel-track-artist" title={mediaTask.subtitle || ""}>
            {mediaTask.subtitle || mediaTask.icon_name || "Unknown Artist"}
          </div>
        </div>

        <button
          type="button"
          className="panel-collapse-btn"
          onClick={(e) => {
            e.stopPropagation();
            onBackToBanner();
          }}
          title="Return to banner"
          aria-label="Return to banner"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" />
          </svg>
        </button>
      </div>

      {/* 
        2. Middle Section — Interactive Seek Bar:
        - Elapsed timestamp on left, total duration on right.
        - Clickable & draggable progress bar with thumb knob on hover.
      */}
      <div className="panel-seek-section">
        <div
          className={`panel-seek-bar-track ${canSeek ? "seekable" : ""}`}
          ref={progressBarRef}
          onMouseDown={canSeek ? handleSeekStart : undefined}
          title={canSeek ? "Click or drag to seek" : undefined}
        >
          <div className="panel-seek-fill" style={{ width: `${progressPercent}%` }} />
          {canSeek && (
            <div
              className="panel-seek-thumb"
              style={{ left: `${progressPercent}%` }}
            />
          )}
        </div>
        <div className="panel-seek-timestamps">
          <span>{formatTime(activePos)}</span>
          <span>{hasDuration ? formatTime(dur) : "--:--"}</span>
        </div>
      </div>

      {/* 
        3. Controls Row:
        - Shuffle, Previous, Prominent Play/Pause, Next, Repeat.
        - Reflects real Windows GSMTC states (no fake data).
      */}
      <div className="panel-controls-row">
        {/* Shuffle Button */}
        <button
          type="button"
          className={`panel-ctrl-btn panel-ctrl-shuffle ${shuffleActive ? "is-active" : ""}`}
          onClick={handleToggleShuffle}
          disabled={!canShuffle}
          title={shuffleActive ? "Shuffle: On" : "Shuffle: Off"}
          aria-label="Toggle shuffle"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
          </svg>
          {shuffleActive && <span className="active-dot" />}
        </button>

        {/* Previous Button */}
        <button
          type="button"
          className="panel-ctrl-btn panel-ctrl-prev"
          onClick={handlePrev}
          title="Previous track"
          aria-label="Previous track"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
          </svg>
        </button>

        {/* Play/Pause Button (Prominent) */}
        <button
          type="button"
          className="panel-ctrl-btn panel-ctrl-playpause"
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

        {/* Next Button */}
        <button
          type="button"
          className="panel-ctrl-btn panel-ctrl-next"
          onClick={handleNext}
          title="Next track"
          aria-label="Next track"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
          </svg>
        </button>

        {/* Repeat Button */}
        <button
          type="button"
          className={`panel-ctrl-btn panel-ctrl-repeat ${repeatMode !== "none" ? "is-active" : ""}`}
          onClick={handleCycleRepeat}
          disabled={!canRepeat}
          title={`Repeat: ${repeatMode === "track" ? "Track (One)" : repeatMode === "list" ? "List (All)" : "Off"}`}
          aria-label="Cycle repeat mode"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
          </svg>
          {repeatMode === "track" && <span className="repeat-badge-one">1</span>}
          {repeatMode === "list" && <span className="active-dot" />}
        </button>
      </div>

      {/* Subtle Divider */}
      <div className="panel-divider" />

      {/* 
        4. Bottom Section — Output Device Row:
        - Speaker icon, "Output Device", active device name, chevron.
        - Clicking toggles State C/D device menu.
      */}
      <div
        className={`panel-device-row ${isDeviceMenuOpen ? "is-open" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          setIsDeviceMenuOpen((prev) => !prev);
        }}
        role="button"
        tabIndex={0}
      >
        <div className="device-row-left">
          <svg viewBox="0 0 24 24" fill="currentColor" className="device-row-icon">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
          </svg>
          <span className="device-row-label">Output Device</span>
        </div>

        <div className="device-row-right">
          <span className="device-current-name" title={currentDevice?.name || "Default Audio"}>
            {currentDevice?.name || "Default Audio"}
          </span>
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className={`device-chevron ${isDeviceMenuOpen ? "rotated" : ""}`}
          >
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
          </svg>
        </div>
      </div>

      {/* 
        5. State C/D — Audio Output Endpoint Selection Menu:
        - Shows real Windows Core Audio endpoints with icons and checkmark.
        - Clicking switches default audio endpoint via IPolicyConfig and returns to State B.
      */}
      {isDeviceMenuOpen && (
        <div className="panel-device-menu">
          {devices.length === 0 ? (
            <div className="device-menu-empty">No audio endpoints detected</div>
          ) : (
            devices.map((dev) => (
              <div
                key={dev.id}
                className={`device-menu-item ${dev.is_default ? "is-selected" : ""}`}
                onClick={(e) => handleSelectDevice(dev, e)}
                title={dev.name}
              >
                <div className="device-item-left">
                  {getDeviceIcon(dev.device_type)}
                  <span className="device-item-name">{dev.name}</span>
                </div>
                {dev.is_default && (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="device-item-check">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}