use tauri::{State, AppHandle, Manager};
use crate::commands::auth::AppState;
use ecash_wallet::{encrypt_wallet, decrypt_wallet, EncryptedWallet};
use tokio::sync::Mutex;
use serde::{Deserialize, Serialize};
use anyhow::Result;
use bark::{Wallet, WalletSeed, OpenWalletArgs, Config};
use bip39::Mnemonic;
use std::path::PathBuf;
use std::fs;
use std::str::FromStr;
use bitcoin::Network;
use lightning_invoice::Bolt11Invoice;

// This will eventually hold our Bark wallet instance
pub struct BarkState {
    pub wallet: Mutex<Option<Wallet>>,
}

impl BarkState {
    pub fn new() -> Self {
        Self {
            wallet: Mutex::new(None),
        }
    }
}

#[derive(Serialize)]
pub struct BarkBoardingResponse {
    address: String,
}

#[tauri::command]
pub async fn init_bark_wallet(app: AppHandle, state: State<'_, BarkState>, app_state: State<'_, AppState>) -> Result<(), String> {
    let mut wallet_lock = state.wallet.lock().await;
    if wallet_lock.is_some() {
        return Ok(());
    }
    
    let network = Network::Bitcoin;
    let data_dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("./data")).join("bark");
    
    if !data_dir.exists() {
        fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    }

    let old_mnemonic_path = data_dir.join("mnemonic.txt");
    let mnemonic_path = data_dir.join("mnemonic.bin");

    let passphrase = {
        let pass_lock = app_state.passphrase.lock().unwrap();
        pass_lock.clone().unwrap_or_else(|| "default".to_string())
    };

    let mnemonic = if mnemonic_path.exists() {
        let data = fs::read_to_string(&mnemonic_path).map_err(|e| e.to_string())?;
        let enc: EncryptedWallet = serde_json::from_str(&data).map_err(|e| e.to_string())?;
        let plaintext = decrypt_wallet(&enc, &passphrase).map_err(|e| e.to_string())?;
        let words = String::from_utf8(plaintext).map_err(|e| e.to_string())?;
        Mnemonic::from_str(&words).map_err(|e| e.to_string())?
    } else if old_mnemonic_path.exists() {
        let words = fs::read_to_string(&old_mnemonic_path).map_err(|e| e.to_string())?;
        let enc = encrypt_wallet(words.as_bytes(), &passphrase).map_err(|e| e.to_string())?;
        fs::write(&mnemonic_path, serde_json::to_string(&enc).unwrap()).map_err(|e| e.to_string())?;
        fs::remove_file(&old_mnemonic_path).ok();
        Mnemonic::from_str(&words).map_err(|e| e.to_string())?
    } else {
        let mut rng = rand::thread_rng();
        let m = Mnemonic::generate_in_with(&mut rng, bip39::Language::English, 12).map_err(|e| e.to_string())?;
        let enc = encrypt_wallet(m.to_string().as_bytes(), &passphrase).map_err(|e| e.to_string())?;
        fs::write(&mnemonic_path, serde_json::to_string(&enc).unwrap()).map_err(|e| e.to_string())?;
        m
    };

    let seed = WalletSeed::new_from_mnemonic(network, &mnemonic);
    let mut config = Config::network_default(network);
    config.esplora_address = Some("https://mempool.second.tech/api".to_string());
    config.server_address = "https://ark.second.tech".to_string();
    
    let args = OpenWalletArgs {
        datadir: Some(data_dir),
        create_without_server: false,
        ..Default::default()
    };
    
    let wallet = Wallet::open(network, seed, config, args)
        .await
        .map_err(|e| {
            println!("BARK INIT ERROR: {:?}", e);
            e.to_string()
        })?;
        
    *wallet_lock = Some(wallet);

    Ok(())
}

#[tauri::command]
pub async fn bark_get_boarding_address(state: State<'_, BarkState>) -> Result<BarkBoardingResponse, String> {
    let wallet_opt = state.wallet.lock().await.clone();
    let wallet = wallet_opt.ok_or_else(|| "Bark wallet not initialized".to_string())?;
    
    let (user_keypair, _) = wallet.derive_store_next_keypair().await.map_err(|e| e.to_string())?;
    
    let (address, _) = wallet.board_funding_address(&user_keypair).await.map_err(|e| e.to_string())?;
    
    Ok(BarkBoardingResponse {
        address: address.to_string(),
    })
}

#[tauri::command]
pub async fn bark_sync_vutxos(state: State<'_, BarkState>) -> Result<(), String> {
    let wallet_opt = state.wallet.lock().await.clone();
    let wallet = wallet_opt.ok_or_else(|| "Bark wallet not initialized".to_string())?;
    
    wallet.sync().await;
    Ok(())
}

#[tauri::command]
pub async fn bark_get_balance(state: State<'_, BarkState>) -> Result<u64, String> {
    let wallet_opt = state.wallet.lock().await.clone();
    let wallet = wallet_opt.ok_or_else(|| "Bark wallet not initialized".to_string())?;
    
    let balance = wallet.balance().await.map_err(|e| e.to_string())?;
    Ok(balance.spendable.to_sat())
}

#[tauri::command]
pub async fn bark_pay_lightning_invoice(invoice: String, state: State<'_, BarkState>) -> Result<String, String> {
    let wallet_opt = state.wallet.lock().await.clone();
    let wallet = wallet_opt.ok_or_else(|| "Bark wallet not initialized".to_string())?;
    
    let bolt11 = Bolt11Invoice::from_str(&invoice).map_err(|e| e.to_string())?;
    
    // We pass None for amount (using invoice amount) and false for the bool flag
    let res = wallet.pay_lightning_invoice(bolt11, None, false).await.map_err(|e| e.to_string())?;
    Ok(format!("{:?}", res))
}

#[tauri::command]
pub async fn bark_send_onchain(address: String, amount_sats: u64, state: State<'_, BarkState>) -> Result<String, String> {
    let wallet_opt = state.wallet.lock().await.clone();
    let wallet = wallet_opt.ok_or_else(|| "Bark wallet not initialized".to_string())?;
    
    let addr = bitcoin::Address::from_str(&address)
        .map_err(|e| e.to_string())?
        .require_network(Network::Bitcoin)
        .map_err(|e| e.to_string())?;
    
    let amount = bitcoin::Amount::from_sat(amount_sats);
    let txid = wallet.send_onchain(addr, amount).await.map_err(|e| e.to_string())?;
    
    Ok(txid.to_string())
}

#[tauri::command]
pub async fn bark_get_mnemonic(app: AppHandle, app_state: State<'_, AppState>) -> Result<String, String> {
    let data_dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("./data")).join("bark");
    let mnemonic_path = data_dir.join("mnemonic.bin");
    
    let passphrase = {
        let pass_lock = app_state.passphrase.lock().unwrap();
        pass_lock.clone().unwrap_or_else(|| "default".to_string())
    };

    if mnemonic_path.exists() {
        let data = fs::read_to_string(&mnemonic_path).map_err(|e| e.to_string())?;
        let enc: EncryptedWallet = serde_json::from_str(&data).map_err(|e| e.to_string())?;
        let plaintext = decrypt_wallet(&enc, &passphrase).map_err(|e| e.to_string())?;
        let words = String::from_utf8(plaintext).map_err(|e| e.to_string())?;
        Ok(words)
    } else {
        Err("Mnemonic not found".to_string())
    }
}
