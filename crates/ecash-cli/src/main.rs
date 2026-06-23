//! Physical Ecash CLI — `ecash <command>`
//!
//! Commands
//! ────────
//!   init          Create a new wallet (BIP39 mnemonic)
//!   recover       Restore wallet from 24-word mnemonic
//!   migrate       Re-save a legacy plaintext wallet as encrypted
//!   info          Show wallet balance and recovery words
//!   issue <sats>  Issue a physical note (SVG + JSON)
//!   verify <file> Verify a note offline
//!   redeem <file> Redeem a note at the mint
//!   pay <invoice> Pay a Lightning invoice from wallet

use std::{collections::HashMap, path::PathBuf, io::Write};

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};

use ecash_encoder::generate_note_svg;
use ecash_verifier::{OfflineVerifier, VerificationResult};
use ecash_wallet::{
    generate_mnemonic, mnemonic_to_seed_hex, validate_invoice,
    issue_multimint_note, pay_invoice, redeem_note, WalletState, DEFAULT_MINT_URL,
};

use inquire::{Select, Text};
use serde::{Deserialize, Serialize};

// ─── UI Helpers ───────────────────────────────────────────────────────────────

mod ui {
    use comfy_table::{Table, presets::UTF8_FULL};
    use colored::Colorize;
    use indicatif::{ProgressBar, ProgressStyle};

    /// Print a double‑line box with a title.
    pub fn print_header(title: &str) {
        let width = 60;
        let line = "═".repeat(width);
        println!("╔{}╗", line);
        println!("║{:^width$}║", title.bold().cyan(), width = width);
        println!("╚{}╝", line);
    }

    /// Print a simple box with lines of content.
    pub fn print_box(lines: &[String], status: Option<(&str, &str)>) {
        let width = lines.iter().map(|s| s.len()).max().unwrap_or(40) + 4;
        let top = format!("┌{}┐", "─".repeat(width - 2));
        let bottom = format!("└{}┘", "─".repeat(width - 2));
        println!("{}", top);
        for line in lines {
            println!("│ {:<width$} │", line, width = width - 4);
        }
        if let Some((_label, value)) = status {
            let line = format!("│ {:<width$} │", format!("STATUS: {}", value), width = width - 4);
            let sep = format!("├{}┤", "─".repeat(width - 2));
            println!("{}", sep);
            println!("{}", line);
        }
        println!("{}", bottom);
    }

    /// Build a standard balance table.
    pub fn balance_table(mints: Vec<(String, u64)>, total: u64) -> Table {
        let mut table = Table::new();
        table.load_preset(UTF8_FULL);
        table.set_header(vec!["Mint URL", "Balance (sats)", "% of total"]);
        for (mint, bal) in mints {
            let pct = if total > 0 { (bal as f64 / total as f64) * 100.0 } else { 0.0 };
            table.add_row(vec![
                mint,
                format!("{:>10}", bal),
                format!("{:>6.1} %", pct),
            ]);
        }
        if total > 0 {
            table.add_row(vec![
                "TOTAL".bold().to_string(),
                format!("{:>10}", total).bold().to_string(),
                "100.0 %".bold().to_string(),
            ]);
        }
        table
    }

    /// Build a transaction history table.
    pub fn history_table(txs: Vec<ecash_core::types::Transaction>) -> Table {
        let mut table = Table::new();
        table.load_preset(UTF8_FULL);
        table.set_header(vec!["ID", "Type", "Status", "Amount", "Fee", "Mint", "Date"]);
        for tx in txs {
            let type_str = match tx.tx_type {
                ecash_core::types::TransactionType::Mint(_) => "Mint",
                ecash_core::types::TransactionType::Melt(_) => "Melt",
                ecash_core::types::TransactionType::Issue(_) => "Issue",
                ecash_core::types::TransactionType::Redeem(_) => "Redeem",
            };
            let status_str = match tx.status {
                ecash_core::types::TransactionStatus::Pending => "Pending".yellow().to_string(),
                ecash_core::types::TransactionStatus::Success => "Success".green().to_string(),
                ecash_core::types::TransactionStatus::Failed => "Failed".red().to_string(),
                ecash_core::types::TransactionStatus::FailedMintError => "MintError".red().to_string(),
            };
            table.add_row(vec![
                tx.id[..8].to_string(),
                type_str.to_string(),
                status_str,
                format!("{:>10}", tx.amount),
                format!("{:>6}", tx.fee),
                tx.mint_url,
                tx.timestamp.to_string(),
            ]);
        }
        table
    }

    /// Print a progress message with a spinner.
    pub fn progress_spinner(msg: &str) -> ProgressBar {
        let pb = ProgressBar::new_spinner();
        pb.set_style(ProgressStyle::default_spinner()
            .template("{spinner} {msg}")
            .unwrap()
            .tick_chars("⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"));
        pb.set_message(msg.to_string());
        pb.enable_steady_tick(std::time::Duration::from_millis(100));
        pb
    }
}

// ─── Trusted Mints Cache ──────────────────────────────────────────────────────

#[derive(Default, Serialize, Deserialize)]
struct TrustedMints {
    pub keys: HashMap<String, HashMap<u64, String>>,
}

impl TrustedMints {
    fn file_path() -> PathBuf {
        dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")).join(".ecash").join("trusted_mints.json")
    }

    fn load() -> Self {
        let path = Self::file_path();
        if let Ok(data) = std::fs::read_to_string(&path) {
            serde_json::from_str(&data).unwrap_or_default()
        } else {
            Self::default()
        }
    }

    fn save(&self) -> Result<()> {
        let path = Self::file_path();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&path, serde_json::to_string_pretty(self)?)?;
        Ok(())
    }
}

// ─── CLI definition ───────────────────────────────────────────────────────────

#[derive(Parser)]
#[command(
    name = "ecash",
    version = "0.2.0",
    about = "Physical Ecash — Chaumian blind-signature bearer notes on paper",
    long_about = "\
Physical Ecash implements the Cashu protocol to create tamper-evident paper \
notes that represent Bitcoin value. Notes can be verified offline and redeemed \
via the Lightning Network.\n\
\n\
Set ECASH_MINT_URL to point at a real Cashu mint for production use."
)]
struct Cli {
    /// Wallet file path  [default: ~/.ecash/wallet.json]
    #[arg(long, env = "ECASH_WALLET_PATH")]
    wallet: Option<PathBuf>,

    /// Mint URL
    #[arg(long, env = "ECASH_MINT_URL", default_value = DEFAULT_MINT_URL)]
    mint: String,

    #[command(subcommand)]
    cmd: Option<Cmd>,
}

#[derive(Subcommand)]
enum Cmd {
    Init { force: bool },
    Recover,
    Migrate,
    Info,
    Issue { sats: u64, out: PathBuf },
    Verify { payload: String },
    Redeem { payload: String },
    Pay { invoice: String },
    History,
    Resume { tx_id: String },
}

// ─── Entry point ──────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> Result<()> {
    if std::env::var("RUST_LOG").is_ok() {
        tracing_subscriber::fmt()
            .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
            .with_writer(std::io::stderr)
            .init();
    }

    let cli = Cli::parse();
    let wallet_path = cli.wallet.unwrap_or_else(WalletState::default_path);

    if let Some(cmd) = cli.cmd {
        match cmd {
            Cmd::Init { force }  => cmd_init(&wallet_path, force),
            Cmd::Recover         => cmd_recover(&wallet_path),
            Cmd::Migrate         => cmd_migrate(&wallet_path),
            Cmd::Info            => cmd_info(&wallet_path),
            Cmd::Issue { sats, out } => cmd_issue(&wallet_path, &cli.mint, sats, &out).await,
            Cmd::Verify { payload }  => cmd_verify(&cli.mint, &payload).await,
            Cmd::Redeem { payload }  => cmd_redeem(&wallet_path, &payload).await,
            Cmd::Pay { invoice }     => cmd_pay(&wallet_path, &invoice).await,
            Cmd::History             => cmd_history(&wallet_path).await,
            Cmd::Resume { tx_id }    => cmd_resume(&wallet_path, &tx_id).await,
        }
    } else {
        cmd_interactive(&wallet_path, &cli.mint).await
    }
}

// ─── Passphrase helpers ───────────────────────────────────────────────────────

fn prompt_passphrase(prompt: &str) -> Result<String> {
    let pw = rpassword::prompt_password(prompt)
        .context("Failed to read passphrase")?;
    if pw.is_empty() {
        return Err(anyhow::anyhow!("Passphrase cannot be empty."));
    }
    Ok(pw)
}

fn prompt_new_passphrase() -> Result<String> {
    let pw = rpassword::prompt_password("Choose a wallet passphrase: ")
        .context("Failed to read passphrase")?;
    if pw.is_empty() {
        return Err(anyhow::anyhow!("Passphrase cannot be empty."));
    }
    let confirm = rpassword::prompt_password("Confirm passphrase: ")
        .context("Failed to read passphrase")?;
    if pw != confirm {
        return Err(anyhow::anyhow!("Passphrases do not match."));
    }
    Ok(pw)
}

fn load_wallet(wallet_path: &PathBuf) -> Result<(WalletState, String)> {
    let passphrase = prompt_passphrase("Wallet passphrase: ")?;
    let state = WalletState::load_encrypted(wallet_path, &passphrase)?;
    Ok((state, passphrase))
}

// ─── Command implementations ──────────────────────────────────────────────────

fn cmd_init(wallet_path: &PathBuf, force: bool) -> Result<()> {
    if !force && wallet_path.exists() {
        return Err(anyhow::anyhow!(
            "Wallet already exists at {:?}. Use --force to overwrite.",
            wallet_path
        ));
    }

    println!("Generating BIP39 mnemonic…");
    let (phrase, seed_hex) = generate_mnemonic()?;
    let words: Vec<&str> = phrase.split_whitespace().collect();

    // Display recovery words in a clean box
    let mut lines = Vec::new();
    for (chunk_idx, chunk) in words.chunks(4).enumerate() {
        let line = chunk.iter().enumerate().map(|(i, w)| {
            let idx = i + 1 + (chunk_idx * 4);
            format!("{:>2}. {:15}", idx, w)
        }).collect::<Vec<_>>().join(" ");
        lines.push(line);
    }
    ui::print_box(&lines, Some(("WARNING", "Store these 24 words offline. They can recover all funds.")));

    // Spot-check: ask for one random word
    use rand::Rng;
    let check_idx = rand::rngs::OsRng.gen_range(0..24usize);
    let answer_raw = Text::new(&format!(
        "To confirm you've written them down, enter word #{}: ",
        check_idx + 1
    )).prompt()?;
    let answer = answer_raw.trim().to_lowercase();
    if answer != words[check_idx].to_lowercase() {
        return Err(anyhow::anyhow!(
            "Word #{} is incorrect (expected '{}', got '{}'). Wallet not saved.",
            check_idx + 1,
            words[check_idx],
            answer
        ));
    }
    println!("Backup confirmed.");

    let passphrase = prompt_new_passphrase()?;
    println!("Deriving encryption key…");

    let mut state = WalletState::new(seed_hex, Some(phrase));
    state.save_encrypted(wallet_path, &passphrase)?;

    println!("Wallet created and encrypted.");
    println!("  Path: {}", wallet_path.display());
    Ok(())
}

fn cmd_recover(wallet_path: &PathBuf) -> Result<()> {
    if wallet_path.exists() {
        println!("A wallet already exists at this path.");
        let ok = Text::new("Type 'yes' to overwrite it:").prompt()?;
        if ok.trim().to_lowercase() != "yes" {
            println!("Aborted.");
            return Ok(());
        }
    }

    println!("Enter your 24 recovery words (space-separated):");
    let phrase_raw = Text::new("Recovery words:").prompt()?;
    let phrase = phrase_raw.trim().to_string();

    let seed_hex = mnemonic_to_seed_hex(&phrase)?;
    println!("Mnemonic valid.");

    let passphrase = prompt_new_passphrase()?;
    println!("Deriving encryption key…");

    let mut state = WalletState::new(seed_hex, Some(phrase));
    state.save_encrypted(wallet_path, &passphrase)?;

    println!("Wallet recovered and encrypted.");
    println!("  Path: {}", wallet_path.display());
    println!("  Run `ecash info` to verify, then re-sync your mints by issuing or redeeming.");
    Ok(())
}

fn cmd_migrate(wallet_path: &PathBuf) -> Result<()> {
    println!("Migrating legacy plaintext wallet to encrypted format…");

    let mut state = WalletState::load_plaintext(wallet_path)
        .context("Could not read plaintext wallet. Is the path correct?")?;

    let passphrase = prompt_new_passphrase()?;
    println!("Deriving encryption key…");
    state.save_encrypted(wallet_path, &passphrase)?;

    println!("Wallet encrypted successfully.");
    Ok(())
}

fn cmd_info(wallet_path: &PathBuf) -> Result<()> {
    let (state, _) = load_wallet(wallet_path)?;

    // Summary box
    let mut lines = Vec::new();
    lines.push(format!("Path    : {}", wallet_path.display()));
    lines.push(format!("Seed    : {}…{}", &state.seed_hex[..8], &state.seed_hex[56..]));
    lines.push(format!("Index   : {}", state.derivation_index));
    lines.push(format!("Mints   : {}", state.mints.len()));
    ui::print_box(&lines, None);

    // Balance table
    let mut balances: Vec<_> = state.balance_by_mint().into_iter().collect();
    balances.sort_by_key(|(_, b)| *b);
    let total = state.total_balance();
    let table = ui::balance_table(balances, total);
    println!("\n{}", table);

    // Recovery words if available
    if let Some(phrase) = &state.mnemonic {
        let words: Vec<&str> = phrase.split_whitespace().collect();
        let mut word_lines = Vec::new();
        for (chunk_idx, chunk) in words.chunks(4).enumerate() {
            let line = chunk.iter().enumerate().map(|(i, w)| {
                let idx = i + 1 + (chunk_idx * 4);
                format!("{:>2}. {:15}", idx, w)
            }).collect::<Vec<_>>().join(" ");
            word_lines.push(line);
        }
        ui::print_box(&word_lines, Some(("⚠", "Keep these words secret. They can recover all funds.")));
    }

    Ok(())
}

async fn cmd_issue(
    wallet_path: &PathBuf,
    mint_urls_str: &str,
    sats: u64,
    out_dir: &PathBuf,
) -> Result<()> {
    let (mut state, passphrase) = load_wallet(wallet_path)?;

    let mint_urls: Vec<&str> = mint_urls_str.split(',').map(|s| s.trim()).collect();
    println!("Issuing {} sat note via {:?}…", sats, mint_urls);

    let mut allocations = Vec::new();
    let per_mint = sats / mint_urls.len() as u64;
    let remainder = sats % mint_urls.len() as u64;
    for (i, url) in mint_urls.iter().enumerate() {
        let amt = if i == 0 { per_mint + remainder } else { per_mint };
        allocations.push((*url, amt));
    }

    let pb = ui::progress_spinner("Preparing note…");

    let note = issue_multimint_note(
        &mut state,
        wallet_path,
        &passphrase,
        &allocations,
        ecash_wallet::ReserveStrategy::Static,
        |hub_mint, inv, total_sats| async move {
            pb.finish_and_clear();
            // Show invoice in a box
            let mut lines = Vec::new();
            lines.push(format!("Mint: {}", hub_mint));
            lines.push(format!("Face value : {} sats", sats));
            lines.push(format!("Total cost : {} sats (includes {} sats fee reserve)", total_sats, total_sats - sats));
            lines.push("".to_string());
            lines.push(inv.clone());
            ui::print_box(&lines, Some(("ACTION", "Pay the invoice above to fund this note.")));
            qr2term::print_qr(&inv).unwrap();
            println!();
            println!("Waiting for payment…");
            // The callback must return ()
        }
    ).await?;

    // Note: the progress bar `pb` was moved into the closure and finished there.
    // We can now save the files.

    std::fs::create_dir_all(out_dir)?;
    let json_path = out_dir.join(format!("{}.json", note.serial));
    let pdf_path  = out_dir.join(format!("{}.pdf",  note.serial));
    let bin_path  = out_dir.join(format!("{}.bin",  note.serial));
    let public_bin = ecash_core::compact::encode_public_data(
        &note.public_data,
        note.amount_sats,
        note.block_height,
    ).expect("Encode error");
    std::fs::write(&json_path, serde_json::to_string_pretty(&note)?)?;
    let svg_str = generate_note_svg(&note)?;
    let pdf_bytes = generate_note_pdf(&svg_str)?;
    std::fs::write(&pdf_path, &pdf_bytes)?;
    std::fs::write(&bin_path, &public_bin)?;

    // Output summary
    let summary_lines = vec![
        format!("Serial  : {}", note.serial),
        format!("Amount  : {} sats", note.amount_sats),
        format!("JSON    : {}", json_path.display()),
        format!("BIN     : {}", bin_path.display()),
        format!("PDF     : {}", pdf_path.display()),
    ];
    ui::print_box(&summary_lines, Some(("✓", "Note issued successfully.")));
    Ok(())
}

async fn cmd_verify(_mint_url: &str, payload: &str) -> Result<()> {
    let bytes = decode_qr_payload(payload).context("Invalid base45/64 payload")?;

    let decoded = match ecash_core::compact::decode_public_data(&bytes) {
        Ok(d) => d,
        Err(e) => {
            println!("Failed to decode binary file: {}", e);
            println!("  This payload may not be a valid ecash note binary.");
            return Ok(());
        }
    };
    let pub_data = &decoded.data;

    let mut verifier = OfflineVerifier::new();
    let mut trusted_mints = TrustedMints::load();
    let mut modified_trusted_mints = false;

    for entry in &pub_data.entries {
        let mint = &entry.mint;

        if let Some(keys) = trusted_mints.keys.get(mint) {
            verifier.trust_mint(mint, "Mint", keys.clone());
        } else {
            println!("Mint {} is not in your trusted list.", mint);
            let options = vec![
                "Trust permanently (fetches and saves keys)",
                "Allow temporarily (fetches keys for this verification only)",
                "Reject (skip verification for this mint)"
            ];
            let choice = Select::new("What would you like to do?", options).prompt();

            if let Ok(choice) = choice {
                if choice.starts_with("Trust") || choice.starts_with("Allow") {
                    if let Some(keys) = fetch_mint_keys(mint).await {
                        verifier.trust_mint(mint, "Mint", keys.clone());
                        if choice.starts_with("Trust") {
                            trusted_mints.keys.insert(mint.to_string(), keys);
                            modified_trusted_mints = true;
                        }
                    } else {
                        println!("Could not fetch keys from {}. Mint might be offline.", mint);
                    }
                }
            }
        }
    }

    if modified_trusted_mints {
        let _ = trusted_mints.save();
    }

    let result = verifier.verify(pub_data);
    println!();
    fmt_verbose_result(&result, &decoded);

    if matches!(result, VerificationResult::Valid { .. } | VerificationResult::ValidUntrusted { .. }) {
        print!("  Checking double-spend status online... ");
        std::io::stdout().flush().unwrap();

        match ecash_verifier::OfflineVerifier::check_spend_state(pub_data).await {
            Ok(ecash_verifier::SpentStatus::Unspent) => {
                println!("UNSPENT");
                println!("  The note is secure and ready to be redeemed.");
                println!("  To redeem: use 'Redeem Note' with the .json file");
            }
            Ok(ecash_verifier::SpentStatus::Spent) => {
                println!("SPENT");
                println!("  WARNING: This note has already been redeemed! The funds are gone.");
            }
            Err(e) => {
                println!("UNKNOWN");
                println!("  Could not verify online state: {}", e);
            }
        }
    }

    Ok(())
}

fn fmt_verbose_result(r: &VerificationResult, decoded: &ecash_core::compact::DecodedPublicData) {
    let mut lines = Vec::new();
    
    let hash = &decoded.data.validation_hash;
    let chars: Vec<char> = hash.to_uppercase().chars().take(12).collect();
    let serial = format!("{}-{}-{}", chars[..4].iter().collect::<String>(), chars[4..8].iter().collect::<String>(), chars[8..12].iter().collect::<String>());
    
    let mut key_ids = Vec::new();
    for entry in &decoded.data.entries {
        for proof in &entry.proofs {
            if !key_ids.contains(&proof.id) {
                key_ids.push(proof.id.clone());
            }
        }
    }
    
    match r {
        VerificationResult::Valid { face_value_sats, proof_total_sats, mint_urls } => {
            lines.push(format!("Serial Number     : {}", serial));
            lines.push(format!("Block height      : {}", decoded.block_height));
            lines.push(format!("Validation hash   : {} (MATCHES)", hash));
            lines.push(format!("Key ID(s)         : {}", key_ids.join(", ")));
            lines.push("DLEQ proofs       : VERIFIED".to_string());
            lines.push("Blind signatures  : VALID".to_string());
            lines.push(format!("Face value        : {} sats", face_value_sats));
            lines.push(format!("Proof total       : {} sats", proof_total_sats));
            if proof_total_sats > face_value_sats {
                lines.push(format!("Fee reserve       : {} sats", proof_total_sats - face_value_sats));
            }
            lines.push(format!("Mints             : {}", mint_urls.join(", ")));
            ui::print_box(&lines, Some(("STATUS", "VALID  (all cryptographic checks passed)")));
        }
        VerificationResult::ValidUntrusted { face_value_sats, proof_total_sats, mint_urls } => {
            lines.push(format!("Serial Number     : {}", serial));
            lines.push(format!("Block height      : {}", decoded.block_height));
            lines.push(format!("Validation hash   : {} (MATCHES)", hash));
            lines.push(format!("Key ID(s)         : {}", key_ids.join(", ")));
            lines.push("DLEQ proofs       : SKIPPED (MINT UNTRUSTED)".to_string());
            lines.push("Blind signatures  : UNVERIFIED".to_string());
            lines.push(format!("Face value        : {} sats", face_value_sats));
            lines.push(format!("Proof total       : {} sats", proof_total_sats));
            if proof_total_sats > face_value_sats {
                lines.push(format!("Fee reserve       : {} sats", proof_total_sats - face_value_sats));
            }
            lines.push(format!("Mints             : {}", mint_urls.join(", ")));
            ui::print_box(&lines, Some(("STATUS", "VALID (UNTRUSTED MINT)")));
        }
        VerificationResult::UntrustedMint { url } => {
            lines.push(format!("Missing trusted keys for {}", url));
            ui::print_box(&lines, Some(("STATUS", "FAILED  (mint not trusted)")));
        }
        VerificationResult::IntegrityMismatch => {
            lines.push("Hash mismatch – note has been tampered with!".to_string());
            ui::print_box(&lines, Some(("STATUS", "FAILED  (integrity violation)")));
        }
        VerificationResult::InvalidFormat { reason } => {
            lines.push(format!("Invalid format: {}", reason));
            ui::print_box(&lines, Some(("STATUS", "FAILED  (invalid format)")));
        }
        VerificationResult::InvalidProofPoint { index } => {
            lines.push(format!("Proof #{} contains invalid curve points.", index));
            ui::print_box(&lines, Some(("STATUS", "FAILED  (counterfeit signatures)")));
        }
    }
}

async fn cmd_redeem(wallet_path: &PathBuf, payload: &str) -> Result<()> {
    println!("Redeeming note…");

    let (mut state, passphrase) = load_wallet(wallet_path)?;

    let bin_data = decode_qr_payload(payload).context("Invalid base45/64 payload")?;
    let note = ecash_core::compact::decode_full_note(&bin_data).map_err(|e| anyhow::anyhow!("Decode error: {:?}", e))?;

    let public_data = note.public_data;
    let amount_sats = note.amount_sats;
    let master_seed_hex = note.private_data.master_seed_hex;

    println!("  Face value: {} sats", amount_sats);

    let ln_invoice_raw = Text::new(&format!(
        "Paste a Lightning invoice for exactly {} sats:", amount_sats
    )).prompt()?;
    let ln_invoice: String = ln_invoice_raw.chars().filter(|c| !c.is_whitespace()).collect();

    match validate_invoice(&ln_invoice, Some(amount_sats)) {
        Ok(_) => {}
        Err(e) => {
            println!("Error: {}", e);
            return Ok(());
        }
    }

    let pb = ui::progress_spinner("Consolidating funds & paying invoice…");

    match redeem_note(&mut state, wallet_path, &passphrase, &public_data, &master_seed_hex, &ln_invoice).await {
        Ok(redeemed) => {
            pb.finish_with_message(format!("Successfully routed {} sats!", redeemed));
            println!("  ✓ Redemption completed.");
        }
        Err(e) => {
            pb.finish_with_message("Redemption failed.");
            println!("  Error: {}", e);
        }
    }

    Ok(())
}

async fn cmd_pay(wallet_path: &PathBuf, invoice: &str) -> Result<()> {
    let (mut state, passphrase) = load_wallet(wallet_path)?;

    match validate_invoice(invoice, None) {
        Ok(0) => println!("Any-amount invoice — will pay based on mint quote."),
        Ok(sats) => {
            println!("Invoice amount: {} sats", sats);
            let confirm = Text::new("Confirm payment? (yes/no):").prompt()?;
            if confirm.trim().to_lowercase() != "yes" {
                return Ok(());
            }
        }
        Err(e) => return Err(anyhow::anyhow!("Invalid invoice: {}", e)),
    }

    let pb = ui::progress_spinner("Paying invoice…");
    match pay_invoice(&mut state, wallet_path, &passphrase, invoice).await {
        Ok(paid_amt) => pb.finish_with_message(format!("Paid {} sats!", paid_amt)),
        Err(e) => pb.finish_with_message(format!("Payment failed: {}", e)),
    }
    Ok(())
}

async fn cmd_history(wallet_path: &PathBuf) -> Result<()> {
    let (state, _) = load_wallet(wallet_path)?;
    let mut txs = state.transactions.clone();
    txs.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    if txs.is_empty() {
        println!("No transactions found.");
        return Ok(());
    }

    let table = ui::history_table(txs);
    println!("{}", table);
    Ok(())
}

async fn cmd_resume(wallet_path: &PathBuf, tx_id: &str) -> Result<()> {
    let (mut state, passphrase) = load_wallet(wallet_path)?;

    let tx = state.transactions.iter().find(|t| t.id == tx_id).context("Transaction not found")?.clone();

    if tx.status != ecash_core::types::TransactionStatus::Pending {
        println!("Transaction is not pending. Status: {:?}", tx.status);
        return Ok(());
    }

    println!("Resuming {} transaction...", match tx.tx_type {
        ecash_core::types::TransactionType::Mint(_) => "Mint",
        ecash_core::types::TransactionType::Melt(_) => "Melt",
        ecash_core::types::TransactionType::Issue(_) => "Issue",
        ecash_core::types::TransactionType::Redeem(_) => "Redeem",
    });

    match tx.tx_type {
        ecash_core::types::TransactionType::Issue(_) => {
            let note = ecash_wallet::resume_issue_note(&mut state, wallet_path, &passphrase, tx_id).await?;
            println!("Successfully resumed issuance!");
            let out_dir = PathBuf::from("./notes");
            std::fs::create_dir_all(&out_dir)?;
            let pdf_path  = out_dir.join(format!("{}.pdf",  note.serial));
            let json_path = out_dir.join(format!("{}.json", note.serial));
            let bin_path  = out_dir.join(format!("{}.bin",  note.serial));
            let public_bin = ecash_core::compact::encode_public_data(
                &note.public_data,
                note.amount_sats,
                note.block_height,
            ).expect("Encode error");
            std::fs::write(&json_path, serde_json::to_string_pretty(&note)?)?;
            let svg_str = generate_note_svg(&note)?;
            let pdf_bytes = generate_note_pdf(&svg_str)?;
            std::fs::write(&pdf_path, &pdf_bytes)?;
            std::fs::write(&bin_path, &public_bin)?;
            println!("  JSON → {}", json_path.display());
            println!("  BIN  → {}", bin_path.display());
            println!("  PDF  → {}", pdf_path.display());
        }
        ecash_core::types::TransactionType::Melt(_) | ecash_core::types::TransactionType::Redeem(_) => {
            let new_status = ecash_wallet::check_melt_status(&mut state, wallet_path, &passphrase, tx_id).await?;
            println!("Checked melt status: {:?}", new_status);
        }
        ecash_core::types::TransactionType::Mint(_) => {
            ecash_wallet::retry_mint(&mut state, wallet_path, &passphrase, tx_id).await?;
            println!("Successfully retried mint and salvaged funds into wallet!");
        }
    }

    Ok(())
}

// ─── Interactive mode ─────────────────────────────────────────────────────────

async fn cmd_interactive(wallet_path: &PathBuf, default_mint: &str) -> Result<()> {
    ui::print_header("Physical eCash Wallet");

    loop {
        let options = vec![
            "Dashboard & Balance",
            "Issue Physical Note",
            "Verify Note Offline",
            "Redeem Note (Lightning)",
            "Pay Lightning Invoice",
            "Transaction History",
            "Resume Pending Transaction",
            "Show Recovery Words",
            "Exit",
        ];

        let ans = Select::new("Main Menu", options).prompt()?;

        match ans {
            "Dashboard & Balance" => {
                match load_wallet(wallet_path) {
                    Ok((state, _)) => {
                        let mut balances: Vec<_> = state.balance_by_mint().into_iter().collect();
                        balances.sort_by_key(|(_, b)| *b);
                        let total = state.total_balance();
                        let table = ui::balance_table(balances, total);
                        println!("{}", table);
                    }
                    Err(e) => println!("Error: {}", e),
                }
            }

            "Issue Physical Note" => {
                let (mut state, passphrase) = match load_wallet(wallet_path) {
                    Ok(s) => s,
                    Err(e) => { println!("Error: {}", e); continue; }
                };

                let sats_str = Text::new("Amount to issue (sats):").prompt()?;
                let sats: u64 = match sats_str.parse() {
                    Ok(s) => s,
                    Err(_) => { println!("Invalid amount!"); continue; }
                };

                let default_mints = if state.mints.is_empty() {
                    default_mint.to_string()
                } else {
                    state.mints.join(",")
                };

                let mint_urls_str = Text::new("Mint URLs (comma separated):")
                    .with_default(&default_mints)
                    .prompt()?;

                let out_dir_str = Text::new("Output directory:")
                    .with_default("./notes")
                    .prompt()?;

                let clean_mints: String = mint_urls_str.chars().filter(|c| !c.is_whitespace()).collect();
                let mint_urls: Vec<&str> = clean_mints.split(',').filter(|s| !s.is_empty()).collect();
                let mut allocations = Vec::new();
                let per_mint = sats / mint_urls.len() as u64;
                let remainder = sats % mint_urls.len() as u64;
                for (i, url) in mint_urls.iter().enumerate() {
                    let amt = if i == 0 { per_mint + remainder } else { per_mint };
                    allocations.push((*url, amt));
                }

                let strategy_options = vec![
                    "Static (Higher compatibility)",
                    "Dynamic (Lower fees)",
                ];
                let strategy_ans = Select::new("Fee Reserve Strategy:", strategy_options).prompt()?;
                let strategy = if strategy_ans.starts_with("Static") {
                    ecash_wallet::ReserveStrategy::Static
                } else {
                    ecash_wallet::ReserveStrategy::Dynamic
                };

                let pb = ui::progress_spinner("Issuing note…");
                let pb_invoice = pb.clone();

                match issue_multimint_note(
                    &mut state,
                    wallet_path,
                    &passphrase,
                    &allocations,
                    strategy,
                    move |hub_mint, inv, total_sats| {
                        let pb_invoice = pb_invoice.clone();

                        async move {
                            pb_invoice.finish_and_clear();

                            let mut lines = Vec::new();
                            lines.push(format!("Mint: {}", hub_mint));
                            lines.push(format!("Face value : {} sats", sats));
                            lines.push(format!(
                                "Total cost : {} sats (includes {} sats fee reserve)",
                                total_sats,
                                total_sats - sats
                            ));
                            lines.push("".to_string());
                            lines.push(inv.clone());

                            ui::print_box(
                                &lines,
                                Some(("ACTION", "Pay the invoice above to fund this note."))
                            );

                            qr2term::print_qr(&inv).unwrap();
                            println!();
                            println!("Waiting for payment…");
                        }
                    }
                ).await {
                    Ok(note) => {
                        pb.finish_with_message("Note issued!");
                        let out_path = PathBuf::from(&out_dir_str);
                        std::fs::create_dir_all(&out_path).ok();
                        let json_path = out_path.join(format!("{}.json", note.serial));
                        let pdf_path  = out_path.join(format!("{}.pdf",  note.serial));
                        let bin_path  = out_path.join(format!("{}.bin",  note.serial));
                        let public_bin = ecash_core::compact::encode_public_data(
                            &note.public_data,
                            note.amount_sats,
                            note.block_height,
                        ).expect("Encode error");
                        std::fs::write(&json_path, serde_json::to_string_pretty(&note).unwrap()).ok();
                        if let Ok(svg) = generate_note_svg(&note) {
                            std::fs::write(&pdf_path, generate_note_pdf(&svg).unwrap()).ok();
                        }
                        std::fs::write(&bin_path, &public_bin).ok();
                        let summary = vec![
                            format!("Serial : {}", note.serial),
                            format!("JSON   : {}", json_path.display()),
                            format!("BIN    : {}", bin_path.display()),
                            format!("PDF    : {}", pdf_path.display()),
                        ];
                        ui::print_box(&summary, Some(("✓", "Note ready for printing.")));
                    }
                    Err(e) => {
                        pb.finish_with_message("Error issuing note.");
                        println!("Error: {:?}", e);
                    }
                }
            }

            "Verify Note Offline" => {
                let payload = Text::new("Scan the public QR code (Base45/Base64 payload):").prompt()?;
                let payload = payload.trim();
                let _ = cmd_verify(default_mint, payload).await;
            }

            "Redeem Note (Lightning)" => {
                let payload = Text::new("Scan the private/full QR code (Base45/Base64 payload):").prompt()?;
                let payload = payload.trim();
                let _ = cmd_redeem(wallet_path, payload).await;
            }

            "Pay Lightning Invoice" => {
                let (mut state, passphrase) = match load_wallet(wallet_path) {
                    Ok(s) => s,
                    Err(e) => { println!("Error: {}", e); continue; }
                };

                if state.total_balance() == 0 {
                    println!("Wallet is empty. Redeem some notes first.");
                    continue;
                }

                let ln_invoice_raw = Text::new("Paste a Lightning invoice:").prompt()?;
                let ln_invoice: String = ln_invoice_raw.chars().filter(|c| !c.is_whitespace()).collect();

                match validate_invoice(&ln_invoice, None) {
                    Ok(0) => println!("Any-amount invoice — will pay based on mint quote."),
                    Ok(sats) => {
                        println!("Invoice amount: {} sats", sats);
                        let confirm = Text::new("Confirm payment? (yes/no):").prompt()?;
                        if confirm.trim().to_lowercase() != "yes" { continue; }
                    }
                    Err(e) => { println!("Error: {}", e); continue; }
                }

                let pb = ui::progress_spinner("Paying invoice…");
                match pay_invoice(&mut state, wallet_path, &passphrase, &ln_invoice).await {
                    Ok(paid_amt) => pb.finish_with_message(format!("Paid {} sats!", paid_amt)),
                    Err(e) => pb.finish_with_message(format!("Payment failed: {}", e)),
                }
            }

            "Transaction History" => {
                let _ = cmd_history(wallet_path).await;
            }

            "Resume Pending Transaction" => {
                let tx_id = Text::new("Transaction ID:").prompt()?;
                let _ = cmd_resume(wallet_path, tx_id.trim()).await;
            }

            "Show Recovery Words" => {
                match load_wallet(wallet_path) {
                    Ok((state, _)) => {
                        if let Some(phrase) = &state.mnemonic {
                            let words: Vec<&str> = phrase.split_whitespace().collect();
                            let mut lines = Vec::new();
                            for (chunk_idx, chunk) in words.chunks(4).enumerate() {
                                let line = chunk.iter().enumerate().map(|(i, w)| {
                                    let idx = i + 1 + (chunk_idx * 4);
                                    format!("{:>2}. {:15}", idx, w)
                                }).collect::<Vec<_>>().join(" ");
                                lines.push(line);
                            }
                            ui::print_box(&lines, Some(("⚠", "Store these 24 words offline. Never share them.")));
                        } else {
                            println!("No mnemonic stored — this wallet was created without BIP39.");
                            println!("  Seed hex: {}", state.seed_hex);
                        }
                    }
                    Err(e) => println!("Error: {}", e),
                }
            }

            "Exit" => break,
            _ => {}
        }
    }
    Ok(())
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

async fn fetch_mint_keys(url: &str) -> Option<std::collections::HashMap<u64, String>> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(4))
        .build()
        .ok()?;
    let res = client.get(format!("{}/v1/keys", url.trim_end_matches('/'))).send().await.ok()?;
    let v: serde_json::Value = res.json().await.ok()?;
    let ks = &v["keysets"][0];
    let mut keys = std::collections::HashMap::new();
    for (amt_str, pk) in ks["keys"].as_object()? {
        if let Ok(amt) = amt_str.parse() {
            keys.insert(amt, pk.as_str()?.to_string());
        }
    }
    Some(keys)
}

pub fn decode_qr_payload(payload: &str) -> anyhow::Result<Vec<u8>> {
    use std::io::Read;
    use base64::Engine;
    if let Some(b45) = payload.strip_prefix("ECASHZ:") {
        let compressed = base45::decode(b45).map_err(|_| anyhow::anyhow!("Invalid base45 payload"))?;
        let mut decoder = flate2::read::ZlibDecoder::new(&compressed[..]);
        let mut decompressed = Vec::new();
        decoder.read_to_end(&mut decompressed)?;
        Ok(decompressed)
    } else if let Some(b64) = payload.strip_prefix("eCashZ:") {
        let compressed = base64::engine::general_purpose::STANDARD.decode(b64)?;
        let mut decoder = flate2::read::ZlibDecoder::new(&compressed[..]);
        let mut decompressed = Vec::new();
        decoder.read_to_end(&mut decompressed)?;
        Ok(decompressed)
    } else {
        let decoded = base64::engine::general_purpose::STANDARD.decode(payload)?;
        Ok(decoded)
    }
}

pub fn generate_note_pdf(svg_string: &str) -> anyhow::Result<Vec<u8>> {
    let mut fontdb = svg2pdf::usvg::fontdb::Database::new();
    fontdb.load_font_data(include_bytes!("../../../cashu-app/src-tauri/assets/Roboto-Regular.ttf").to_vec());
    fontdb.set_serif_family("Roboto");
    fontdb.set_sans_serif_family("Roboto");
    fontdb.set_monospace_family("Roboto");
    fontdb.set_cursive_family("Roboto");
    fontdb.set_fantasy_family("Roboto");

    let mut opt = svg2pdf::usvg::Options::default();
    opt.font_family = "Roboto".to_string();
    opt.fontdb = std::sync::Arc::new(fontdb);

    let tree = svg2pdf::usvg::Tree::from_str(svg_string, &opt)
        .map_err(|e| anyhow::anyhow!("SVG parse error: {}", e))?;

    let pdf_bytes = svg2pdf::to_pdf(
        &tree,
        svg2pdf::ConversionOptions::default(),
        svg2pdf::PageOptions::default()
    ).map_err(|e| anyhow::anyhow!("PDF generation failed: {:?}", e))?;

    Ok(pdf_bytes)
}