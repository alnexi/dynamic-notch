import { useEffect, useState, useCallback } from "react";
import "./App.css";

export type ProximityLevel = "idle" | "approaching" | "near" | "hovered";

export interface ProximityPayload {
  level: ProximityLevel;
  cursor_x: number;
  cursor_y: number;
  anchor_x: number;
  offset_x: number;
  is_locked: boolean;
}

function App() {
  const [proximity, setProximity] = useState<ProximityLevel>("idle");
  const [offsetX, setOffsetX] = useState<number>(120);
  const [isActivated, setIsActivated] = useState<boolean>(false);

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

  // Listen for native cursor proximity changes & anchor coordinates from Rust
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

  return (
    <div
      className="island-wrapper"
      data-tauri-drag-region
      style={{ "--bubble-offset": `${offsetX}px` } as React.CSSProperties}
    >
      {/* 
        Subtle Pointer-Anchored Protrusion & Capsule:
        - Idle: completely invisible, zero input interception.
        - Approaching: tiny 3-4px curved edge emerges at current pointer X coordinate.
        - Near: compact 5.5px curved edge (proximity alone NEVER opens the capsule).
        - Hovered: cursor enters protrusion -> freezes anchor X and expands into 148x34px capsule right at cursor.
        - Full transparent glass appearance maintained across all states.
      */}
      <div
        className={`glass-bubble state-${effectiveState}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        data-tauri-drag-region
        aria-label="Nova Island Protrusion"
        data-proximity-level={effectiveState}
      >
        <div className="glass-specular" />
      </div>
    </div>
  );
}

export default App;
