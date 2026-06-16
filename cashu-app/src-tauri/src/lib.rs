mod commands;
mod error;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .setup(|app| {
            use tauri::Manager;
            let wallet_path = app.path().app_data_dir().unwrap().join("gui-wallet.json");
            app.manage(commands::auth::AppState {
                passphrase: std::sync::Mutex::new(None),
                wallet_path,
            });
            Ok(())
        })
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init());
        
    #[cfg(any(target_os = "android", target_os = "ios"))]
    let builder = builder.plugin(tauri_plugin_biometric::init());

    builder.invoke_handler(tauri::generate_handler![
            commands::wallet::wallet_info,
            commands::wallet::get_balance,
            commands::wallet::get_recovery_words,
            commands::issue::issue_note,
            commands::issue::get_pdf_from_bin,
            commands::history::get_note_pdf,
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
