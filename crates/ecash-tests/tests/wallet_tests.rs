use ecash_wallet::WalletState;

#[tokio::test]
async fn test_wallet_persistence() {
    let tmp_dir = std::env::temp_dir();
    let wallet_path = tmp_dir.join(format!("test_wallet_{}.json", uuid::Uuid::new_v4()));
    let passphrase = "my-secure-password";

    // Create a new wallet
    let mut state = WalletState::new("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff".to_string(), None);
    state.trusted_keys.insert("https://mint.test".to_string(), std::collections::HashMap::new());
    
    // Save it
    state.save_encrypted(&wallet_path, passphrase).expect("Failed to save wallet");

    // Load it
    let loaded_state = WalletState::load_encrypted(&wallet_path, passphrase).expect("Failed to load wallet");

    assert!(loaded_state.trusted_keys.contains_key("https://mint.test"));

    // Attempt to load with wrong passphrase
    let wrong_result = WalletState::load_encrypted(&wallet_path, "wrong-password");
    assert!(wrong_result.is_err(), "Should not load with wrong password");

    // Cleanup
    let _ = std::fs::remove_file(wallet_path);
}
