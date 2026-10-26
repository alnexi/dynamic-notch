// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "windows")]
mod windows_process {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "kernel32")]
    extern "system" {
        fn CreateMutexW(
            lpMutexAttributes: *mut std::ffi::c_void,
            bInitialOwner: i32,
            lpName: *const u16,
        ) -> *mut std::ffi::c_void;
        fn GetLastError() -> u32;
        fn CloseHandle(hObject: *mut std::ffi::c_void) -> i32;
    }

    const ERROR_ALREADY_EXISTS: u32 = 183;

    pub struct SingleInstanceGuard {
        handle: *mut std::ffi::c_void,
    }

    impl SingleInstanceGuard {
        pub fn acquire() -> Result<Self, ()> {
            let name: Vec<u16> = OsStr::new("Local\\NovaIsland_App_SingleInstance_Mutex\0")
                .encode_wide()
                .collect();
            let handle = unsafe { CreateMutexW(std::ptr::null_mut(), 1, name.as_ptr()) };
            if handle.is_null() {
                return Ok(Self {
                    handle: std::ptr::null_mut(),
                });
            }

            let last_error = unsafe { GetLastError() };
            if last_error == ERROR_ALREADY_EXISTS {
                unsafe { CloseHandle(handle) };
                return Err(());
            }

            Ok(Self { handle })
        }
    }

    impl Drop for SingleInstanceGuard {
        fn drop(&mut self) {
            if !self.handle.is_null() {
                unsafe { CloseHandle(self.handle) };
            }
        }
    }
}

fn main() {
    #[cfg(target_os = "windows")]
    let _guard = match windows_process::SingleInstanceGuard::acquire() {
        Ok(guard) => guard,
        Err(_) => {
            eprintln!("[NovaIsland] Another instance of Nova Island is already running.");
            eprintln!("[NovaIsland] Exiting this launch to avoid WebView2 profile lock conflict (0x800700AA).");
            std::process::exit(0);
        }
    };

    nova_island_lib::run();
}
