# Nova Island

Nova Island is a lightweight, native Windows desktop application inspired by the Dynamic Island concept. Built with **Tauri 2**, **React**, **TypeScript**, **Vite**, and **Rust**, it lives along the top edge of the primary monitor as an unobtrusive, pointer-anchored transparent glass protrusion that smoothly tracks cursor proximity and expands into a sleek, translucent interaction capsule right at the pointer's location.

---

## Features & Current Status

Nova Island is under active phased development.

### Implemented Features

- **Phase 1: Project Foundation**
  - Frameless, titlebar-less desktop window with native OS transparency support.
  - Pinned on top of ordinary desktop windows (`alwaysOnTop`).
  - High-DPI-aware coordinate alignment positioned flush against the top edge of the primary display (`y = 0`).
  - Click-through transparency: Window regions outside the visible interface use `pointer-events: none`, preserving full clickability and focus for underlying desktop applications.
- **Phase 2: Premium Transparent Glass Material + Motion Graphics**
  - **Visual Identity**: Understated transparent glass aesthetic with subtle optical depth and refined specular reflections.
  - **Continuous Morphing Animation**: A single continuous glass element that expands from a subtle curved protrusion into a horizontal interaction capsule with gentle, controlled overshoot settle (`cubic-bezier(0.2, 0.95, 0.3, 1.05)`).
  - **Translucent Smoky Glass**: Refined neutral backdrop blur (`blur(16px) saturate(140%) contrast(106%)`) and consistent smoky glass transparency across every state, ensuring desktop wallpapers, text, and active windows remain visible through the glass at all times.
  - **Preserved Full Transparency in Capsule**: The capsule never changes to a darker or opaque fill upon activation, preserving the exact same base color and see-through clarity throughout the entire morph.
  - **Zero Indicator Artifacts**: 100% clean and minimal—strictly free of blue/cyan dots, green LEDs, or artificial glowing indicators.
- **Phase 3: Pointer-Anchored Tracking & Subtle Progressive Reveal**
  - **Full Top-Edge Horizontal Tracking**: The protrusion and capsule are anchored directly to the user's horizontal cursor position ($X$) along the entire top edge of the primary display rather than being locked to screen center:
    - Approaching near the far left $\rightarrow$ protrusion emerges near the left edge.
    - Approaching near the center $\rightarrow$ protrusion emerges at the center.
    - Approaching near the far right $\rightarrow$ protrusion emerges near the right edge.
  - **Extremely Subtle Initial Protrusion**:
    - **Idle** ($dy > 90\text{ px}$): 100% invisible (`opacity: 0; pointer-events: none;`).
    - **Approaching** ($45\text{ px} < dy \le 90\text{ px}$): Only a tiny curved edge emerges from the screen bezel ($28\text{ px}$ wide, visible height of approximately $3.5\text{ px}$). Understated transparent glass with no obvious glow or bright border.
    - **Near** ($7\text{ px} < dy \le 45\text{ px}$): Protrusion becomes slightly more visible ($30\text{ px}$ wide, visible height of approximately $5.5\text{ px}$), but remains compact.
    - **Strict Rule — Proximity Alone Never Opens Capsule**: The capsule only opens when the user physically moves the cursor into the visible protrusion geometry.
  - **Hovered / Activated State**: Cursor entering the visible protrusion freezes anchor $X$ and smoothly expands into a $148 \times 34\text{ px}$ capsule right at the cursor's location.
  - **Edge Clamping**: Intelligent boundary clamping prevents the $148\text{ px}$ capsule from clipping off the monitor ($78\text{ px} \le \text{anchor}_X \le W_{\text{monitor}} - 78\text{ px}$).
  - **Anti-Flicker & Interaction Reliability**: Generous hover capture zone on the protrusion prevents pointer-chasing and flickering while keeping the idle state fully non-blocking.
  - **Keyboard & Click-Outside Dismissal**: Pressing `Escape` or clicking outside immediately deactivates the capsule, unlocks the anchor, and smoothly collapses back to idle.
  - **Win32 Lifecycle Guard**: Native named kernel mutex and Windows Job Object (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`) to prevent duplicate instances and eliminate orphaned WebView2 child processes.

### Planned Features (Future Phases)

- **Phase 4+: Dynamic Activities & Content Slots**
  - Now Playing media controls and audio visualizer.
  - System status indicators (battery, volume, brightness, mute state).
  - Compact notification and timer toasts.
  - User configuration and customization settings.
  - Windows startup integration and auto-updater.

---

## Technology Stack

- **Desktop Framework:** [Tauri 2](https://tauri.app/)
- **Frontend:** [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/)
- **Bundler:** [Vite 8](https://vitejs.dev/)
- **Styling:** Vanilla CSS (Liquid glass aesthetics, caustic refraction, backdrop filters)
- **Native Layer:** [Rust](https://www.rust-lang.org/) with Win32 API (`user32`, `kernel32`)

---

## Prerequisites

To build and run Nova Island on Windows, ensure the following tools are installed:

1. **Node.js**: Version 18 or newer (v20+ recommended) with npm.
2. **Rust & Cargo**: Stable toolchain (install via [rustup.rs](https://rustup.rs/)).
3. **C++ Build Tools**: Visual Studio Build Tools 2022 with the **"Desktop development with C++"** workload and Windows 10/11 SDK.
4. **Microsoft Edge WebView2**: Pre-installed on Windows 10 and 11.

---

## Development & Build Commands

All commands should be executed from the project root directory:

### 1. Install Dependencies
```powershell
npm.cmd install
```

### 2. Frontend Development (Browser Preview)
Starts the Vite local development server on port 1420:
```powershell
npm.cmd run dev
```

### 3. Build Frontend
Runs the TypeScript type check and creates the production web bundle in `dist/`:
```powershell
npm.cmd run build
```

### 4. Run Desktop Application (Tauri Dev Mode)
Compiles the Rust desktop layer and launches the native transparent window on Windows:
```powershell
npm.cmd run tauri dev
```

### 5. Run Rust Unit Tests
Runs unit tests for pointer tracking math, edge clamping, and progressive reveal levels:
```powershell
cd src-tauri
cargo test
cd ..
```

---

## Troubleshooting & Windows Notes

### WebView2 Error `0x800700AA` ("The requested resource is in use")
Windows WebView2 acquires an exclusive lock on its User Data Directory (`%LOCALAPPDATA%\com.novaisland.app\EBWebView`).

- **Cause:** Occurs if multiple instances of Nova Island are launched simultaneously or if an orphaned `msedgewebview2.exe` process from a previous crashed run holds the profile lock.
- **Built-in Guard:** Nova Island includes a native Win32 `ProcessLifecycleGuard` in `src-tauri/src/main.rs`. It binds the application to a Windows Job Object (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`), ensuring that whenever the host process terminates, all child WebView2 processes are immediately cleaned up by the operating system. It also uses a named kernel mutex (`Local\NovaIsland_App_SingleInstance_Mutex`) to prevent duplicate instances from opening the same profile.
- **Manual Cleanup (if needed):** If an orphaned process is lingering, run the following in PowerShell:
  ```powershell
  Get-Process -Name "nova-island*" -ErrorAction SilentlyContinue | Stop-Process -Force
  ```

### PowerShell Script Execution Policy
On Windows, if running `npm` produces a script execution policy error regarding `npm.ps1`, use `npm.cmd` explicitly instead of `npm`. The project's `tauri.conf.json` is pre-configured to invoke `npm.cmd` directly.

---

## Project Structure

```
├── .vscode/                 # Recommended editor configuration
├── public/                  # Static assets and icons
├── src/                     # React frontend
│   ├── App.tsx              # Nova Island component, anchor tracking & key listener
│   ├── App.css              # Subtle protrusion styling & motion graphics
│   ├── main.tsx             # React DOM root entry point
│   └── vite-env.d.ts        # Vite environment typings
├── src-tauri/               # Native Rust application layer
│   ├── capabilities/        # Tauri 2 capability & permission declarations
│   │   └── default.json
│   ├── icons/               # Windows desktop application icons
│   ├── src/
│   │   ├── main.rs          # Win32 lifecycle guard, mutex & entry point
│   │   ├── lib.rs           # Window setup, anchor locking & Tauri run loop
│   │   └── proximity.rs     # Win32 cursor tracking & progressive reveal engine
│   ├── Cargo.toml           # Rust package configuration & dependencies
│   ├── build.rs             # Tauri build script
│   └── tauri.conf.json      # Window size, transparency & bundle config
├── .gitignore               # Ignored build outputs and sensitive files
├── index.html               # Frameless transparent web container
├── package.json             # NPM dependencies and scripts
├── tsconfig.json            # TypeScript configuration
└── vite.config.ts           # Vite development and build settings
```

---

## License & Contributing

License is currently undecided / TBD. Contributions, bug reports, and feedback are welcome.
