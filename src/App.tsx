import { useEffect, useState } from "react";
import "./App.css";

export type ProximityLevel = "idle" | "approaching" | "near" | "hovered";

export interface ProximityPayload {
  level: ProximityLevel;
  distance: number;
  dx: number;
  dy: number;
}

function App() {
  const [proximity, setProximity] = useState<ProximityLevel>("idle");
  const [isPointerInside, setIsPointerInside] = useState(false);

  useEffect(() => {
    // Top-center positioning for native Tauri desktop window
    async function setupNativeWindow() {
      if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        try {
          const { getCurrentWindow, primaryMonitor, PhysicalPosition } = await import(
            "@tauri-apps/api/window"
          );
          const appWindow = getCurrentWindow();
          const monitor = await primaryMonitor();
          if (monitor) {
            const scale = monitor.scaleFactor;
            const monitorWidth = monitor.size.width;
            const winWidth = 240 * scale;
            const x = Math.round((monitorWidth - winWidth) / 2);
            const y = 0; // Flush with top edge of primary display
            await appWindow.setPosition(new PhysicalPosition(x, y));
          }
          await appWindow.show();
        } catch {
          // Fallback handled by native Rust setup hook
        }
      }
    }

    setupNativeWindow();
  }, []);

  useEffect(() => {
    // Listen for native cursor proximity changes from Rust
    let unlisten: (() => void) | undefined;

    async function subscribeProximity() {
      if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        try {
          const { listen } = await import("@tauri-apps/api/event");
          unlisten = await listen<ProximityPayload>("nova-proximity", (event) => {
            if (event.payload && event.payload.level) {
              setProximity(event.payload.level);
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

  // Compute effective state: direct pointer hover takes highest precedence,
  // followed by native cursor proximity stages.
  const effectiveState: ProximityLevel = isPointerInside ? "hovered" : proximity;

  return (
    <div className="island-wrapper" data-tauri-drag-region>
      <div
        className={`island-droplet proximity-${effectiveState} ${
          effectiveState === "hovered" ? "expanded" : ""
        }`}
        onMouseEnter={() => setIsPointerInside(true)}
        onMouseLeave={() => setIsPointerInside(false)}
        data-tauri-drag-region
        aria-label="Nova Island Glass Droplet"
        data-proximity-level={effectiveState}
      >
        <div className="droplet-specular" />
        <div className="droplet-optic">
          <span className="optic-flute flute-left" />
          <div className="optic-lens">
            <span className="optic-dot" />
          </div>
          <span className="optic-flute flute-right" />
        </div>
      </div>
    </div>
  );
}

export default App;
