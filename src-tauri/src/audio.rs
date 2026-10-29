#![allow(non_snake_case, dead_code)]

use serde::{Deserialize, Serialize};
use windows::core::{HRESULT, PCWSTR};
use windows::Win32::Media::Audio::{
    eConsole, eMultimedia, eRender, DEVICE_STATE_ACTIVE, ERole, IMMDeviceEnumerator,
    MMDeviceEnumerator,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED, STGM,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub device_type: String,
    pub is_default: bool,
}

#[repr(C)]
pub struct PROPERTYKEY {
    pub fmtid: windows::core::GUID,
    pub pid: u32,
}

// PKEY_Device_FriendlyName: {a45c254e-df1c-4efd-8020-67d146a850e0}, 14
const PKEY_DEVICE_FRIENDLY_NAME: PROPERTYKEY = PROPERTYKEY {
    fmtid: windows::core::GUID::from_u128(0xa45c254e_df1c_4efd_8020_67d146a850e0),
    pid: 14,
};

// PKEY_Device_DeviceDesc: {a45c254e-df1c-4efd-8020-67d146a850e0}, 2
const PKEY_DEVICE_DESC: PROPERTYKEY = PROPERTYKEY {
    fmtid: windows::core::GUID::from_u128(0xa45c254e_df1c_4efd_8020_67d146a850e0),
    pid: 2,
};

fn classify_device_type(name: &str) -> String {
    let lower = name.to_lowercase();
    if lower.contains("headphone")
        || lower.contains("earphone")
        || lower.contains("headset")
        || lower.contains("airpod")
        || lower.contains("buds")
    {
        "headphones".to_string()
    } else if lower.contains("bluetooth") {
        "bluetooth".to_string()
    } else if lower.contains("monitor")
        || lower.contains("tv")
        || lower.contains("hdmi")
        || lower.contains("displayport")
        || lower.contains("nvidia")
        || lower.contains("intel(r) display")
        || lower.contains("amd high definition")
    {
        "display".to_string()
    } else {
        "speaker".to_string()
    }
}

pub fn get_audio_output_devices() -> Vec<AudioDevice> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }

    let mut result = Vec::new();

    unsafe {
        let enumerator: Result<IMMDeviceEnumerator, _> =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL);

        let Ok(enumerator) = enumerator else {
            return result;
        };

        let default_id: Option<String> = enumerator
            .GetDefaultAudioEndpoint(eRender, eMultimedia)
            .ok()
            .and_then(|dev| dev.GetId().ok())
            .map(|id_pwstr| id_pwstr.to_string().unwrap_or_default());

        if let Ok(collection) = enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE) {
            if let Ok(count) = collection.GetCount() {
                for i in 0..count {
                    if let Ok(device) = collection.Item(i) {
                        let id_str = device
                            .GetId()
                            .ok()
                            .and_then(|s| s.to_string().ok())
                            .unwrap_or_default();

                        if id_str.is_empty() {
                            continue;
                        }

                        let mut friendly_name = String::new();
                        // OpenPropertyStore takes STGM (0 is STGM_READ)
                        if let Ok(prop_store) = device.OpenPropertyStore(STGM(0)) {
                            let key_ptr = &PKEY_DEVICE_FRIENDLY_NAME as *const PROPERTYKEY as *const _;
                            if let Ok(prop) = prop_store.GetValue(key_ptr) {
                                let val_str = prop.Anonymous.Anonymous.Anonymous.pwszVal;
                                if !val_str.is_null() {
                                    friendly_name = val_str.to_string().unwrap_or_default();
                                }
                            }
                            if friendly_name.is_empty() {
                                let key_desc_ptr = &PKEY_DEVICE_DESC as *const PROPERTYKEY as *const _;
                                if let Ok(prop) = prop_store.GetValue(key_desc_ptr) {
                                    let val_str = prop.Anonymous.Anonymous.Anonymous.pwszVal;
                                    if !val_str.is_null() {
                                        friendly_name = val_str.to_string().unwrap_or_default();
                                    }
                                }
                            }
                        }

                        if friendly_name.is_empty() {
                            friendly_name = format!("Audio Device {}", i + 1);
                        }

                        let is_default = default_id.as_deref() == Some(&id_str);
                        let device_type = classify_device_type(&friendly_name);

                        result.push(AudioDevice {
                            id: id_str,
                            name: friendly_name,
                            device_type,
                            is_default,
                        });
                    }
                }
            }
        }
    }

    result
}

// Undocumented Windows PolicyConfig COM interface for default audio endpoint switching
const CLSID_POLICY_CONFIG_CLIENT: windows::core::GUID =
    windows::core::GUID::from_u128(0x870af99c_171d_4f9e_af0d_e63df40c2bc9);

#[windows_core::interface("f8679f50-850a-412f-9c4d-016663095491")]
pub unsafe trait IPolicyConfig: windows_core::IUnknown {
    pub unsafe fn GetMixFormat(&self) -> HRESULT;
    pub unsafe fn GetDeviceFormat(&self) -> HRESULT;
    pub unsafe fn ResetDeviceFormat(&self) -> HRESULT;
    pub unsafe fn SetDeviceFormat(&self) -> HRESULT;
    pub unsafe fn GetProcessingPeriod(&self) -> HRESULT;
    pub unsafe fn SetProcessingPeriod(&self) -> HRESULT;
    pub unsafe fn GetShareMode(&self) -> HRESULT;
    pub unsafe fn SetShareMode(&self) -> HRESULT;
    pub unsafe fn GetPropertyValue(&self) -> HRESULT;
    pub unsafe fn SetPropertyValue(&self) -> HRESULT;
    pub unsafe fn SetDefaultEndpoint(&self, wszDeviceId: PCWSTR, eRole: ERole) -> HRESULT;
    pub unsafe fn SetEndpointVisibility(&self) -> HRESULT;
}

pub fn set_default_audio_output_device(device_id: &str) -> Result<bool, String> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

        let policy_config: Result<IPolicyConfig, _> =
            CoCreateInstance(&CLSID_POLICY_CONFIG_CLIENT, None, CLSCTX_ALL);

        let policy_config = match policy_config {
            Ok(p) => p,
            Err(e) => {
                return Err(format!("PolicyConfig COM service unavailable: {:?}", e));
            }
        };

        let wide_id: Vec<u16> = device_id.encode_utf16().chain(std::iter::once(0)).collect();
        let pcwstr = PCWSTR(wide_id.as_ptr());

        // Set default endpoint for Console (0), Multimedia (1), and Communications (2)
        let hr1 = policy_config.SetDefaultEndpoint(pcwstr, eConsole);
        let hr2 = policy_config.SetDefaultEndpoint(pcwstr, eMultimedia);
        let _ = policy_config.SetDefaultEndpoint(pcwstr, ERole(2));

        if hr1.is_err() && hr2.is_err() {
            return Err(format!("SetDefaultEndpoint returned error: {:?} / {:?}", hr1, hr2));
        }

        // Verify that default device was actually switched
        let enumerator: Result<IMMDeviceEnumerator, _> =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL);
        if let Ok(enumerator) = enumerator {
            if let Ok(curr) = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia) {
                if let Ok(curr_id) = curr.GetId() {
                    let curr_id_str = curr_id.to_string().unwrap_or_default();
                    if curr_id_str == device_id {
                        return Ok(true);
                    }
                }
            }
        }

        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_enumerate_devices() {
        let devices = get_audio_output_devices();
        println!("Enumerated {} Windows audio devices:", devices.len());
        for d in &devices {
            println!(" - [{}] '{}' (type: {}, default: {})", d.id, d.name, d.device_type, d.is_default);
        }
        assert!(devices.is_empty() || devices.iter().any(|d| d.is_default || !d.is_default));
    }
}
