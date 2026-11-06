use std::path::PathBuf;

fn load_dotenv_to_cargo_env() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
    let base = PathBuf::from(&manifest_dir);
    let candidates = [
        base.join("../.env"),
        base.join(".env"),
        base.join("../../.env"),
    ];

    for path in candidates {
        println!("cargo:rerun-if-changed={}", path.display());
        if let Ok(contents) = std::fs::read_to_string(&path) {
            for line in contents.lines() {
                let line = line.trim();
                if line.is_empty() || line.starts_with('#') {
                    continue;
                }
                if let Some((k, v)) = line.split_once('=') {
                    let k = k.trim();
                    let v = v.trim().trim_matches('"').trim_matches('\'');
                    if matches!(
                        k,
                        "BREEZ_API_KEY"
                            | "VITE_BREEZ_API_KEY"
                            | "BREEZE_API_KEY"
                            | "VITE_BREEZE_API_KEY"
                            | "BREEZE_KEY"
                            | "VITE_BREEZE_KEY"
                    ) && !v.is_empty()
                    {
                        println!("cargo:rustc-env={}={}", k, v);
                    }
                }
            }
        }
    }
}

fn main() {
    load_dotenv_to_cargo_env();
    tauri_build::build()
}
