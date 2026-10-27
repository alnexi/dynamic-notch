import { useEffect, useState, useCallback } from "react";
import "./App.css";
import { ActiveTask, ContrastMode, ProximityLevel, ProximityPayload } from "./types/tasks";
import { SmartCapsule } from "./components/SmartCapsule";

function App() {
  const [proximity, setProximity] = useState<ProximityLevel>("idle");
  const [offsetX, setOffsetX] = useState<number>(120);
  const [isActivated, setIsActivated] = useState<boolean>(false);
  const [contrastMode, setContrastMode] = useState<ContrastMode>("dark-bg");
  const [activeTasks, setActiveTasks] = useState<ActiveTask[]>([]);

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

  // Listen for native cursor proximity changes, active tasks & adaptive contrast from Rust
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    async function subscribeProximity() {
      if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        try {
          const { listen } = await import("@tauri-apps/api/event");
          unlisten = await listen<ProximityPayload>("nova-proximity", (event) => {
            const p = event.payload;
            if (p) {
              if (p.level) {
                setProximity(p.level);
              }
              if (typeof p.offset_x === "number") {
                setOffsetX(p.offset_x);
              }
              if (p.contrast_mode) {
                setContrastMode(p.contrast_mode);
              }
              if (Array.isArray(p.active_tasks)) {
                setActiveTasks(p.active_tasks);
              }
              if (p.level === "hovered" || p.is_locked) {
                setIsActivated(true);
              } else if (p.level === "idle") {
                setIsActivated(false);
              }
            }
          });
        } catch (err) {
          console.warn("Unable to subscribe to nova-proximity events:", err);
        }
      }
    }

    subscribeProximity();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  // Keyboard and window blur handling for dismissing / unlocking
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsActivated(false);
        setProximity("idle");
        emitUnlock();
      }
    };

    const handleBlur = () => {
      setIsActivated(false);
      emitUnlock();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleBlur);
    };
  }, [emitUnlock]);

  const handleMouseEnter = () => {
    setIsActivated(true);
    emitLock();
  };

  const handleMouseLeave = () => {
    setIsActivated(false);
    emitUnlock();
  };

  const handleClick = () => {
    if (isActivated || proximity === "hovered") {
      setIsActivated(false);
      setProximity("idle");
      emitUnlock();
    }
  };

  // Direct activation takes highest precedence, then progressive proximity states
  const effectiveState: ProximityLevel = isActivated || proximity === "hovered"
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

  return (
    <div
      className="island-wrapper"
      data-tauri-drag-region
      style={{ "--bubble-offset": `${offsetX}px` } as React.CSSProperties}
    >
      {/* 
        Nova Island — Smart Capsule with Active Tasks & Centered Clock:
        - Idle: 100% invisible, click-through everywhere.
        - Approaching: subtle curved glass protrusion.
        - Hovered: expands to display Centered Clock + Active Task Indicators.
        - Dynamically expands horizontally only as needed for active tasks.
        - Fully transparent glass preserved across all states.
      */}
      <div
        className={`glass-bubble state-${effectiveState} ${taskCountClass} contrast-${contrastMode}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        data-tauri-drag-region
        aria-label="Nova Island Smart Capsule"
        data-proximity-level={effectiveState}
      >
        <div className="glass-specular" />

        {/* Content rendered when in expanded hovered state */}
        {effectiveState === "hovered" && (
          <SmartCapsule activeTasks={activeTasks} contrastMode={contrastMode} />
        )}
      </div>
    </div>
  );
}

export default App;
