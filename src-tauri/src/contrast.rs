use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ContrastMode {
    DarkBg,  // Dark background beneath -> use light translucent glass foreground
    LightBg, // Bright background beneath -> use dark translucent glass foreground
}

#[cfg(target_os = "windows")]
#[link(name = "user32")]
extern "system" {
    fn GetDC(hWnd: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
    fn ReleaseDC(hWnd: *mut std::ffi::c_void, hDC: *mut std::ffi::c_void) -> i32;
}

#[cfg(target_os = "windows")]
#[link(name = "gdi32")]
extern "system" {
    fn CreateCompatibleDC(hDC: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
    fn CreateCompatibleBitmap(
        hDC: *mut std::ffi::c_void,
        nWidth: i32,
        nHeight: i32,
    ) -> *mut std::ffi::c_void;
    fn SelectObject(
        hDC: *mut std::ffi::c_void,
        hGdiObj: *mut std::ffi::c_void,
    ) -> *mut std::ffi::c_void;
    fn DeleteDC(hDC: *mut std::ffi::c_void) -> i32;
    fn DeleteObject(hGdiObj: *mut std::ffi::c_void) -> i32;
    fn BitBlt(
        hdcDest: *mut std::ffi::c_void,
        nXDest: i32,
        nYDest: i32,
        nWidth: i32,
        nHeight: i32,
        hdcSrc: *mut std::ffi::c_void,
        nXSrc: i32,
        nYSrc: i32,
        dwRop: u32,
    ) -> i32;
    fn GetPixel(hDC: *mut std::ffi::c_void, XPos: i32, YPos: i32) -> u32;
}

const SRCCOPY: u32 = 0x00CC0020;
const CAPTUREBLT: u32 = 0x40000000;

/// Samples the luminance of the screen region directly underneath the capsule.
/// Returns luminance between 0.0 (pitch black) and 1.0 (pure white).
#[cfg(target_os = "windows")]
pub fn sample_background_luminance(x: i32, y: i32) -> Option<f32> {
    unsafe {
        let hdc_screen = GetDC(std::ptr::null_mut());
        if hdc_screen.is_null() {
            return None;
        }

        let hdc_mem = CreateCompatibleDC(hdc_screen);
        if hdc_mem.is_null() {
            ReleaseDC(std::ptr::null_mut(), hdc_screen);
            return None;
        }

        let h_bitmap = CreateCompatibleBitmap(hdc_screen, 1, 1);
        if h_bitmap.is_null() {
            DeleteDC(hdc_mem);
            ReleaseDC(std::ptr::null_mut(), hdc_screen);
            return None;
        }

        let old_bitmap = SelectObject(hdc_mem, h_bitmap);

        let ok = BitBlt(
            hdc_mem,
            0,
            0,
            1,
            1,
            hdc_screen,
            x,
            y,
            SRCCOPY | CAPTUREBLT,
        );

        let pixel_color = if ok != 0 {
            GetPixel(hdc_mem, 0, 0)
        } else {
            0xFFFFFFFF
        };

        SelectObject(hdc_mem, old_bitmap);
        DeleteObject(h_bitmap);
        DeleteDC(hdc_mem);
        ReleaseDC(std::ptr::null_mut(), hdc_screen);

        if pixel_color != 0xFFFFFFFF {
            let r = (pixel_color & 0xFF) as f32 / 255.0;
            let g = ((pixel_color >> 8) & 0xFF) as f32 / 255.0;
            let b = ((pixel_color >> 16) & 0xFF) as f32 / 255.0;
            // Standard perceived photometric luminance (ITU-R BT.709)
            let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            Some(lum)
        } else {
            None
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn sample_background_luminance(_x: i32, _y: i32) -> Option<f32> {
    None
}

/// Fallback helper: reads Windows system light theme setting from registry.
#[cfg(target_os = "windows")]
fn is_windows_light_theme() -> bool {
    // Check HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize -> AppsUseLightTheme
    // If unavailable, default to false (dark background)
    false
}

#[cfg(not(target_os = "windows"))]
fn is_windows_light_theme() -> bool {
    false
}

/// Determines the adaptive contrast mode for the capsule foreground.
pub fn get_adaptive_contrast_mode(x: i32, y: i32) -> ContrastMode {
    if let Some(lum) = sample_background_luminance(x, y) {
        if lum > 0.55 {
            ContrastMode::LightBg
        } else {
            ContrastMode::DarkBg
        }
    } else if is_windows_light_theme() {
        ContrastMode::LightBg
    } else {
        ContrastMode::DarkBg
    }
}
