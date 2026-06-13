use ecash_wallet::WalletState;

fn main() {
    let path = WalletState::default_path();
    match WalletState::load_encrypted(&path, "prototype-biometric-secure-enclave") {
        Ok(_) => println!("Successfully loaded wallet"),
        Err(e) => println!("Error loading wallet: {:?}", e),
    }
}
