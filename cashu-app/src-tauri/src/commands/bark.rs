use tauri::{State, AppHandle, Manager};
use crate::commands::auth::AppState;
use ecash_wallet::{encrypt_wallet, decrypt_wallet, EncryptedWallet};
use tokio::sync::Mutex;
use serde::Serialize;
use anyhow::Result;
use bark::{Wallet, Config};
use bip39::Mnemonic;
use std::path::PathBuf;
use std::fs;
use std::str::FromStr;
use bitcoin::Network;
use lightning_invoice::Bolt11Invoice;
use std::sync::Arc;

// Holds Bark wallet instance wrapped in Arc to avoid stack cloning
pub struct BarkState {
    pub wallet: Arc<Mutex<Option<Arc<Wallet>>>>,
}

impl BarkState {
    pub fn new() -> Self {
        Self {
            wallet: Arc::new(Mutex::new(None)),
        }
    }
}

#[derive(Serialize)]
pub struct BarkBoardingResponse {
    address: String,
}

#[tauri::command]
pub async fn init_bark_wallet(app: AppHandle, state: State<'_, BarkState>, app_state: State<'_, AppState>) -> Result<(), String> {
    let wallet_arc = state.wallet.clone();
    let data_dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("./data")).join("bark");
    
    let passphrase = {
        let pass_lock = app_state.passphrase.lock().unwrap();
        pass_lock.clone().unwrap_or_else(|| "default".to_string())
    };

    // Offload heavy initialization to worker thread with large stack
    tokio::task::spawn(async move {
        let mut wallet_lock = wallet_arc.lock().await;
        if wallet_lock.is_some() {
            return Ok(());
        }
        
        let network = Network::Bitcoin;
        
        if !data_dir.exists() {
            fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
        }

        let old_mnemonic_path = data_dir.join("mnemonic.txt");
        let mnemonic_path = data_dir.join("mnemonic.bin");

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

        let mut config = Config::network_default(network);
        config.esplora_address = Some("https://mempool.second.tech/api".to_string());
        config.server_address = "https://ark.second.tech".to_string();
        
        let seed = bark::WalletSeed::new_from_mnemonic(network, &mnemonic);
        let args = bark::OpenWalletArgs {
            datadir: Some(data_dir.clone()),
            lock_manager: Some(Box::new(bark::lock_manager::memory::MemoryLockManager::new())),
            run_daemon: false,
            ..Default::default()
        };
        
        let wallet = Wallet::open(network, seed, config, args)
            .await
            .map_err(|e| {
                println!("BARK INIT ERROR: {:?}", e);
                e.to_string()
            })?;
            
        *wallet_lock = Some(Arc::new(wallet));

        Ok::<(), String>(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn bark_get_boarding_address(state: State<'_, BarkState>) -> Result<BarkBoardingResponse, String> {
    let wallet = {
        let lock = state.wallet.lock().await;
        lock.as_ref().cloned().ok_or_else(|| "Bark wallet not initialized".to_string())?
    };
    
    tokio::task::spawn(async move {
        let (user_keypair, _) = wallet.derive_store_next_keypair().await.map_err(|e| e.to_string())?;
        let (address, _) = wallet.board_funding_address(&user_keypair).await.map_err(|e| e.to_string())?;
        
        Ok(BarkBoardingResponse {
            address: address.to_string(),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn bark_sync_vutxos(state: State<'_, BarkState>) -> Result<(), String> {
    let wallet = {
        let lock = state.wallet.lock().await;
        lock.as_ref().cloned().ok_or_else(|| "Bark wallet not initialized".to_string())?
    };
    
    tokio::task::spawn(async move {
        wallet.sync().await;
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn bark_get_balance(state: State<'_, BarkState>) -> Result<u64, String> {
    let wallet = {
        let lock = state.wallet.lock().await;
        lock.as_ref().cloned().ok_or_else(|| "Bark wallet not initialized".to_string())?
    };
    
    tokio::task::spawn(async move {
        let balance = wallet.balance().await.map_err(|e| e.to_string())?;
        Ok(balance.spendable.to_sat())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn bark_pay_lightning_invoice(invoice: String, state: State<'_, BarkState>) -> Result<String, String> {
    let wallet = {
        let lock = state.wallet.lock().await;
        lock.as_ref().cloned().ok_or_else(|| "Bark wallet not initialized".to_string())?
    };
    
    tokio::task::spawn(async move {
        let bolt11 = Bolt11Invoice::from_str(&invoice).map_err(|e| e.to_string())?;
        let res = wallet.pay_lightning_invoice(bolt11, None, false).await.map_err(|e| e.to_string())?;
        Ok(format!("{:?}", res))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn bark_send_onchain(address: String, amount_sats: u64, state: State<'_, BarkState>) -> Result<String, String> {
    let wallet = {
        let lock = state.wallet.lock().await;
        lock.as_ref().cloned().ok_or_else(|| "Bark wallet not initialized".to_string())?
    };
    
    tokio::task::spawn(async move {
        let addr = bitcoin::Address::from_str(&address)
            .map_err(|e| e.to_string())?
            .require_network(Network::Bitcoin)
            .map_err(|e| e.to_string())?;
        
        let amount = bitcoin::Amount::from_sat(amount_sats);
        let txid = wallet.send_onchain(addr, amount).await.map_err(|e| e.to_string())?;
        
        Ok(txid.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn bark_get_mnemonic(app: AppHandle, app_state: State<'_, AppState>) -> Result<String, String> {
    let data_dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("./data")).join("bark");
    let mnemonic_path = data_dir.join("mnemonic.bin");
    
    let passphrase = {
        let pass_lock = app_state.passphrase.lock().unwrap();
        pass_lock.clone().unwrap_or_else(|| "default".to_string())
    };

    tokio::task::spawn_blocking(move || {
        if mnemonic_path.exists() {
            let data = fs::read_to_string(&mnemonic_path).map_err(|e| e.to_string())?;
            let enc: EncryptedWallet = serde_json::from_str(&data).map_err(|e| e.to_string())?;
            let plaintext = decrypt_wallet(&enc, &passphrase).map_err(|e| e.to_string())?;
            let words = String::from_utf8(plaintext).map_err(|e| e.to_string())?;
            Ok(words)
        } else {
            Err("Mnemonic not found".to_string())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(serde::Serialize)]
pub struct OnchainSendEstimate {
    pub amount: u64,
    pub ark_fee: u64,
    pub cashu_fee: u64,
    pub total_cost: u64,
    pub bridging_invoice: String,
}

#[tauri::command]
pub async fn bark_estimate_onchain_send(
    address: String,
    amount_sats: u64, 
    mint_url: String, 
    state: State<'_, BarkState>
) -> Result<OnchainSendEstimate, String> {
    let wallet = {
        let lock = state.wallet.lock().await;
        lock.as_ref().cloned().ok_or_else(|| "Bark wallet not initialized".to_string())?
    };

    tokio::task::spawn(async move {
        let addr = bitcoin::Address::from_str(&address)
            .map_err(|e| e.to_string())?
            .require_network(bitcoin::Network::Bitcoin)
            .map_err(|e| e.to_string())?;
            
        let amount = bitcoin::Amount::from_sat(amount_sats);
        let ark_estimate = wallet.estimate_send_onchain(&addr, amount).await.map_err(|e| e.to_string())?;
        let total_vtxos_needed = ark_estimate.gross_amount.to_sat();
        
        let ark_fee = if total_vtxos_needed > amount_sats { total_vtxos_needed - amount_sats } else { 0 };
        
        let invoice = wallet.bolt11_invoice(bitcoin::Amount::from_sat(total_vtxos_needed), None, None).await.map_err(|e| e.to_string())?;
        let bridging_invoice = invoice.to_string();
        
        let client = ecash_wallet::client::MintClient::new(&mint_url);
        let (_quote_id, fee_reserve, _total_melt) = client.request_melt_quote(&bridging_invoice).await.map_err(|e| e.to_string())?;
        
        let total_cost = total_vtxos_needed + fee_reserve;
        
        Ok(OnchainSendEstimate {
            amount: amount_sats,
            ark_fee,
            cashu_fee: fee_reserve,
            total_cost,
            bridging_invoice,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn bark_execute_onchain_send(
    bridging_invoice: String,
    address: String,
    amount_sats: u64,
    mint_url: String,
    app_state: State<'_, AppState>,
    bark_state: State<'_, BarkState>,
) -> Result<String, String> {
    let path = app_state.wallet_path.clone();
    let passphrase = {
        let pass_lock = app_state.passphrase.lock().unwrap();
        pass_lock.clone().ok_or_else(|| "Wallet is locked".to_string())?
    };
    let wallet = {
        let lock = bark_state.wallet.lock().await;
        lock.as_ref().cloned().ok_or_else(|| "Bark wallet not initialized".to_string())?
    };

    tokio::task::spawn(async move {
        // 1. Pay the bridging invoice with Cashu
        let mut w_state = ecash_wallet::WalletState::load_encrypted(&path, &passphrase)
            .map_err(|e| format!("Failed to load Cashu wallet: {}", e))?;

        let (_sats_paid, _preimage) = ecash_wallet::pay_invoice(&mut w_state, &path, &passphrase, &bridging_invoice, Some(mint_url))
            .await
            .map_err(|e| format!("Failed to pay bridging invoice from Cashu: {}", e))?;

        // Wait a brief moment for the ASP to settle the lightning payment and issue vTXOs
        tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;

        // 2. Refresh Bark to ensure vTXOs are recognized
        wallet.sync().await;

        // 3. Send Onchain from Bark
        let addr = bitcoin::Address::from_str(&address)
            .map_err(|e| e.to_string())?
            .require_network(bitcoin::Network::Bitcoin)
            .map_err(|e| e.to_string())?;
        
        let amount = bitcoin::Amount::from_sat(amount_sats);
        let txid = wallet.send_onchain(addr, amount).await.map_err(|e| format!("On-chain send failed: {}", e))?;
        
        Ok(txid.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
