# Changelog

All notable changes to Nova Island are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.6.0] - 2026-10-29

### Summary
Implemented True Content-Adaptive Capsule Sizing for Nova Island Media Island. Replaced estimation-only canvas text measurements with true rendered DOM measurements and unconstrained subpixel typography nodes, completely removed the arbitrary 560px width cap and 74px height ceiling, enabled dynamic vertical expansion (60px, 74px, 88px, 96px+) accommodating multi-line title wrapping and content stacks without feedback loops, and synchronized dynamic native Tauri window resizing and hit-test boundaries to preserve 100% desktop click-through outside the active capsule.

### Added
- **True Rendered DOM Measurement & Intrinsic Sizing (`src/components/MediaIsland.tsx`, `src/utils/geometry.ts`)**:
  - Implemented high-fidelity offscreen measurement nodes using the exact DirectWrite / Blink typography engine, letter-spacing, and font glyph fallback for unconstrained title and artist dimensions.
  - Added an inner content stack wrapper (`.media-controls-content`) with `height: auto` that cleanly separates intrinsic content measurements from the parent container's allocated dimensions.
  - Attached a `ResizeObserver` and `useLayoutEffect` with threshold filtering (`diff > 2px`) to detect dynamic layout updates (such as multi-line wrapping) while strictly preventing resize feedback loops.
- **Uncapped Content-Adaptive Width (`src/utils/geometry.ts`, `src/App.tsx`, `src/App.css`)**:
  - Completely removed the legacy arbitrary 560px width cap (`MEDIA_MAX_WIDTH`).
  - Wide track titles now expand smoothly horizontally (e.g. 600px, 700px, 800px+) across the screen when monitor space permits, keeping titles cleanly on a single line.
  - Width is strictly constrained only by safe monitor bezel margins (`SCREEN_MARGIN = 10px`) and left/right corner proximity.
- **True Content-Adaptive Height (`src/utils/geometry.ts`, `src/App.css`, `src/components/MediaIsland.tsx`)**:
  - Completely eliminated the rigid 74px height ceiling (`MEDIA_WRAPPED_HEIGHT`).
  - Expanded capsule height dynamically scales (60px base, 74px for 2-line wrapped titles, 88px for 3-line wrapped titles or denser controls stacks, up to 96px+ when required).
  - Maintained concentric curve hierarchy with proportional rounded-rectangle corner radius scaling from 20px (60px height) to 26px (96px+ height), never degrading into an oversized pill shape.
  - Kept 48x48 album artwork (`--media-artwork-radius: 10px`), divider, and clock/status area perfectly centered vertically across all dynamic heights.
- **Dynamic Native Tauri Window Resizing & Hit-Test Synchronization (`src-tauri/src/lib.rs`, `src-tauri/src/proximity.rs`)**:
  - Added dynamic native window height adjustment (`(height + 36.0).max(100.0)`) via `nova-expand-capsule` and `sync_capsule_geometry` command, ensuring expanded capsules and soft drop shadows are never clipped by the OS window boundary.
  - Maintained window top-edge pinning with `(monitor_pos.x, monitor_pos.y)` during dynamic window resize operations.
  - Instantly restores native window height to 100px upon collapse, dismissal, or timeout.
  - Synchronized Rust hit-test detector and auto-collapse threshold (`max_leave_y = height + 26.0`) with dynamic heights, maintaining 100% click-through to Chrome tabs and desktop controls outside the dynamic capsule footprint.

---

## [0.5.0] - 2026-10-29

### Summary
Introduced Content-Adaptive Capsule Geometry for the expanded Media Island and corrected capsule roundness. Dimensions are now calculated dynamically from actual content (short titles produce a sleek compact width of ~280px-320px, normal titles ~340px-420px, and longer titles scale up to 560px within monitor margins; height expands to 74px when title wrapping is required). Semicircular pill roundness in the expanded state has been replaced by a sophisticated 20px-24px rounded-rectangle curvature, and native Tauri hit-testing is fully synchronized with content-derived dimensions.

### Added
- **Content-Adaptive Width & Height (`src/utils/geometry.ts`, `src/App.tsx`, `src/App.css`)**:
  - Dynamically calculates the required capsule dimensions using exact canvas/system font text metrics:
    - Fixed structural elements: 48x48 artwork, internal paddings, hairline divider, and centered clock/status section.
    - Content section: Playback controls row, progress bar with timestamps, track title, and artist name.
    - Short titles (e.g. "Boht"): Compact, proportionate capsule width (~280px-320px) rather than an inflated fixed width.
    - Normal titles: Proportional width scaling (~340px-420px).
    - Longer titles: Given additional space up to 560px when screen space allows.
    - Title wrapping & height expansion: When horizontal space is constrained or for very long titles, the title gracefully wraps to 2 lines and the capsule expands in height from 60px to 74px without clipping or colliding with controls.
    - Monitor boundary clamping: Strictly confines dimensions within `[SCREEN_MARGIN, monitor_width - SCREEN_MARGIN]`.
- **Proportional Rounded-Rectangle Curvature (`src/App.css`, `src/utils/geometry.ts`)**:
  - Replaced the oversized semicircular pill silhouette (`calc(height / 2)`) with a proportional 20px-24px rounded-rectangle corner radius (`--capsule-radius`) in the expanded state.
  - Preserved the compact 17px pill radius in the collapsed state (34px height) with smooth CSS transitions (`border-radius 0.40s cubic-bezier(0.16, 1, 0.3, 1)`).
  - Preserved the 10px rounded-rectangle album artwork corner radius (`--media-artwork-radius`), creating a balanced concentric curve hierarchy.
  - Aligned specular reflection sheen (`.glass-specular`) with the updated corner radius.
- **Synchronized Native Hit-Testing (`src-tauri/src/proximity.rs`, `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`)**:
  - Extended `start_proximity_detector` and `compute_expanded_bounds` with dynamic width and height synchronization via Tauri IPC events (`nova-expand-capsule`).
  - Increased native window height to 100px in `tauri.conf.json` and `lib.rs` to comfortably host taller expanded capsules (up to 74px) and soft drop shadows without clipping.
  - Win32 click-through detection dynamically covers the exact rendered footprint, maintaining 100% desktop click-through outside.

---

## [0.4.1] - 2026-10-29

### Summary
Fixed missing album artwork from Windows Media Player (uncompressed BMP/large stream support, dynamic MIME detection, and non-blocking in-memory thumbnail caching), constrained long track titles and artist names with single-line ellipsis to eliminate text overflow and collision with capsule boundaries or controls, and corrected album artwork corner curvature to a controlled 10px rounded-rectangle matching the capsule's visual language.

### Fixed
- **Long Track Titles & Text Overflow (`src/App.css`, `src/components/MediaIsland.tsx`)**:
  - Constrained `.media-controls-container` with `flex: 1 1 0%`, `min-width: 0`, and `overflow: hidden`, strictly bounding the text region between the artwork and the right-side divider/clock.
  - Applied `min-width: 0`, `max-width: 100%`, `overflow: hidden`, and `text-overflow: ellipsis` on both `.media-track-info`, `.media-title`, and `.media-artist`.
  - Long song titles and artist names now truncate cleanly on a single line with an ellipsis (`...`) without overflowing the capsule, colliding with the clock, playback controls, artwork, or screen bezels.
  - Preserved typography, line height, and spacing for normal and short titles.
- **Windows Media Player Album Artwork Retrieval (`src-tauri/src/media.rs`)**:
  - Fixed silent thumbnail rejection: Windows Media Player (`Microsoft.ZuneMusic`) frequently serves uncompressed bitmaps (`image/bmp`) exceeding 2MB (e.g. 2.25MB+). Increased stream size limit to 15MB to support high-resolution uncompressed covers.
  - Dynamic MIME detection: Rather than hardcoding `data:image/jpeg;base64`, the backend now inspects `stream.ContentType()` and binary magic bytes (`image/bmp`, `image/png`, `image/jpeg`, `image/webp`, `image/gif`) to construct valid, browser-compatible data URIs.
  - Session fallback (`get_best_session`): If `GetCurrentSession()` returns None, the manager queries `GetSessions()` for active `Playing` or `Paused` sessions.
  - In-memory thumbnail caching (`THUMBNAIL_CACHE`): Caches encoded thumbnail data URIs by `source_app|title|artist` to prevent redundant disk/stream reads and base64 encoding on every 250ms proximity tick, ensuring completely non-blocking UI and instantaneous responsiveness.
  - Graceful frontend fallback: Added `onError` handling on artwork image elements in `MediaIsland.tsx` to automatically display the clean fallback icon without broken image glyphs.
- **Album Artwork Corner Curvature (`src/App.css`, `src/components/MediaIsland.tsx`)**:
  - Replaced the excessively rounded 22px radius (which gave the 48px square artwork a near-circular disc appearance) with a controlled 10px rounded-rectangle radius (`--media-artwork-radius: 10px`).
  - The artwork now presents an authentic album sleeve appearance whose four corners visually match the capsule's rounded contour without appearing circular or sharply square.
  - Maintained crisp `overflow: hidden` image clipping with zero pixel bleed or transparent gaps.

---

## [0.4.0] - 2026-10-28

### Summary
Implemented the integrated Dynamic Media Island experience inside the existing transparent capsule. Clicking the left-side media icon expands the capsule into an Apple-inspired media layout featuring large 48x48px album artwork with concentric curvature matching the capsule's outer radius, track title and artist, playback progress bar with live duration labels, real Windows GSMTC playback controls (Previous, Play/Pause, Next) via Tauri IPC, subtle hairline divider, and dedicated right-side section with vertically centered clock and status indicators—all strictly preserving full glass transparency and native desktop click-through.

### Added
- **Integrated Dynamic Media Island Layout (`src/components/MediaIsland.tsx`, `src/App.css`)**:
  - **Left-to-Right Flow**:
    1. **Large Album Artwork**: $48 \times 48\text{px}$ artwork on the left, occupying the full intended vertical height with consistent 6px inset spacing within the 60px capsule.
    2. **Track Info & Playback Controls**: Dedicated section strictly to the **RIGHT** of the album artwork (never placed beneath). Displays track title, artist/source, progress bar with elapsed and total duration, and playback control buttons.
    3. **Subtle Hairline Divider**: Visual vertical separation between the media section and system status area.
    4. **Dedicated Right Section**: Vertically centered clock and supported status indicators (timers, alarms).
- **Concentric Artwork Curvature**:
  - The artwork outer corner radius ($R_{\text{concentric}} \approx 22\text{px}$) visually mirrors the capsule's outer boundary curvature ($R_{\text{outer}} = 30\text{px}$ minus $6\text{px}$ inset), clipping cleanly with zero overflow, square corners, or transparent gaps.
- **Real Windows GSMTC Playback Controls (`src-tauri/src/media.rs`, `src-tauri/src/lib.rs`)**:
  - Added native WinRT `TryTogglePlayPauseAsync()`, `TrySkipNextAsync()`, and `TrySkipPreviousAsync()` implementations.
  - Exposed `media_play_pause`, `media_next`, and `media_previous` Tauri IPC commands.
  - Extracted playback timeline properties (`GetTimelineProperties()`) providing position and duration in seconds.
  - Accurately tracks both actively playing and paused media sessions, preserving the media indicator and controls without vanishing when playback is paused.
- **Intelligent Motion & Dynamic Hit-Testing (`src-tauri/src/proximity.rs`, `src/utils/geometry.ts`)**:
  - Smooth expansion from the left-side media icon to a $400\text{px} \times 60\text{px}$ capsule with coordinated height, width, and border-radius transitions.
  - Native window height adjusted to 88px in `tauri.conf.json` and `lib.rs` to comfortably host the expanded 60px media capsule with drop shadows and blur without clipping.
  - Dynamic hit-test calculation for media mode (`is_media_mode: Arc<AtomicBool>`, `MEDIA_EXPANDED_WIDTH = 400.0`, `max_y = 68.0`) maintaining 100% desktop click-through outside the expanded bounds.
  - Smooth upward retraction back to compact state upon mouse leave.
- **Unit Test Suite Expansion**:
  - Added unit tests for media mode expanded bounds at screen center, left corner, right corner, and media hit-test boundary checks (15 tests passing).

### Changed
- Bumped semantic version to `0.4.0` across `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.

---

## [0.3.0] - 2026-10-27

### Summary
Introduced smooth smart capsule horizontal expansion on click (~3.5x collapsed width), intelligent boundary positioning (symmetrical near center, edge-favored near left/right screen corners), smooth upward mouse-leave collapse with oscillation prevention, synchronized native hit-testing across the primary monitor width, and a comprehensive test suite covering expansion geometry and boundaries.

### Added
- **Click-to-Expand Interaction**: Clicking the compact capsule expands it horizontally to approximately 3.5 times its collapsed width (calculated dynamically from actual collapsed width: 92px $\rightarrow$ 322px for clock-only, scaling up to 728px for multiple active tasks).
- **Intelligent Horizontal Positioning (`src/utils/geometry.ts`, `src-tauri/src/proximity.rs`)**:
  - **Near Center**: Symmetrical expansion left and right around the anchor point.
  - **Near Left Corner**: Pins the left edge to the screen margin and expands primarily to the right, strictly avoiding screen boundary clipping.
  - **Near Right Corner**: Pins the right edge to the screen margin and expands primarily to the left, strictly avoiding screen boundary clipping.
  - **Monitor Boundary Clamping**: Respects actual monitor boundaries and bezel safety margins across arbitrary pointer positions.
- **Smooth Mouse-Leave Collapse**:
  - Automatically collapses back toward the top edge when the cursor leaves the expanded interactive region, without requiring a second click.
  - Coordinated width, height, transform, and opacity transitions with Apple-inspired `cubic-bezier(0.16, 1, 0.3, 1)` easing for smooth, organic retraction.
  - Oscillation prevention: Expansion strictly requires an explicit click; pointer movement inside the expanded area does not cause false mouse leave, and collapsing does not retrigger expansion.
- **Synchronized Native Window & Hit-Testing (`src-tauri/src/lib.rs`, `src-tauri/src/proximity.rs`)**:
  - Aligned native Tauri window size to cover the primary monitor width (`monitor_size.width`), eliminating window boundary clipping and removing OS window repositioning overhead.
  - Native hit-testing dynamically switches to expanded bounds (`is_cursor_in_expanded_capsule`), ensuring desktop click-through is 100% maintained outside the dynamic capsule footprint.
- **Test Suite Expansion**: Added unit tests covering center symmetrical expansion, left-corner pinning, right-corner pinning, 3.5x factor calculation, and expanded hit-test boundary checks (11 tests passing).

### Changed
- Bumped semantic version to `0.3.0` across `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.

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
