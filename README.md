# Nova Island

Nova Island is a lightweight, native Windows desktop application inspired by the Dynamic Island concept. Built with **Tauri 2**, **React**, **TypeScript**, **Vite**, and **Rust**, it lives as an unobtrusive, crystal-clear water droplet hanging from the top-center edge of the primary monitor that organically stretches and emerges downward with liquid surface tension as the cursor approaches or hovers.

---

## Features & Current Status

Nova Island is under active phased development.

### Implemented Features

- **Phase 1: Project Foundation**
  - Frameless, titlebar-less desktop window with native OS transparency support.
  - Pinned on top of ordinary desktop windows (`alwaysOnTop`).
  - High-DPI-aware coordinate alignment positioned flush against the top edge of the primary display (`y = 0`, centered horizontally).
  - Click-through transparency: Window regions outside the droplet use `pointer-events: none`, preserving full clickability and focus for underlying desktop applications.
- **Phase 2: Physically Inspired Water Droplet + Detachment Animation**
  - **Phase A (Attached Pendant Droplet)**: Modeled after physical pendant drop fluid mechanics—narrow attachment neck at the horizontal screen bezel transitioning into a ballooning circular water bulb (eliminating cone or tapered glass geometries).
  - **Phase B (Detachment Sequence)**: Upon full approach/hover, the neck smoothly pinches off, creating a visible 7px air gap separating the droplet from the screen bezel as it settles into a compact, translucent smoked-glass capsule.
  - **Reattachment & Return**: When the cursor departs, the capsule glides upward, reconnects to the bezel, reforms the liquid neck, and retracts back into the resting contact bead.
  - **Ultra-High Translucency**: Desktop wallpaper, text, and active windows remain visible through the water drop body and detached capsule.
  - **Optical Properties**: Clipped backdrop refraction blur, continuous silvery curved meniscus edge highlights, and neutral grayscale gradients (strictly free of blue, cyan, or artificial glows).
  - **Zero Indicator Artifacts**: 100% clean and natural—no glowing LEDs, indicator dots, or decorative lines.
- **Phase 3: Native Cursor Proximity Detection**
  - Low-overhead Win32 `GetCursorPos` polling thread (30ms interval, 0.0% CPU overhead, no global hook).
  - High-DPI physical-to-logical coordinate translation relative to the primary display.
  - Elliptical interaction halo matching the natural proportions of the droplet.
  - Progressive 4-stage proximity state machine:
    - **Idle** ($> 240\text{ px}$): Tiny $8 \times 4.5\text{ px}$ transparent dewdrop resting at the top bezel.
    - **Approaching** ($120\text{ px} < d \le 240\text{ px}$): Extends downward ($10\text{px}$ neck, $26\text{px}$ round bulb, $19\text{px}$ height).
    - **Near** ($45\text{ px} < d \le 120\text{ px}$): Attached-stretched pendant drop ($7\text{px}$ waist, $44\text{px}$ plump bulb, $35\text{px}$ height) right before pinch-off.
    - **Hovered** ($d \le 45\text{ px}$ or cursor inside capsule): Detaches with visible $7\text{px}$ gap and settles into the $136 \times 32\text{px}$ translucent smoked-glass interaction capsule.
  - Built-in 200ms anti-flicker hysteresis cooldown on exit transitions.
  - Strict zero focus stealing: The background proximity engine reads global coordinates without ever activating or stealing focus from active windows.
  - Win32 `ProcessLifecycleGuard` with named kernel mutex and Windows Job Object (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`) to prevent duplicate instances and eliminate orphaned WebView2 child processes.

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
Runs unit tests for the cursor proximity distance engine and geometry thresholds:
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
│   ├── App.tsx              # Nova Island component & proximity listener
│   ├── App.css              # Liquid water droplet styling, caustics & easing
│   ├── main.tsx             # React DOM root entry point
│   └── vite-env.d.ts        # Vite environment typings
├── src-tauri/               # Native Rust application layer
│   ├── capabilities/        # Tauri 2 capability & permission declarations
│   │   └── default.json
│   ├── icons/               # Windows desktop application icons
│   ├── src/
│   │   ├── main.rs          # Win32 lifecycle guard, mutex & entry point
│   │   ├── lib.rs           # Window setup, primary monitor centering & Tauri run loop
│   │   └── proximity.rs     # Win32 cursor proximity detector & distance math
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
