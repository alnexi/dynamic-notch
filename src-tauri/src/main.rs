// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "windows")]
mod windows_process {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    #[repr(C)]
    struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
        per_process_user_time_limit: i64,
        per_job_user_time_limit: i64,
        limit_flags: u32,
        minimum_working_set_size: usize,
        maximum_working_set_size: usize,
        active_process_limit: u32,
        affinity: usize,
        priority_class: u32,
        scheduling_class: u32,
    }

    #[repr(C)]
    struct IO_COUNTERS {
        read_operation_count: u64,
        write_operation_count: u64,
        other_operation_count: u64,
        read_transfer_count: u64,
        write_transfer_count: u64,
        other_transfer_count: u64,
    }

    #[repr(C)]
    struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
        basic_limit_information: JOBOBJECT_BASIC_LIMIT_INFORMATION,
        io_info: IO_COUNTERS,
        process_memory_limit: usize,
        job_memory_limit: usize,
        peak_process_memory_used: usize,
        peak_job_memory_used: usize,
    }

    const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x00002000;
    const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS: i32 = 9;
    const ERROR_ALREADY_EXISTS: u32 = 183;

    #[link(name = "kernel32")]
    extern "system" {
        fn CreateMutexW(
            lpMutexAttributes: *mut std::ffi::c_void,
            bInitialOwner: i32,
            lpName: *const u16,
        ) -> *mut std::ffi::c_void;
        fn GetLastError() -> u32;
        fn CloseHandle(hObject: *mut std::ffi::c_void) -> i32;
        fn CreateJobObjectW(
            lpJobAttributes: *mut std::ffi::c_void,
            lpName: *const u16,
        ) -> *mut std::ffi::c_void;
        fn SetInformationJobObject(
            hJob: *mut std::ffi::c_void,
            JobObjectInformationClass: i32,
            lpJobObjectInformation: *const std::ffi::c_void,
            cbJobObjectInformationLength: u32,
        ) -> i32;
        fn AssignProcessToJobObject(
            hJob: *mut std::ffi::c_void,
            hProcess: *mut std::ffi::c_void,
        ) -> i32;
        fn GetCurrentProcess() -> *mut std::ffi::c_void;
    }

    pub struct ProcessLifecycleGuard {
        mutex_handle: *mut std::ffi::c_void,
        _job_handle: *mut std::ffi::c_void,
    }

    impl ProcessLifecycleGuard {
        pub fn init() -> Result<Self, ()> {
            let name: Vec<u16> = OsStr::new("Local\\NovaIsland_App_SingleInstance_Mutex\0")
                .encode_wide()
                .collect();
            let mutex = unsafe { CreateMutexW(std::ptr::null_mut(), 1, name.as_ptr()) };
            if !mutex.is_null() && unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
                unsafe { CloseHandle(mutex) };
                return Err(());
            }

            // Assign process to Job Object configured to kill children (WebView2) when parent closes
            let job = unsafe { CreateJobObjectW(std::ptr::null_mut(), std::ptr::null()) };
            if !job.is_null() {
                unsafe {
                    let mut info = std::mem::zeroed::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>();
                    info.basic_limit_information.limit_flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                    let ok = SetInformationJobObject(
                        job,
                        JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS,
                        &info as *const _ as *const _,
                        std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                    );
                    if ok != 0 {
                        AssignProcessToJobObject(job, GetCurrentProcess());
                    }
                }
            }

            Ok(Self {
                mutex_handle: mutex,
                _job_handle: job,
            })
        }
    }

    impl Drop for ProcessLifecycleGuard {
        fn drop(&mut self) {
            if !self.mutex_handle.is_null() {
                unsafe { CloseHandle(self.mutex_handle) };
            }
            if !self._job_handle.is_null() {
                unsafe { CloseHandle(self._job_handle) };
            }
        }
    }
}

fn main() {
    #[cfg(target_os = "windows")]
    let _guard = match windows_process::ProcessLifecycleGuard::init() {
        Ok(guard) => guard,
        Err(_) => {
            eprintln!("[NovaIsland] Another instance of Nova Island is already running.");
            eprintln!("[NovaIsland] Exiting this launch to avoid WebView2 profile lock conflict (0x800700AA).");
            std::process::exit(0);
        }
    };

    nova_island_lib::run();
}
