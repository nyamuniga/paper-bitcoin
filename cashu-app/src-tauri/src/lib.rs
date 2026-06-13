mod commands;
mod error;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .manage(commands::auth::AppState {
            passphrase: std::sync::Mutex::new(None),
        })
        .plugin(tauri_plugin_stronghold::Builder::new(|_pass| todo!()).build())
        .plugin(tauri_plugin_opener::init());
        
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        builder = builder.plugin(tauri_plugin_biometric::init());
    }

    builder.invoke_handler(tauri::generate_handler![
            commands::wallet::wallet_info,
            commands::wallet::get_balance,
            commands::wallet::get_recovery_words,
            commands::issue::issue_note,
            commands::issue::save_file_to_disk,
            commands::verify::decode_bin,
            commands::verify::verify_note,
            commands::redeem::redeem_note,
            commands::pay::pay_invoice,
            commands::auth::is_wallet_setup,
            commands::auth::unlock_wallet,
            commands::auth::lock_wallet,
            commands::auth::is_wallet_unlocked,
            commands::auth::reset_wallet,
            commands::auth::create_wallet,
            commands::auth::restore_wallet,
            commands::history::get_transactions,
            commands::history::retry_mint,
            commands::history::check_melt_status,
            commands::history::get_note_svg,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
pub mod utils;
