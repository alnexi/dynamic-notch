import { useEffect, useState } from "react";
import "./App.css";

export type ProximityLevel = "idle" | "approaching" | "near" | "hovered";

export interface ProximityPayload {
  level: ProximityLevel;
  distance: number;
  dx: number;
  dy: number;
}

// Organic SVG droplet path definitions for each proximity stage
const DROPLET_PATHS: Record<
  ProximityLevel,
  {
    body: string;
    meniscus: string;
    bottomRim: string;
  }
> = {
  idle: {
    body: "M 54,0 C 53.5,1 53,2 52,3 C 51.5,4 51,5 51,5.5 C 51,6.5 54,7.5 60,7.5 C 66,7.5 69,6.5 69,5.5 C 69,5 68.5,4 68,3 C 67,2 66.5,1 66,0 Z",
    meniscus: "M 53,1.5 C 52.5,2.5 52,3.5 51.5,4.5 C 51.5,5 51.5,5.5 52,6",
    bottomRim: "M 53,6.5 C 55,7.2 59,7.5 61,7.4 C 64,7.2 66,6.5 67,6",
  },
  approaching: {
    body: "M 52,0 C 51,2 50,5 48,8 C 46,12 45,14 45,16 C 45,19 51,20 59.8,20 C 68,20 75,19 75,15.5 C 75,13.5 73,11 71,7.5 C 69.5,4.5 68.5,2 68,0 Z",
    meniscus: "M 49,3 C 48,6 46,10 45,13 C 45,14 45,15 46,16",
    bottomRim: "M 48,18 C 51,19.5 58,20 61,19.8 C 66,19.2 71,17.5 72,16",
  },
  near: {
    body: "M 50,0 C 49,3 47,7 45,12 C 42,18 39,21 39,25 C 39,29 48,31 59.5,31 C 71,31 81,28 81,24 C 81,20 76,17 73,11 C 71,7 70.5,3 70,0 Z",
    meniscus: "M 47,4 C 45,9 42,15 40,19 C 39,21 39,23 40,25",
    bottomRim: "M 44,28 C 49,30.5 58,31 62,30.8 C 69,30 75,27.5 77,25",
  },
  hovered: {
    body: "M 48,0 C 47,4 45,10 42,16 C 38,24 31,28 31,34 C 31,40 43,42.5 59,42 C 75,41.5 89,38 89,33 C 89,27 82,23 77,15 C 74,10 73,4 72,0 Z",
    meniscus: "M 45,6 C 43,12 39,20 34,26 C 32,29 32,32 33,34",
    bottomRim: "M 38,38 C 45,41.5 58,42 63,41.8 C 72,41 81,37.5 84,34",
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
  const currentPaths = DROPLET_PATHS[effectiveState];

  return (
    <div className="island-wrapper" data-tauri-drag-region>
      <div className={`droplet-container proximity-${effectiveState}`}>
        {/* Optical blur layer clipped to the exact organic droplet path */}
        <div className="droplet-backdrop" />

        <svg
          className="water-droplet-svg"
          viewBox="0 0 120 48"
          width="120"
          height="48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          onMouseEnter={() => setIsPointerInside(true)}
          onMouseLeave={() => setIsPointerInside(false)}
          data-tauri-drag-region
          aria-label="Nova Island Water Droplet"
          data-proximity-level={effectiveState}
        >
          <defs>
            {/* Organic droplet clipping path for optical backdrop filter */}
            <clipPath id="droplet-clip" clipPathUnits="userSpaceOnUse">
              <path className="water-droplet-clip-path" d={currentPaths.body} />
            </clipPath>

            {/* Clear water gradient: strictly neutral grayscale, NO blue or cyan tint */}
            <linearGradient id="water-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.16" />
              <stop offset="25%" stopColor="#ffffff" stopOpacity="0.04" />
              <stop offset="70%" stopColor="#000000" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
            </linearGradient>

            {/* Continuous curved meniscus highlight along left boundary */}
            <linearGradient id="meniscus-stroke" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="25%" stopColor="#ffffff" stopOpacity="0.75" />
              <stop offset="75%" stopColor="#ffffff" stopOpacity="0.60" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>

            {/* Continuous curved bottom caustic highlight */}
            <linearGradient id="bottom-rim-stroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="35%" stopColor="#ffffff" stopOpacity="0.45" />
              <stop offset="65%" stopColor="#ffffff" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Liquid water droplet body */}
          <path
            className="water-droplet-body"
            d={currentPaths.body}
            fill="url(#water-gradient)"
          />

          {/* Left curved meniscus reflection */}
          <path
            className="water-droplet-meniscus"
            d={currentPaths.meniscus}
            stroke="url(#meniscus-stroke)"
            strokeWidth="1.2"
            strokeLinecap="round"
          />

          {/* Bottom curved rim reflection */}
          <path
            className="water-droplet-bottom-rim"
            d={currentPaths.bottomRim}
            stroke="url(#bottom-rim-stroke)"
            strokeWidth="0.8"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}

export default App;
