# Changelog

All notable changes to Nova Island are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.0] - 2026-10-27

### Summary
Introduced the Smart Capsule with centered clock, dynamic active task indicators (Windows Media GSMTC, Timers, Alarms), dynamic horizontal expansion matching native click-through boundaries, and adaptive glass contrast.

### Added
- **Centered Clock**: The expanded capsule always presents a clean, tabular digit clock (`HH:MM`) strictly in the visual center. Symmetrical CSS Grid layout (`1fr auto 1fr`) ensures the clock remains mathematically centered regardless of slot occupancy.
- **Dynamic Active Tasks Management**: Real-time native `TaskManager` tracking active tasks without placeholder or fake indicators:
  - **Media Playback Status**: Integrated with Windows WinRT `GlobalSystemMediaTransportControlsSessionManager` (GSMTC) to detect active playback, track metadata, source application identity (Spotify, Chrome, Edge), and real-time cover artwork via base64 data URIs.
  - **Timer & Alarm Support**: First-class tracking for countdown timers and scheduled alarms, with automatic slot assignment (`slot-left` for media, `slot-right` for timers and alarms).
  - **Tauri IPC Commands**: Added `start_timer`, `cancel_timer`, `set_alarm`, `cancel_alarm`, and `get_active_tasks` backend commands.
- **Dynamic Capsule Expansion & Hit-Testing**:
  - The capsule expands horizontally only as much as necessary: 92px (clock only), 136px (1 task), 172px (2 tasks), 208px (3+ tasks).
  - The native Rust background thread dynamically synchronizes its hit-test boundary (`get_capsule_half_width`) with active task count, ensuring mouse clicks outside the dynamic capsule pass straight to desktop and browser controls.
- **Adaptive Glass Contrast**:
  - Win32 desktop background luminance sampling ($Y = 0.2126R + 0.7152G + 0.0722B$) behind the capsule anchor point with Windows registry theme fallback.
  - Automatically switches between `.contrast-light-bg` and `.contrast-dark-bg`, adapting text and icon contrast while strictly preserving transparent smoky glass material across all states.
- **Test Suite Expansion**: Added unit tests for dynamic capsule half-width calculation, timer lifecycle management, and alarm lifecycle management.

### Changed
- Bumped semantic version to `0.2.0` across `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.

---

## [0.1.1] - 2026-10-26

### Summary
Fixed native Windows desktop click interception during proximity preview and expanded states, prevented window focus stealing, and established a formalized Semantic Versioning and release workflow.

### Fixed
- **Desktop Click-Through Blocking**: The native Tauri window and underlying WebView2 HWND no longer block clicks on Chrome tabs, browser controls, or adjacent desktop windows while the proximity preview is visible. Native input transparency (`set_ignore_cursor_events(true)`) is dynamically maintained whenever the pointer is outside the visible protrusion or expanded capsule.
- **Focus Stealing Prevention**: Applied the Win32 `WS_EX_NOACTIVATE` extended window style during native window setup. The preview and island never steal foreground keyboard or mouse focus from active applications (e.g. Google Chrome, code editors).
- **Capsule Dismissal**: Added click-to-dismiss behavior on the expanded capsule alongside existing `Escape` key and window `blur` handlers.

### Changed
- **Version Alignment**: Synchronized semantic version `0.1.1` across `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.
- **Hit-Test Test Suite**: Added `test_click_through_hit_test_boundaries` to verify protrusion and capsule hit testing boundaries in Rust.

### Known Issues
- Proximity tracking is currently scoped to the primary display; multi-monitor support across secondary displays is planned for a future release.

---

## [0.1.0] - 2026-10-26

### Summary
Initial development release of Nova Island for Windows.

### Added
- Frameless, titlebar-less desktop overlay window utilizing Tauri 2, React 19, TypeScript, Vite, and Rust.
- Low-overhead Win32 `GetCursorPos` background proximity detector.
- Pointer-anchored horizontal positioning across the top edge of the primary display with boundary edge clamping.
- Subtle curved glass protrusion with 4-stage progressive reveal (Idle, Approaching, Near, Hovered).
- 100% transparent smoky glass material across all states with zero opaque colors, dots, or artificial LEDs.
- Win32 single-instance mutex (`Local\NovaIsland_App_SingleInstance_Mutex`) and Windows Job Object guard (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`) to prevent orphaned WebView2 processes.
