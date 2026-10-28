# Nova Island

Nova Island is a lightweight, native Windows desktop application inspired by the Dynamic Island concept. Built with **Tauri 2**, **React 19**, **TypeScript**, **Vite 8**, and **Rust**, it lives along the top edge of the primary monitor as an unobtrusive, pointer-anchored transparent glass protrusion that smoothly tracks cursor proximity and expands into a sleek, translucent interaction capsule right at the pointer's location.

**Current Version:** `0.4.0`  
**Changelog:** [CHANGELOG.md](file:///d:/New%20folder%20(2)/CHANGELOG.md)

---

## Features & Current Status

Nova Island is under active phased development.

### Implemented Features

- **Phase 1: Project Foundation**
  - Frameless, titlebar-less desktop overlay window with native OS transparency.
  - Pinned on top of desktop windows (`alwaysOnTop`).
  - High-DPI-aware coordinate alignment flush against the top edge of the primary display (`y = 0`).
  - Win32 `ProcessLifecycleGuard` with named kernel mutex and Windows Job Object (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`) to prevent duplicate instances and eliminate orphaned WebView2 child processes.
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
  - **Hovered / Activated State**: Cursor entering the visible protrusion freezes anchor $X$ and smoothly expands into an interaction capsule right at the cursor's location.
  - **Edge Clamping**: Intelligent boundary clamping prevents the capsule from clipping off the monitor ($78\text{ px} \le \text{anchor}_X \le W_{\text{monitor}} - 78\text{ px}$).
  - **Dynamic Native Click-Through (v0.1.1, v0.2.0 & v0.3.0)**:
    - Automatically enables native click-through (`set_ignore_cursor_events(true)`) whenever the pointer is outside the visible protrusion or dynamic expanded capsule.
    - Dynamically synchronizes OS hit-test boundaries with the capsule's expanded interactive state.
    - Chrome tabs, bookmarks, and adjacent controls receive 100% of mouse clicks without interference.
    - Clicks outside the expanded capsule pass directly to underlying applications.
  - **Zero Focus Stealing**:
    - Configured with Win32 `WS_EX_NOACTIVATE` extended window style so showing or previewing the island never steals foreground keyboard or mouse focus from active applications.
  - **Capsule Dismissal**:
    - Moving away, pressing `Escape`, or window blur immediately deactivates the capsule, unlocks the anchor, and smoothly collapses back to idle.
- **Phase 4: Smart Capsule & Active Tasks (v0.2.0)**
  - **Centered Clock**: The hovered capsule always presents a clean, tabular digit clock (`HH:MM`) strictly in the visual center. Symmetrical CSS Grid layout (`1fr auto 1fr`) ensures the clock remains mathematically centered regardless of slot occupancy.
  - **Windows Media Playback Integration (GSMTC)**: Reads Windows WinRT `GlobalSystemMediaTransportControlsSessionManager` in real time to detect active playback, track title, artist, application identity (Spotify, Chrome, Edge), and live cover artwork streamed via base64 data URIs.
  - **Active Tasks Architecture**: Generic `TaskManager` tracking real system tasks (Media, Timers, Alarms). No mock or fake placeholder indicators.
  - **Adaptive Glass Contrast**: Win32 desktop background luminance sampling ($Y = 0.2126R + 0.7152G + 0.0722B$) behind the capsule anchor point automatically selects between dark and light foreground typography/icons, maintaining high contrast without compromising the transparent smoky glass material.
- **Phase 5: Smooth Smart Capsule Expansion (v0.3.0)**
  - **Click-to-Expand Interaction**: Clicking the compact capsule expands it horizontally to approximately 3.5 times its collapsed width ($92\text{ px} \rightarrow 322\text{ px}$ for clock only, scaling up to $728\text{ px}$ with multiple active tasks).
  - **Intelligent Horizontal Positioning**:
    - Symmetrical expansion left and right when centered along the screen.
    - Edge-favored expansion near left and right screen bezels, strictly preventing the capsule from extending beyond the monitor boundaries.
  - **Smooth Mouse-Leave Collapse**:
    - Automatically retracts upward back to the compact state upon mouse leave with Apple-style `cubic-bezier(0.16, 1, 0.3, 1)` easing.
    - Prevents state oscillation and rapid re-expansion loops.
  - **Synchronized Native Window**:
    - Sized to primary monitor width (`monitor_size.width`), eliminating OS repositioning jitter and boundary clipping.
    - Hit-testing dynamically covers the full expanded footprint while preserving 100% click-through outside.
- **Phase 6: Dynamic Media Island (v0.4.0)**
  - **Interactive Media Island Experience**: Clicking the left-side media icon expands the capsule into a dedicated media player layout originating visually from the media indicator.
  - **Clean Left-to-Right Architecture**:
    1. **Large Album Artwork**: $48 \times 48\text{ px}$ high-resolution artwork occupying the full vertical height with 6px inset spacing within the $60\text{ px}$ tall capsule.
    2. **Track Info & Real Playback Controls**: Located immediately to the right of the artwork (never beneath). Displays track title, artist, scrub progress bar with elapsed and total duration timestamps, and previous / play-pause / next buttons.
    3. **Subtle Hairline Divider**: Refined vertical divider separating the media section from system status.
    4. **Dedicated Right Section**: Vertically centered clock and active secondary task indicators (timers, alarms).
  - **Concentric Outer Curvature**: Inner artwork corners match outer capsule curvature ($R_{\text{concentric}} \approx 22\text{ px}$ within $R_{\text{capsule}} = 30\text{ px}$), cleanly clipped without pixel overflows, square edges, or gaps.
  - **Real Windows GSMTC Controls**: Dispatches real WinRT playback commands (`media_play_pause`, `media_next`, `media_previous`) via native Tauri IPC handlers.
  - **Accurate Playback State**: Preserves media indicator and controls when paused without disappearing or falsely assuming paused equals stopped.
  - **Preserved Transparency & Desktop Click-Through**: 100% transparent glass material maintained across compact and media states; hit-testing dynamically accounts for $400\text{ px} \times 60\text{ px}$ media mode bounds, allowing desktop clicks to pass through freely outside.

### Planned Features (Future Phases)

- System status indicators (battery, volume level, brightness).
- Compact notification and timer toasts.
- User configuration and customization settings.
- Multi-monitor support and Windows startup integration.

---

## Technology Stack

- **Desktop Framework:** [Tauri 2](https://tauri.app/)
- **Frontend:** [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/)
- **Bundler:** [Vite 8](https://vitejs.dev/)
- **Styling:** Vanilla CSS (Glass aesthetics, backdrop filters, spring easing)
- **Native Layer:** [Rust](https://www.rust-lang.org/) with Win32 API (`user32`, `kernel32`)

---

## Versioning & Release Workflow

Nova Island follows [Semantic Versioning (SemVer)](https://semver.org/):

`MAJOR.MINOR.PATCH`

- **PATCH:** Backward-compatible bug fixes and small compatible refinements (e.g., `0.1.1`).
- **MINOR:** Backward-compatible new features (e.g., `0.2.0`).
- **MAJOR:** Incompatible changes or milestone stable releases (e.g., `1.0.0`).

### Synchronized Version Metadata
Version identifiers are kept strictly identical across three project manifests:
1. `package.json` (`version`)
2. `src-tauri/tauri.conf.json` (`version`)
3. `src-tauri/Cargo.toml` (`version`)

CI validates this consistency on every push and pull request via `.github/workflows/ci.yml`.

### Step-by-Step Release Procedure
For every future published version:
1. **Determine Version Increment**: Choose `PATCH`, `MINOR`, or `MAJOR` according to SemVer rules.
2. **Update Version Manifests**: Update `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` simultaneously.
3. **Update Changelog**: Add a dated release section to `CHANGELOG.md` following [Keep a Changelog](https://keepachangelog.com/) standards (`Added`, `Changed`, `Fixed`, `Removed`, `Known Issues`).
4. **Run Verification Suite**:
   ```powershell
   npm.cmd run build
   cargo test --manifest-path src-tauri/Cargo.toml
   ```
5. **Review Git Diff & Status**: Inspect all staged changes to ensure no extraneous or sensitive files are included.
6. **Commit Versioned Changes**:
   ```powershell
   git commit -m "chore(release): bump version to x.y.z"
   ```
7. **Push to GitHub**: Push the commit to the verified branch (`main`).
8. **Create Git Tag**:
   ```powershell
   git tag -a vx.y.z -m "Release vx.y.z"
   git push origin vx.y.z
   ```
9. **Publish GitHub Release**: Create a GitHub Release referencing the tag, with human-readable release notes derived from `CHANGELOG.md`. Do not attach downloadable binaries unless the build artifacts have been compiled and verified.

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
Runs TypeScript type check and creates the production web bundle in `dist/`:
```powershell
npm.cmd run build
```

### 4. Run Desktop Application (Tauri Dev Mode)
Compiles the Rust desktop layer and launches the native transparent window on Windows:
```powershell
npm.cmd run tauri dev
```

### 5. Run Rust Unit Tests
Runs unit tests for pointer tracking math, edge clamping, progressive reveal, and click-through hit testing:
```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```

---

## Troubleshooting & Windows Notes

### WebView2 Error `0x800700AA` ("The requested resource is in use")
Windows WebView2 acquires an exclusive lock on its User Data Directory (`%LOCALAPPDATA%\com.novaisland.app\EBWebView`).

- **Cause:** Occurs if multiple instances of Nova Island are launched simultaneously or if an orphaned `msedgewebview2.exe` process from a previous crashed run holds the profile lock.
- **Built-in Guard:** Nova Island includes a native Win32 `ProcessLifecycleGuard` in `src-tauri/src/main.rs`. It binds the application to a Windows Job Object (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`), ensuring that whenever the host process terminates, all child WebView2 processes are immediately cleaned up by the operating system. It also uses a named kernel mutex (`Local\NovaIsland_App_SingleInstance_Mutex`) to prevent duplicate instances from opening the same profile.
- **Manual Cleanup (if needed):**
  ```powershell
  Get-Process -Name "nova-island*" -ErrorAction SilentlyContinue | Stop-Process -Force
  ```

### PowerShell Script Execution Policy
On Windows, if running `npm` produces a script execution policy error regarding `npm.ps1`, use `npm.cmd` explicitly instead of `npm`. The project's `tauri.conf.json` is pre-configured to invoke `npm.cmd` directly.

---

## Project Structure

```
├── .github/
│   └── workflows/
│       └── ci.yml           # Automated CI verification for build, tests & version consistency
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
│   │   ├── lib.rs           # Window setup, WS_EX_NOACTIVATE, click-through & Tauri run loop
│   │   └── proximity.rs     # Win32 cursor tracking & progressive reveal engine
│   ├── Cargo.toml           # Rust package configuration & dependencies
│   ├── build.rs             # Tauri build script
│   └── tauri.conf.json      # Window size, transparency & bundle config
├── .gitignore               # Ignored build outputs and sensitive files
├── CHANGELOG.md             # Semantic versioned release history
├── index.html               # Frameless transparent web container
├── package.json             # NPM dependencies, scripts & project version
├── tsconfig.json            # TypeScript configuration
└── vite.config.ts           # Vite development and build settings
```

---

## License & Contributing

License is currently undecided / TBD. Contributions, bug reports, and feedback are welcome.
