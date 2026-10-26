# Nova Island

Nova Island is a lightweight, native Windows desktop application inspired by the Dynamic Island concept. Built with **Tauri 2**, **React**, **TypeScript**, **Vite**, and **Rust**, it lives along the top edge of the primary monitor as an unobtrusive, pointer-anchored transparent glass bubble that smoothly tracks cursor proximity and expands into a sleek, translucent interaction capsule right at the pointer's location.

---

## Features & Current Status

Nova Island is under active phased development.

### Implemented Features

- **Phase 1: Project Foundation**
  - Frameless, titlebar-less desktop window with native OS transparency support.
  - Pinned on top of ordinary desktop windows (`alwaysOnTop`).
  - High-DPI-aware coordinate alignment positioned flush against the top edge of the primary display (`y = 0`).
  - Click-through transparency: Window regions outside the bubble/capsule use `pointer-events: none`, preserving full clickability and focus for underlying desktop applications.
- **Phase 2: Premium Transparent Glass Bubble + Motion Graphics**
  - **Visual Identity**: Smooth, spherical glass bubble with subtle optical depth and refined specular reflections.
  - **Continuous Morphing Animation**: A single continuous glass element that widens and morphs from a hanging spherical bubble into a horizontal interaction capsule with gentle, controlled overshoot settle (`cubic-bezier(0.2, 0.95, 0.3, 1.05)`).
  - **Translucent Smoky Glass**: Refined neutral backdrop blur (`blur(16px) saturate(140%) contrast(106%)`) and consistent smoky glass transparency across every state, ensuring desktop wallpapers, text, and active windows remain visible through the glass at all times.
  - **Preserved Full Transparency in Capsule**: The capsule never changes to a darker or opaque fill upon activation, preserving the exact same base color and see-through clarity as the bubble throughout the entire morph.
  - **Curved Specular Sheen**: Dynamic overhead light reflection that smoothly reshapes in tandem with the glass body.
  - **Zero Indicator Artifacts**: 100% clean and minimal—strictly free of blue/cyan dots, green LEDs, or artificial glowing indicators.
- **Phase 3: Pointer-Anchored Tracking & Native Proximity**
  - **Full Top-Edge Horizontal Tracking**: The bubble and capsule are anchored directly to the user's horizontal cursor position ($X$) along the entire top edge of the primary display rather than being locked to screen center:
    - Approaching near the far left $\rightarrow$ bubble emerges near the left edge.
    - Approaching near the center $\rightarrow$ bubble emerges at the center.
    - Approaching near the far right $\rightarrow$ bubble emerges near the right edge.
  - **Edge Clamping**: Intelligent boundary clamping prevents the $148\text{ px}$ capsule from clipping off the monitor ($78\text{ px} \le \text{anchor}_X \le W_{\text{monitor}} - 78\text{ px}$).
  - **Frozen Anchor on Activation**: When the cursor enters the bubble, the anchor coordinate freezes, and the capsule expands symmetrically right at the cursor's entry point without jumping to center or drifting during interaction.
  - **Keyboard & Click-Outside Dismissal**: Pressing `Escape` or clicking outside immediately deactivates the capsule, unlocks the anchor, and smoothly collapses back to idle.
  - **100% Invisible Idle State**: When the mouse is not near the top edge, the island is completely invisible with `pointer-events: none`, ensuring complete desktop click-through.
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
Runs unit tests for pointer tracking math and monitor edge clamping:
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
│   ├── App.css              # Transparent glass styling & motion graphics
│   ├── main.tsx             # React DOM root entry point
│   └── vite-env.d.ts        # Vite environment typings
├── src-tauri/               # Native Rust application layer
│   ├── capabilities/        # Tauri 2 capability & permission declarations
│   │   └── default.json
│   ├── icons/               # Windows desktop application icons
│   ├── src/
│   │   ├── main.rs          # Win32 lifecycle guard, mutex & entry point
│   │   ├── lib.rs           # Window setup, anchor locking & Tauri run loop
│   │   └── proximity.rs     # Win32 cursor tracking & edge clamping engine
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
