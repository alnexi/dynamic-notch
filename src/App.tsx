import { useEffect, useState, useCallback, useRef } from "react";
import "./App.css";
import { ActiveTask, ContrastMode, ExpansionMode, ProximityLevel, ProximityPayload } from "./types/tasks";
import { SmartCapsule } from "./components/SmartCapsule";
import { computeCapsuleGeometry, MediaMetadataInput, MediaMeasuredDimensions } from "./utils/geometry";

function App() {
  const [proximity, setProximity] = useState<ProximityLevel>("idle");
  const [offsetX, setOffsetX] = useState<number>(120);
  const [isActivated, setIsActivated] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [expansionMode, setExpansionMode] = useState<ExpansionMode>("none");
  const [monitorWidth, setMonitorWidth] = useState<number>(() => {
    return typeof window !== "undefined" ? window.innerWidth || 1920 : 1920;
  });
  const [contrastMode, setContrastMode] = useState<ContrastMode>("dark-bg");
  const [activeTasks, setActiveTasks] = useState<ActiveTask[]>([]);
  const [measuredMediaDims, setMeasuredMediaDims] = useState<MediaMeasuredDimensions>({});
  const [isPlayerPanelOpen, setIsPlayerPanelOpen] = useState<boolean>(false);
  const [isDeviceMenuOpen, setIsDeviceMenuOpen] = useState<boolean>(false);
  const [deviceCount, setDeviceCount] = useState<number>(3);
  const isCollapsingRef = useRef<boolean>(false);

  // Helper to emit events to Rust backend
  const emitUnlock = useCallback(async () => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { emit } = await import("@tauri-apps/api/event");
        await emit("nova-unlock-anchor", {});
      } catch (err) {
        console.warn("Failed to emit nova-unlock-anchor:", err);
      }
    }
  }, []);

  const emitLock = useCallback(async () => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { emit } = await import("@tauri-apps/api/event");
        await emit("nova-lock-anchor", {});
      } catch (err) {
        console.warn("Failed to emit nova-lock-anchor:", err);
      }
    }
  }, []);

  const emitExpand = useCallback(
    async (mode: ExpansionMode = "standard", width?: number, height?: number) => {
      if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        try {
          const { emit } = await import("@tauri-apps/api/event");
          await emit("nova-expand-capsule", { expanded: true, mode, width, height });
        } catch (err) {
          console.warn("Failed to emit nova-expand-capsule:", err);
        }
      }
    },
    []
  );

  const emitCollapse = useCallback(async () => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { emit } = await import("@tauri-apps/api/event");
        await emit("nova-collapse-capsule", { expanded: false });
      } catch (err) {
        console.warn("Failed to emit nova-collapse-capsule:", err);
      }
    }
  }, []);

  // Listen for native cursor proximity changes, active tasks, contrast & collapse events from Rust
  useEffect(() => {
    let unlistenProximity: (() => void) | undefined;
    let unlistenCollapse: (() => void) | undefined;

    async function subscribeEvents() {
      if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        try {
          const { listen } = await import("@tauri-apps/api/event");

          unlistenProximity = await listen<ProximityPayload>("nova-proximity", (event) => {
            const p = event.payload;
            if (p) {
              if (p.level) {
                setProximity(p.level);
              }
              if (typeof p.offset_x === "number") {
                setOffsetX(p.offset_x);
              }
              if (typeof p.monitor_width === "number" && p.monitor_width > 0) {
                setMonitorWidth(p.monitor_width);
              }
              if (p.contrast_mode) {
                setContrastMode(p.contrast_mode);
              }
              if (Array.isArray(p.active_tasks)) {
                setActiveTasks(p.active_tasks);
              }
              if (p.is_expanded !== undefined && !p.is_expanded && isExpanded) {
                setIsExpanded(false);
                setExpansionMode("none");
                setIsPlayerPanelOpen(false);
                setIsDeviceMenuOpen(false);
                setMeasuredMediaDims({});
              }
              if (p.level === "hovered" || p.is_locked) {
                setIsActivated(true);
              } else if (p.level === "idle") {
                setIsActivated(false);
                setIsExpanded(false);
                setExpansionMode("none");
                setIsPlayerPanelOpen(false);
                setIsDeviceMenuOpen(false);
                setMeasuredMediaDims({});
              }
            }
          });

          unlistenCollapse = await listen("nova-collapse", () => {
            setIsExpanded(false);
            setExpansionMode("none");
            setIsPlayerPanelOpen(false);
            setIsDeviceMenuOpen(false);
            setMeasuredMediaDims({});
          });
        } catch (err) {
          console.warn("Unable to subscribe to native events:", err);
        }
      }
    }

    subscribeEvents();

    return () => {
      if (unlistenProximity) {
        unlistenProximity();
      }
      if (unlistenCollapse) {
        unlistenCollapse();
      }
    };
  }, [isExpanded]);

  // Window resize handler to maintain accurate monitor dimensions
  useEffect(() => {
    const handleResize = () => {
      if (typeof window !== "undefined") {
        setMonitorWidth(window.innerWidth || 1920);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Keyboard and window blur handling for dismissing / unlocking / collapsing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsExpanded(false);
        setExpansionMode("none");
        setIsPlayerPanelOpen(false);
        setIsDeviceMenuOpen(false);
        setIsActivated(false);
        setProximity("idle");
        setMeasuredMediaDims({});
        emitCollapse();
        emitUnlock();
      }
    };

    const handleBlur = () => {
      setIsExpanded(false);
      setExpansionMode("none");
      setIsPlayerPanelOpen(false);
      setIsDeviceMenuOpen(false);
      setIsActivated(false);
      setMeasuredMediaDims({});
      emitCollapse();
      emitUnlock();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleBlur);
    };
  }, [emitCollapse, emitUnlock]);

  const handleMouseEnter = () => {
    setIsActivated(true);
    emitLock();
  };

  const handleMouseLeave = () => {
    if (isExpanded) {
      // Smooth automatic collapse on mouse leave without requiring another click
      setIsExpanded(false);
      setExpansionMode("none");
      setIsPlayerPanelOpen(false);
      setIsDeviceMenuOpen(false);
      setMeasuredMediaDims({});
      isCollapsingRef.current = true;
      setTimeout(() => {
        isCollapsingRef.current = false;
      }, 420);
      emitCollapse();
    } else {
      setIsActivated(false);
      emitUnlock();
    }
  };

  // Expand into full Dynamic Media Island layout when media icon is clicked
  const handleMediaClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isCollapsingRef.current) return;
      setIsExpanded(true);
      setExpansionMode("media");
      emitExpand("media");
    },
    [emitExpand]
  );

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Prevent accidental re-expansion during collapse transition
    if (isCollapsingRef.current) return;

    // Expand on click: Clicking the small capsule expands it to standard ~3.5x collapsed width
    if (!isExpanded && (isActivated || proximity === "hovered")) {
      setIsExpanded(true);
      setExpansionMode("standard");
      emitExpand("standard");
    }
  };

  // Direct activation takes highest precedence, then progressive proximity states
  const effectiveState: ProximityLevel = isActivated || proximity === "hovered" || isExpanded
    ? "hovered"
    : proximity === "near"
    ? "near"
    : proximity === "approaching"
    ? "approaching"
    : "idle";

  // Task count determines the horizontal expansion class
  const taskCountClass = activeTasks.length === 0
    ? "tasks-count-0"
    : activeTasks.length === 1
    ? "tasks-count-1"
    : activeTasks.length === 2
    ? "tasks-count-2"
    : "tasks-count-many";

  // Extract media metadata and secondary task counts for content-adaptive sizing
  const mediaTask = activeTasks.find((t) => t.kind === "media");
  const rightTasks = activeTasks.filter((t) => t.slot === "right");
  const hasDuration = typeof mediaTask?.duration_seconds === "number" && mediaTask.duration_seconds > 0;

  // Reset measured dimensions if song title or artist changes
  const lastSongIdRef = useRef<string>("");
  const currentSongKey = `${mediaTask?.title || ""}-${mediaTask?.subtitle || ""}`;
  useEffect(() => {
    if (lastSongIdRef.current !== currentSongKey) {
      lastSongIdRef.current = currentSongKey;
      setMeasuredMediaDims({});
    }
  }, [currentSongKey]);

  const handleMediaDimensionsChange = useCallback((dims: MediaMeasuredDimensions) => {
    setMeasuredMediaDims((prev) => {
      if (
        prev.naturalTitleWidth === dims.naturalTitleWidth &&
        prev.naturalArtistWidth === dims.naturalArtistWidth &&
        prev.measuredControlsHeight === dims.measuredControlsHeight &&
        prev.measuredRightWidth === dims.measuredRightWidth
      ) {
        return prev;
      }
      return dims;
    });
  }, []);

  const mediaInput: MediaMetadataInput = {
    title: mediaTask?.title,
    artist: mediaTask?.subtitle || mediaTask?.icon_name,
    hasDuration,
    rightTasksCount: rightTasks.length,
    measured: measuredMediaDims,
    isPlayerPanelOpen,
    isDeviceMenuOpen,
    deviceCount,
  };

  // Intelligently compute capsule geometry with boundary clamping and symmetrical or edge-favored expansion
  const geometry = computeCapsuleGeometry(
    offsetX,
    activeTasks.length,
    isExpanded,
    monitorWidth,
    expansionMode,
    mediaInput
  );

  // Synchronize expanded dynamic width & height with Rust hit-test detector & window size
  useEffect(() => {
    if (isExpanded) {
      emitExpand(expansionMode, geometry.width, geometry.height);

      if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        import("@tauri-apps/api/core").then(({ invoke }) => {
          invoke("sync_capsule_geometry", {
            width: geometry.width,
            height: geometry.height,
            isExpanded: true,
          }).catch(() => {});
        });
      }
    }
  }, [isExpanded, expansionMode, geometry.width, geometry.height, emitExpand]);

  return (
    <div
      className="island-wrapper"
      data-tauri-drag-region
      style={{
        "--bubble-offset": `${geometry.centerX}px`,
        "--capsule-width": `${geometry.width}px`,
        "--capsule-height": `${geometry.height}px`,
        "--capsule-radius": `${geometry.radius}px`,
        "--media-title-lines": geometry.titleLines,
        "--media-artwork-size": `${geometry.artworkSize}px`,
        "--media-artwork-radius": `${geometry.artworkRadius}px`,
      } as React.CSSProperties}
    >
      {/* 
        Nova Island — Professional Music Player Panel (v0.7.0):
        - State A: Compact expanded banner layout with responsive artwork, controls, and clock.
        - State B: Full downward-expanded music player panel with seek bar, prominent controls, and output device selector.
        - State C/D: Real Windows audio output endpoints menu.
        - Preserves 100% desktop click-through outside the active panel footprint.
      */}
      <div
        className={`glass-bubble state-${effectiveState} ${taskCountClass} contrast-${contrastMode} ${
          isExpanded ? "is-expanded" : ""
        } mode-${expansionMode} ${isPlayerPanelOpen ? "player-panel-open" : ""} ${
          isDeviceMenuOpen ? "device-menu-open" : ""
        }`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        data-tauri-drag-region
        aria-label="Nova Island Smart Capsule"
        data-proximity-level={effectiveState}
      >
        <div className="glass-specular" />

        {/* Content rendered when in expanded or compact hovered state */}
        {effectiveState === "hovered" && (
          <SmartCapsule
            activeTasks={activeTasks}
            contrastMode={contrastMode}
            expansionMode={expansionMode}
            onMediaClick={handleMediaClick}
            onMediaDimensionsChange={handleMediaDimensionsChange}
            isPlayerPanelOpen={isPlayerPanelOpen}
            onBackToBanner={() => {
              setIsPlayerPanelOpen(false);
              setIsDeviceMenuOpen(false);
            }}
            isDeviceMenuOpen={isDeviceMenuOpen}
            setIsDeviceMenuOpen={setIsDeviceMenuOpen}
            onDeviceCountChange={setDeviceCount}
            onExpandToPlayerPanel={() => {
              setIsPlayerPanelOpen(true);
            }}
          />
        )}
      </div>
    </div>
  );
}

export default App;
