mod commands;
mod error;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            use tauri::Manager;
            let wallet_path = app.path().app_data_dir().unwrap().join("gui-wallet.json");
            app.manage(commands::auth::AppState {
                passphrase: std::sync::Mutex::new(None),
                wallet_path,
                wallet_lock: tokio::sync::Mutex::new(()),
            });
            Ok(())
        })
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init());

    #[cfg(any(target_os = "android", target_os = "ios"))]
    let builder = builder.plugin(tauri_plugin_biometric::init());

    builder
        .invoke_handler(tauri::generate_handler![
            commands::wallet::wallet_info,
            commands::wallet::get_seed_hex,
            commands::wallet::get_custom_nostr_key,
            commands::wallet::set_custom_nostr_key,
            commands::wallet::get_balance,
            commands::wallet::get_recovery_words,
            commands::wallet::add_mint,
            commands::wallet::remove_mint,
            commands::wallet::clean_wallet,
            commands::issue::issue_note,
            commands::issue::issue_note_direct,
            commands::issue::get_pending_issue,
            commands::issue::get_pdf_from_bin,
            commands::history::get_note_pdf,
            commands::verify::decode_bin,
            commands::verify::verify_note,
            commands::redeem::redeem_note,
            commands::redeem::redeem_note_direct,
            commands::pay::pay_invoice,
            commands::send::send_ecash,
            commands::send::receive_ecash,
            commands::receive::receive_lightning,
            commands::receive::batch_mint_external_quotes,
            commands::auth::is_wallet_setup,
            commands::auth::auto_login,
            commands::auth::unlock_wallet,
            commands::auth::lock_wallet,
            commands::auth::is_wallet_unlocked,
            commands::auth::reset_wallet,
            commands::auth::create_wallet,
            commands::auth::restore_wallet,
            commands::history::get_transactions,
            commands::history::retry_mint,
            commands::history::check_transaction_status,
            commands::history::check_token_spend_status,
            commands::history::get_note_svg,
            commands::history::check_issue_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
pub mod utils;
