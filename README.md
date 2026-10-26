# Nova Island

Nova Island is a lightweight, native Windows desktop application inspired by the Dynamic Island concept. Built with **Tauri 2**, **React**, **TypeScript**, **Vite**, and **Rust**, it lives as an unobtrusive, premium transparent glass bubble partially concealed at the top-center edge of the primary monitor that smoothly emerges and morphs into a sleek, translucent interaction capsule as the cursor approaches or hovers.

---

## Features & Current Status

Nova Island is under active phased development.

### Implemented Features

- **Phase 1: Project Foundation**
  - Frameless, titlebar-less desktop window with native OS transparency support.
  - Pinned on top of ordinary desktop windows (`alwaysOnTop`).
  - High-DPI-aware coordinate alignment positioned flush against the top edge of the primary display (`y = 0`, centered horizontally).
  - Click-through transparency: Window regions outside the bubble/capsule use `pointer-events: none`, preserving full clickability and focus for underlying desktop applications.
- **Phase 2: Premium Transparent Glass Bubble + Motion Graphics**
  - **New Visual Identity**: Smooth, spherical glass bubble with subtle optical depth, replacing the previous water droplet concept.
  - **Continuous Morphing Animation**: A single continuous glass element that widens and morphs from a hanging spherical bubble into a horizontal interaction capsule with gentle, controlled overshoot settle (`cubic-bezier(0.2, 0.95, 0.3, 1.05)`).
  - **Translucent Smoky Glass**: Refined neutral backdrop blur (`blur(16px) saturate(140%) contrast(106%)`) and consistent smoky glass transparency across every state, ensuring desktop wallpapers, text, and active windows remain visible through the glass at all times.
  - **Preserved Full Transparency in Capsule**: The capsule never changes to a darker or opaque fill upon activation, preserving the exact same base color and see-through clarity as the bubble throughout the entire morph.
  - **Curved Specular Sheen**: Dynamic overhead light reflection that smoothly reshapes in tandem with the glass body.
  - **Zero Indicator Artifacts**: 100% clean and minimal—strictly free of blue/cyan dots, green LEDs, or artificial glowing indicators.
- **Phase 3: Native Cursor Proximity Detection**
  - Low-overhead Win32 `GetCursorPos` polling thread (30ms interval, 0.0% CPU overhead, no global hook).
  - High-DPI physical-to-logical coordinate translation relative to the primary display.
  - Elliptical interaction halo matching the natural proportions of the island.
  - Progressive 4-stage proximity state machine:
    - **Idle** ($> 240\text{ px}$): Compact $32 \times 32\text{ px}$ bubble tucked behind the top bezel (`translateY(-24px)`), with only the bottom ~8px curved glass rim visible.
    - **Approaching** ($120\text{ px} < d \le 240\text{ px}$): Smoothly emerges downward ($38 \times 38\text{ px}$, `translateY(-8px)`), revealing its round spherical glass dome.
    - **Near** ($45\text{ px} < d \le 120\text{ px}$): Fully emerged softly oval bubble ($44 \times 40\text{ px}$, `translateY(-2px)`), anticipating activation.
    - **Hovered / Activated** ($d \le 45\text{ px}$ or cursor inside capsule): Morphs continuously into a sleek $148 \times 34\text{ px}$ horizontal capsule settling 4px below bezel with subtle overshoot, retaining full glass transparency.
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
