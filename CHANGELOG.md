# Changelog

All notable changes to Nova Island are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
