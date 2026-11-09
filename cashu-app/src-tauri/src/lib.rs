pub mod nwc;
mod commands;
mod error;

static RUNTIME: std::sync::OnceLock<tokio::runtime::Runtime> = std::sync::OnceLock::new();

fn init_runtime() {
    let rt = RUNTIME.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .thread_stack_size(4 * 1024 * 1024) // 4 MB stack per worker thread
            .enable_all()
            .build()
            .expect("Failed to initialize Tokio runtime")
    });
    tauri::async_runtime::set(rt.handle().clone());
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_runtime();

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            use tauri::Manager;
            use tauri_plugin_store::StoreExt;
            let wallet_path = app.path().app_data_dir().unwrap().join("gui-wallet.json");
            let initial_nwc_enabled = app
                .store("settings.bin")
                .ok()
                .and_then(|s| s.get("nwc_enabled"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            app.manage(commands::auth::AppState {
                passphrase: std::sync::Mutex::new(None),
                wallet_path,
                wallet: tokio::sync::Mutex::new(None),
                pending_nwc_requests: std::sync::Mutex::new(Vec::new()),
                nwc_enabled: std::sync::atomic::AtomicBool::new(initial_nwc_enabled),
            });
            
            app.manage(commands::spark::SparkState::new());
            
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = crate::nwc::spawn_nwc_listener(app_handle).await {
                    eprintln!("NWC listener error: {}", e);
                }
            });
            
            Ok(())
        })
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init());

    #[cfg(any(target_os = "android", target_os = "ios"))]
    let builder = builder.plugin(tauri_plugin_biometric::init());

    builder
        .invoke_handler(tauri::generate_handler![
            commands::wallet::wallet_info,
            commands::wallet::get_seed_hex,
            commands::wallet::get_custom_nostr_key,
            commands::wallet::set_custom_nostr_key,
            commands::wallet::set_default_nostr_key,
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
            commands::ecash_invoice::ecash_invoices,
            commands::ecash_invoice::ecash_save_invoice,
            commands::ecash_invoice::ecash_invoice,
            commands::ecash_invoice::ecash_invoice_payment,
            commands::ecash_invoice::ecash_invoice_relays,
            commands::payment_request::ecash_payment_quote,
            commands::payment_request::ecash_resume_payment,
            commands::payment_request::ecash_validate_payment,
            commands::send::send_ecash,
            commands::send::receive_ecash,
            commands::receive::receive_lightning,
            commands::receive::batch_mint_external_quotes,
            commands::auth::is_wallet_setup,
            commands::auth::auto_login,
            commands::auth::unlock_wallet,
            commands::auth::lock_wallet,
            commands::auth::is_wallet_unlocked,
            commands::auth::verify_passphrase,
            commands::auth::reset_wallet,
            commands::auth::create_wallet,
            commands::auth::restore_wallet,
            commands::history::get_transactions,
            commands::history::retry_mint,
            commands::history::check_transaction_status,
            commands::history::check_token_spend_status,
            commands::history::get_note_svg,
            commands::history::check_issue_status,
            crate::nwc::get_nwc_uri,
            crate::nwc::enable_nwc,
            crate::nwc::disable_nwc,
            crate::nwc::reset_nwc_keys,
            crate::nwc::get_nwc_config,
            crate::nwc::set_nwc_config,
            crate::nwc::set_app_default_mint,
            crate::nwc::get_pending_nwc_requests,
            crate::nwc::approve_nwc_request,
            crate::nwc::reject_nwc_request,
            commands::stable::stable_operations,
            commands::stable::stable_mint_quote_preview,
            commands::stable::stable_recover_legacy_conversion,
            commands::stable::stable_prepare_return,
            commands::stable::stable_funding_quote,
            commands::stable::stable_begin,
            commands::stable::stable_refresh_quote,
            commands::stable::stable_fund,
            commands::stable::stable_advance,
            commands::spark::spark_get_config,
            commands::spark::spark_set_credentials,
            commands::spark::spark_get_limits,
            commands::spark::spark_is_sending,
            commands::spark::spark_validate_address,
            commands::spark::spark_quote_cashu_melt,
            commands::spark::spark_melt_to_spark,
            commands::spark::spark_topup_for_send,
            commands::spark::spark_finalize_onchain_send,
            commands::spark::spark_prepare_onchain_receive,
            commands::spark::spark_prepare_mint_from_spark,
            commands::spark::spark_complete_mint_from_spark,
            commands::spark::spark_abort_unpaid_mint_from_spark,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
pub mod utils;
