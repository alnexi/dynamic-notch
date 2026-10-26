import { useEffect, useState } from "react";
import "./App.css";

export type ProximityLevel = "idle" | "approaching" | "near" | "hovered";

export interface ProximityPayload {
  level: ProximityLevel;
  distance: number;
  dx: number;
  dy: number;
}

// Organic SVG pendant droplet paths for attached states (narrow neck -> bulbous body)
// Inspired by physical fluid mechanics: narrow stem at ceiling, swelling into a round spherical bulb.
const ATTACHED_DROP_PATHS = {
  idle: {
    body: "M 56,0 C 56,1.5 56.5,3 57.5,4 C 58.5,4.8 61.5,4.8 62.5,4 C 63.5,3 64,1.5 64,0 Z",
    meniscus: "M 57,1 C 57.5,2 58.5,3 60,3.2",
    bottomRim: "M 58,4 C 59.5,4.6 60.5,4.6 62,4",
  },
  approaching: {
    body: "M 55,0 C 55,2.5 54.5,5 54,7 C 53,10 47,12.5 47,15.5 C 47,18 53,19.5 60,19.5 C 67,19.5 73,18 73,15.5 C 73,12.5 67,10 66,7 C 65.5,5 65,2.5 65,0 Z",
    meniscus: "M 54.5,6 C 53,9.5 48.5,12 48,15",
    bottomRim: "M 52,18 C 56,19.5 64,19.5 68,18",
  },
  near: {
    body: "M 56,0 C 56,3 56.5,6 56.5,9 C 56.5,14 38,18 38,25 C 38,31 47,35 60,35 C 73,35 82,31 82,25 C 82,18 63.5,14 63.5,9 C 63.5,6 64,3 64,0 Z",
    meniscus: "M 56,8 C 54,14 41,19 40,25 C 40,28 42,31 45,33",
    bottomRim: "M 46,33 C 53,35 67,35 74,33",
  },
};

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
  const isDetached = effectiveState === "hovered";
  const attachedKey = effectiveState === "hovered" ? "near" : effectiveState;
  const currentPaths = ATTACHED_DROP_PATHS[attachedKey];

  return (
    <div className="island-wrapper" data-tauri-drag-region>
      {/* PHASE A: Attached Pendant Droplet (Active in idle, approaching, near) */}
      <div
        className={`attached-droplet-container state-${effectiveState} ${
          isDetached ? "detaching-out" : ""
        }`}
        data-tauri-drag-region
      >
        <div className="droplet-backdrop" />
        <svg
          className="water-droplet-svg"
          viewBox="0 0 120 48"
          width="120"
          height="48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <clipPath id="attached-drop-clip" clipPathUnits="userSpaceOnUse">
              <path className="droplet-clip-path" d={currentPaths.body} />
            </clipPath>

            <linearGradient id="attached-water-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.14" />
              <stop offset="30%" stopColor="#ffffff" stopOpacity="0.04" />
              <stop offset="70%" stopColor="#000000" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
            </linearGradient>

            <linearGradient id="attached-meniscus-stroke" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="30%" stopColor="#ffffff" stopOpacity="0.75" />
              <stop offset="75%" stopColor="#ffffff" stopOpacity="0.60" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>

            <linearGradient id="attached-bottom-rim-stroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="35%" stopColor="#ffffff" stopOpacity="0.45" />
              <stop offset="65%" stopColor="#ffffff" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
          </defs>

          <path
            className="droplet-body"
            d={currentPaths.body}
            fill="url(#attached-water-gradient)"
          />
          <path
            className="droplet-meniscus"
            d={currentPaths.meniscus}
            stroke="url(#attached-meniscus-stroke)"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <path
            className="droplet-bottom-rim"
            d={currentPaths.bottomRim}
            stroke="url(#attached-bottom-rim-stroke)"
            strokeWidth="0.8"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* PHASE B: Detached Interaction Capsule (Separates with real gap at top: 7px) */}
      <div
        className={`detached-capsule-container ${isDetached ? "visible" : ""}`}
        onMouseEnter={() => setIsPointerInside(true)}
        onMouseLeave={() => setIsPointerInside(false)}
        data-tauri-drag-region
        aria-label="Nova Island Detached Capsule"
        data-proximity-level={effectiveState}
      >
        <div className="detached-capsule">
          <div className="capsule-sheen" />
        </div>
      </div>
    </div>
  );
}

export default App;
