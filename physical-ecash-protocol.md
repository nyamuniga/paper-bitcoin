## Physical Ecash System: A Rust Prototype Implementation

This document provides a comprehensive technical specification for implementing a physical ecash system in Rust, covering multi-mint balance distribution, secure token generation, cryptographic verification, offline redemption, and mint coordination for final payout.

---

## 1. System Overview

The prototype implements a Chaumian ecash protocol where physical notes (paper vouchers with tamper-evident seals) represent redeemable Bitcoin value. The system supports **multiple mints** to eliminate single points of failure, with wallets automatically distributing user balances across user-selected mints based on configurable policies.

### 1.1 Core Components

| Component | Description |
|-----------|-------------|
| **Physical Note** | Paper voucher with tamper-evident seal, containing encoded ecash token data |
| **Mint Node** | Rust server implementing blind signatures, holding Bitcoin reserves |
| **Wallet Library** | Rust client managing multi-mint token storage and splitting |
| **Verifier Device** | Offline hardware (e.g., ESP32) for cryptographic note validation |
| **Redemption Gateway** | Online service coordinating between offline signed redemptions and mints |

### 1.2 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PHYSICAL ECASH SYSTEM                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                    │
│  │  Mint A     │     │  Mint B     │     │  Mint C     │                    │
│  │  (Rust)     │     │  (Rust)     │     │  (Rust)     │                    │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘                    │
│         │                   │                   │                           │
│         └───────────────────┼───────────────────┘                           │
│                             │                                               │
│                     ┌───────▼───────┐                                       │
│                     │  Wallet Core  │  ◄── Multi-mint balance distributor   │
│                     │  (cdk crate)  │                                       │
│                     └───────┬───────┘                                       │
│                             │                                               │
│              ┌──────────────┼────────────────┐                              │
│              │              │                │                              │
│       ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐                       │
│       │TokenEncoder │ │NotePrinter  │ │Verifier     │                       │
│       │(blind sign) │ │(QR/hexcode) │ │(Offline)    │                       │
│       └─────────────┘ └─────────────┘ └──────┬──────┘                       │
│                                               │                              │
│                                        ┌──────▼──────┐                       │
│                                        │ Redemption  │                       │
│                                        │ Gateway     │                       │
│                                        └─────────────┘                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Cryptographic Primitives

### 2.1 Blind Signature Scheme (DHKE-Based)

Following the Cashu NUT‑00 specification, the system uses a **Blind Diffie‑Hellman Key Exchange (DHKE)** scheme for untraceable token issuance.

```
Setup:
  mint_keypair = (private_key a, public_key A = a*G)
  wallet_secret = random blinding factor r
  message = B (a random secret point)

Blinding:
  B' = B + r*A   (user blinds the message)

Mint Signing:
  C' = a * B'    (mint signs the blinded point)

Unblinding:
  C = C' - r*A   (user extracts the unblinded signature)
  = a*B          (valid signature on original message)
```

**Implementation (Rust using k256 crate):**

```rust
use k256::{ProjectivePoint, Scalar};
use rand::rngs::OsRng;
use sha2::{Sha256, Digest};

/// Mint's secret key (a) and public key (A = a*G)
pub struct MintKeypair {
    pub secret: Scalar,
    pub public: ProjectivePoint,
}

impl MintKeypair {
    pub fn generate() -> Self {
        let secret = Scalar::random(&mut OsRng);
        let public = (ProjectivePoint::GENERATOR * secret).into();
        Self { secret, public }
    }

    /// Sign a blinded message B' (returns C' = a * B')
    pub fn blind_sign(&self, blinded_point: ProjectivePoint) -> ProjectivePoint {
        blinded_point * self.secret
    }
}

/// Wallet generates a blinding factor and constructs a blinded message
pub struct BlindedMessage {
    pub secret: Scalar,          // blinding factor r
    pub message: ProjectivePoint, // original point B
    pub blinded: ProjectivePoint, // blinded point B' = B + r*A
}

impl BlindedMessage {
    pub fn new(mint_public: ProjectivePoint) -> Self {
        let secret = Scalar::random(&mut OsRng);
        let message = ProjectivePoint::GENERATOR * Scalar::random(&mut OsRng);
        let blinded = message + (mint_public * secret);
        Self { secret, message, blinded }
    }

    /// Unblind mint's signature: C = C' - r*A
    pub fn unblind(&self, blind_sig: ProjectivePoint, mint_public: ProjectivePoint) -> Proof {
        let unblinded = blind_sig - (mint_public * self.secret);
        Proof {
            amount: 0,
            secret: self.message.to_bytes().to_vec(),
            c: unblinded.to_bytes().to_vec(),
        }
    }
}
```

### 2.2 Key Derivation for Physical Codes

Each token’s secret is deterministically derived from a seed phrase, enabling recovery of all issued tokens from a single backup:

```rust
use bip39::{Mnemonic, Seed};

pub struct TokenDerivation {
    pub master_seed: [u8; 32],
    pub derivation_index: u64,
}

impl TokenDerivation {
    /// Derive token secret deterministically from master seed + index
    pub fn derive_secret(&self) -> [u8; 32] {
        let mut hasher = Sha256::new();
        hasher.update(&self.master_seed);
        hasher.update(&self.derivation_index.to_le_bytes());
        hasher.finalize().into()
    }

    /// Generate a complete token (secret + blind signature) for physical printing
    pub fn generate_physical_token(
        &mut self,
        amount: Amount,
        mint: &MintClient,
    ) -> PhysicalToken {
        let secret = self.derive_secret();
        let blinded = BlindedMessage::new(mint.public_key());
        let blind_sig = mint.request_blind_signature(blinded.blinded, amount);
        let proof = blinded.unblind(blind_sig, mint.public_key());
        
        self.derivation_index += 1;
        
        PhysicalToken {
            amount,
            mint_url: mint.url.clone(),
            secret: hex::encode(secret),
            proof,
            derivation_index: self.derivation_index - 1,
        }
    }
}
```

---

## 3. Multi-Mint Balance Distribution

### 3.1 Mint Selection Policy

The wallet allows users to select multiple mints with configurable allocation policies:

```rust
#[derive(Debug, Clone)]
pub enum AllocationPolicy {
    /// Distribute proportionally to mint reliability scores
    Proportional(Vec<MintWeight>),
    /// Fill mints in order until balance exhausted
    Priority(Vec<MintUrl>),
    /// Keep specific amounts in specific mints
    Fixed(Vec<(MintUrl, Amount)>),
}

#[derive(Debug, Clone)]
pub struct MintWeight {
    pub url: MintUrl,
    pub weight: f64,  // e.g., 0.5 = 50%
}

/// Multi-mint wallet that distributes balance across user-selected mints
pub struct MultiMintWallet {
    wallets: HashMap<MintUrl, Wallet<LocalStore>>,
    policy: AllocationPolicy,
    total_balance: Amount,
}

impl MultiMintWallet {
    /// Create wallet with multiple mints based on user selection
    pub async fn new(
        mint_configs: Vec<MintConfig>,
        policy: AllocationPolicy,
        seed: [u8; 64],
    ) -> Result<Self> {
        let mut wallets = HashMap::new();
        for config in mint_configs {
            let store = Arc::new(LocalStore::new());
            let wallet = Wallet::new(
                config.url.clone(),
                CurrencyUnit::Sat,
                store,
                seed,
                None,
            )?;
            wallets.insert(config.url, wallet);
        }
        Ok(Self { wallets, policy, total_balance: Amount::ZERO })
    }

    /// Distribute incoming funds across mints according to policy
    pub async fn distribute_incoming(
        &mut self,
        amount: Amount,
        source_mint: &MintUrl,
    ) -> Result<()> {
        match &self.policy {
            AllocationPolicy::Proportional(weights) => {
                let total_weight: f64 = weights.iter().map(|w| w.weight).sum();
                for weight in weights {
                    let alloc = Amount::from_sat(
                        (amount.to_sat() as f64 * weight.weight / total_weight) as u64
                    );
                    if alloc > Amount::ZERO && weight.url != *source_mint {
                        self.wallets.get_mut(&weight.url)
                            .ok_or_else(|| anyhow!("Missing mint"))?
                            .receive(alloc, &source_mint)
                            .await?;
                    }
                }
            }
            AllocationPolicy::Priority(order) => {
                let mut remaining = amount;
                for url in order {
                    if remaining == Amount::ZERO { break; }
                    let to_send = remaining.min(Amount::from_sat(10000)); // chunk size
                    if let Some(wallet) = self.wallets.get_mut(url) {
                        wallet.receive(to_send, source_mint).await?;
                        remaining = remaining - to_send;
                    }
                }
            }
            // ... other policies
        }
        Ok(())
    }
}
```

### 3.2 Mint Configuration Registry

The wallet maintains a registry of available mints with metadata for user selection:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MintInfo {
    pub url: MintUrl,
    pub name: String,
    pub keyset_id: String,
    pub fee_percent: f64,      // mint's fee for redemption
    pub reliability_score: f64, // user-defined or historically tracked
    pub is_active: bool,
}

impl MintInfo {
    /// Fetch mint's public keys and keyset ID from NUT-01 endpoint
    pub async fn fetch_info(url: &MintUrl) -> Result<Self> {
        let client = reqwest::Client::new();
        let keys_response: KeysResponse = client
            .get(format!("{}/v1/keys", url))
            .send()
            .await?
            .json()
            .await?;
        
        Ok(Self {
            url: url.clone(),
            name: keys_response.name.unwrap_or_else(|| url.to_string()),
            keyset_id: keys_response.keyset_id,
            fee_percent: keys_response.fee_percent.unwrap_or(0.0),
            reliability_score: 1.0,
            is_active: true,
        })
    }
}
```

---

## 4. Token Generation and Physical Printing

### 4.1 Full Token Lifecycle

```rust
/// Full lifecycle of a physical ecash token
pub struct PhysicalTokenLifecycle {
    derivation: TokenDerivation,
    mints: Vec<MintInfo>,
}

impl PhysicalTokenLifecycle {
    /// Step 1: User requests physical note issuance
    pub async fn request_physical_notes(
        &mut self,
        amount_sats: u64,
        mint_url: MintUrl,
    ) -> Result<Vec<PhysicalToken>> {
        let mint = self.get_mint_client(&mint_url).await?;
        let mut tokens = Vec::new();
        
        // Request mint quote (amount to be locked)
        let quote = mint.mint_quote(Amount::from_sat(amount_sats), None).await?;
        
        // User pays the Lightning invoice (external process)
        // Wait for confirmation
        self.wait_for_payment(&quote.id).await?;
        
        // Mint tokens and receive proofs
        let proofs = mint.mint(quote.id, SplitTarget::default(), None).await?;
        
        // Convert proofs to physical token format
        for proof in proofs {
            let token = self.derivation.generate_physical_token(
                proof.amount,
                &mint,
            )?;
            tokens.push(token);
        }
        
        Ok(tokens)
    }
    
    /// Step 2: Convert token to scannable/printable formats
    pub fn encode_for_printing(&self, token: &PhysicalToken) -> PrintData {
        PrintData {
            qr_public: self.encode_public_qr(token),
            qr_secret: self.encode_secret_qr(token),
            human_readable: self.encode_human_readable(token),
            validation_hash: self.compute_validation_hash(token),
        }
    }
    
    /// Public QR (mint's signature & metadata) - placed on outside of seal
    fn encode_public_qr(&self, token: &PhysicalToken) -> String {
        let public_data = serde_json::json!({
            "token": [
                {
                    "mint": token.mint_url,
                    "proofs": [{
                        "amount": token.amount.to_sat(),
                        "secret": token.proof.secret,
                        "C": token.proof.c,
                    }],
                },
            ],
            "keyset_id": self.get_keyset_id(&token.mint_url),
            "validation_hash": self.compute_validation_hash(token),
        });
        base64::encode(serde_json::to_string(&public_data).unwrap())
    }
    
    /// Private QR (redemption secret) - hidden under tamper-evident seal
    fn encode_secret_qr(&self, token: &PhysicalToken) -> String {
        let secret_data = serde_json::json!({
            "secret": token.secret,
            "derivation_index": token.derivation_index,
            "mint_url": token.mint_url,
        });
        base64::encode(serde_json::to_string(&secret_data).unwrap())
    }
}
```

### 4.2 Physical Note Specification

| Field | Position | Format | Size |
|-------|----------|--------|------|
| Mint URL | Front, visible | Text + QR | Variable |
| Public Token Hash | Front, visible | Hex + QR | 64 chars |
| Amount | Front, visible | Text + Number | 1-10 chars |
| Serial Number | Front, visible | Alphanumeric | 12 chars |
| **Private Redemption Key** | Under seal | QR + Text | 64 chars |
| Validation Hash (full) | Under seal | Hex | 64 chars |

---

## 5. Offline Cryptographic Verification

### 5.1 Verifier Device Architecture

The offline verifier is a low-cost device (ESP32 with e-paper display) that cryptographically validates physical notes without network connectivity.

```rust
// Embedded Rust code for ESP32-C3 verifier
#![no_std]
#![no_main]

use esp_backtrace as _;
use esp_hal::{prelude::*, gpio};
use embedded_graphics::prelude::*;
use qrcode::{QrCode, EcLevel};

/// Offline verifier state
pub struct OfflineVerifier {
    mint_public_keys: HashMap<MintUrl, ProjectivePoint>, // pre-loaded
    spent_hashes: BloomFilter,                           // optional anti-replay
}

impl OfflineVerifier {
    /// Pre-load mint public keys at provisioning time (no internet needed)
    pub fn new(mint_keys: Vec<(MintUrl, ProjectivePoint)>) -> Self {
        let mut keys = HashMap::new();
        for (url, key) in mint_keys {
            keys.insert(url, key);
        }
        Self {
            mint_public_keys: keys,
            spent_hashes: BloomFilter::new(10000, 0.01), // optional
        }
    }
    
    /// Verify a physical note's authenticity completely offline
    pub fn verify_note(&mut self, scanned_data: &str) -> VerificationResult {
        // Parse public token data from outside of seal
        let public_data: PublicTokenData = serde_json_core::from_str(scanned_data)
            .map_err(|_| VerificationError::InvalidFormat)?;
        
        // 1. Check that mint URL is trusted
        let mint_key = self.mint_public_keys.get(&public_data.mint_url)
            .ok_or(VerificationError::UntrustedMint)?;
        
        // 2. Verify mint's signature on the proof
        let proof = &public_data.proofs[0];
        let signature_valid = self.verify_proof_signature(
            proof, mint_key, &public_data.validation_hash
        )?;
        
        // 3. OPTIONAL: Check against local bloom filter of spent tokens
        if self.spent_hashes.contains(&public_data.validation_hash) {
            return VerificationResult::SpentButAuthentic;
        }
        
        // 4. Verify validation hash matches token content
        let computed_hash = self.compute_hash(proof);
        if computed_hash != public_data.validation_hash {
            return VerificationResult::HashMismatch;
        }
        
        VerificationResult::Valid {
            amount: proof.amount,
            mint_url: public_data.mint_url,
            validation_hash: public_data.validation_hash,
        }
    }
    
    /// Verify blind signature without network: check that C == a*B
    fn verify_proof_signature(
        &self,
        proof: &Proof,
        mint_key: &ProjectivePoint,
        validation_hash: &[u8; 32],
    ) -> Result<bool, VerificationError> {
        // Convert hex strings to points
        let point_c = ProjectivePoint::from_bytes(&hex::decode(&proof.c)?)?;
        let point_b = ProjectivePoint::from_bytes(&hex::decode(&proof.secret)?)?;
        
        // Verification: C should equal a*B where a is mint secret
        // With public key A = a*G, we verify the DHKE property
        let left = point_c;
        let right = point_b * self.derive_a_from_key(mint_key)?;
        
        Ok(left == right)
    }
}
```

### 5.2 Tamper Verification (Physical + Cryptographic)

The verifier device checks both cryptographic authenticity and seal integrity:

```rust
/// Combined verification result from verifier device
pub enum VerificationResult {
    /// Note is authentic, seal intact, not previously spent
    Valid { amount: Amount, mint_url: MintUrl, validation_hash: [u8; 32] },
    /// Note is authentic but appears already redeemed (from local cache)
    SpentButAuthentic,
    /// Note is authentic but seal is visibly tampered
    SealBroken,
    /// Cryptographic signature invalid (counterfeit)
    Invalid,
}

impl OfflineVerifier {
    /// Display result on e-paper screen for user
    pub fn display_result(&self, result: &VerificationResult) {
        let mut display = EpaperDisplay::new();
        match result {
            VerificationResult::Valid { amount, .. } => {
                display.draw_text("✅ VALID NOTE", 0, 0);
                display.draw_text(&format!("Amount: {} sats", amount.to_sat()), 0, 20);
                display.draw_text("Seal intact. Accept payment.", 0, 40);
            }
            VerificationResult::SpentButAuthentic => {
                display.draw_text("⚠️ ALREADY SPENT", 0, 0);
                display.draw_text("Note is genuine but redeemed.", 0, 20);
            }
            VerificationResult::SealBroken => {
                display.draw_text("🔴 SEAL TAMPERED", 0, 0);
                display.draw_text("DO NOT ACCEPT", 0, 20);
            }
            VerificationResult::Invalid => {
                display.draw_text("❌ INVALID NOTE", 0, 0);
                display.draw_text("Counterfeit detected", 0, 20);
            }
        }
    }
}
```

### 5.3 Offline Redemption Signing

When a user wants to redeem, they scratch open the seal, scan the private key with the verifier device, and the device signs a redemption request cryptographically (without requiring network):

```rust
/// Redemption request signed by the offline verifier
pub struct SignedRedemptionRequest {
    pub note_hash: [u8; 32],
    pub private_key: String,      // from under seal
    pub verifier_signature: Vec<u8>, // signed with device's private key
    pub timestamp: u64,
    pub mint_url: MintUrl,
}

impl OfflineVerifier {
    /// Generate a signed redemption request using the device's hardware key
    pub fn sign_redemption(
        &self,
        scanned_private_key: &str,
        public_data: &PublicTokenData,
    ) -> Result<SignedRedemptionRequest> {
        let device_key = self.get_hardware_key(); // stored in secure element
        let note_hash = self.compute_full_hash(&public_data, scanned_private_key);
        
        let message = format!("{}{}{}", 
            hex::encode(note_hash),
            scanned_private_key,
            public_data.mint_url.as_str(),
        );
        
        let signature = device_key.sign(message.as_bytes());
        
        Ok(SignedRedemptionRequest {
            note_hash,
            private_key: scanned_private_key.to_string(),
            verifier_signature: signature,
            timestamp: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            mint_url: public_data.mint_url.clone(),
        })
    }
}
```

---

## 6. Redemption Gateway and Mint Payout

### 6.1 Gateway Architecture

The redemption gateway is an online service that accepts signed redemption requests from verifier devices and coordinates payouts across mints.

```rust
/// Redemption gateway service
pub struct RedemptionGateway {
    mints: HashMap<MintUrl, MintClient>,
    verifier_registry: HashMap<VerifierId, VerifierPublicKey>,
    pending_redemptions: Arc<Mutex<HashMap<[u8; 32], RedemptionStatus>>>,
}

impl RedemptionGateway {
    /// Submit a redemption request from offline verifier
    pub async fn submit_redemption(
        &self,
        request: SignedRedemptionRequest,
    ) -> Result<RedemptionId> {
        // 1. Verify device signature
        let verifier_key = self.verifier_registry
            .get(&request.verifier_id)
            .ok_or(Error::UnknownVerifier)?;
        verifier_key.verify(&request)?;
        
        // 2. Check against global spent registry (to prevent double spending)
        if self.is_already_redeemed(&request.note_hash).await? {
            return Err(Error::AlreadyRedeemed);
        }
        
        // 3. Construct token from private key
        let token = self.reconstruct_token(&request).await?;
        
        // 4. Submit to mint for redemption ("melting" in Cashu terms)
        let mint_client = self.mints.get(&request.mint_url)
            .ok_or(Error::UnknownMint)?;
        
        let redemption_result = mint_client.melt(token).await?;
        
        // 5. Mark as redeemed in global state
        self.mark_redeemed(&request.note_hash, redemption_result).await?;
        
        Ok(RedemptionId::new())
    }
}
```

### 6.2 Mint Payout Coordination

When a mint receives a melting request, it:

1. Verifies the token's blind signature (without knowing who holds it)
2. Marks the token as spent in its database
3. Releases the corresponding Bitcoin value (via Lightning payment)

```rust
/// Mint's melt handler (server side)
async fn handle_melt_request(
    proofs: Vec<Proof>,
    payment_request: Option<String>,
) -> Result<MeltResponse> {
    // 1. Verify each proof's signature
    for proof in &proofs {
        let is_valid = verify_proof_signature(proof)?;
        if !is_valid {
            return Err(MeltError::InvalidSignature);
        }
        
        // 2. Check if already spent
        if db.token_spent(&proof.secret).await? {
            return Err(MeltError::AlreadySpent);
        }
    }
    
    // 3. Calculate total amount and fees
    let total_amount: Amount = proofs.iter().map(|p| p.amount).sum();
    let fee = total_amount * FEE_PERCENT;
    let payout_amount = total_amount - fee;
    
    // 4. Mark proofs as spent
    for proof in &proofs {
        db.mark_spent(&proof.secret).await?;
    }
    
    // 5. Send Bitcoin via Lightning
    if let Some(payment_request) = payment_request {
        let payment = lightning_client.send_payment(payment_request, payout_amount).await?;
        Ok(MeltResponse::Success { payment_hash: payment.hash })
    } else {
        Ok(MeltResponse::Success { no_payment: true })
    }
}
```

### 6.3 Atomic Redemption Protocol

To ensure no value is lost if the gateway fails mid-redemption:

```rust
/// Two-phase atomic redemption
pub struct AtomicRedemption {
    state: RedemptionState,
}

impl AtomicRedemption {
    /// Phase 1: Lock and verify
    pub async fn phase1_lock(&mut self, request: SignedRedemptionRequest) -> Result<()> {
        self.lock_token(&request.note_hash).await?;
        self.verify_and_queue(&request).await?;
        Ok(())
    }
    
    /// Phase 2: Commit or rollback (idempotent)
    pub async fn phase2_commit(&mut self) -> Result<RedemptionId> {
        let result = self.process_queued_redemption().await?;
        self.mark_permanent(&result).await?;
        Ok(result.id)
    }
    
    /// Rollback if phase2 fails (e.g., mint unreachable)
    pub async fn rollback(&mut self) -> Result<()> {
        self.unlock_tokens().await?;
        self.clear_queue().await?;
        Ok(())
    }
}
```

---

## 7. Complete Workflow Summary

```
┌──────────┐     ┌─────────────┐     ┌───────────┐     ┌───────────┐
│  USER    │     │   WALLET    │     │   MINT    │     │ VERIFIER  │
└────┬─────┘     └──────┬──────┘     └─────┬─────┘     └─────┬─────┘
     │                  │                  │                 │
     │ 1. Select amount │                  │                 │
     │─────────────────>│                  │                 │
     │                  │ 2. Request quote │                 │
     │                  │─────────────────>│                 │
     │                  │ 3. Lightning     │                 │
     │                  │<────────────────>│                 │
     │                  │ 4. Mint tokens   │                 │
     │                  │<─────────────────│                 │
     │                  │                  │                 │
     │                  │ 5. Encode for    │                 │
     │                  │    physical      │                 │
     │                  │                  │                 │
     │ 6. Print physical│                  │                 │
     │    note          │                  │                 │
     │<─────────────────│                  │                 │
     │                  │                  │                 │
     │ 7. Present note  │                  │ 8. Verify      │
     │    for payment   │                  │    offline     │
     │─────────────────────────────────────────────────────>│
     │                  │                  │ 9. Sign         │
     │                  │                  │    redemption   │
     │ 10. Scratch seal │                  │<────────────────│
     │     reveal key   │                  │                 │
     │                  │                  │                 │
     │ 11. Scan with    │                  │                 │
     │     verifier     │                  │                 │
     │<─────────────────────────────────────────────────────│
     │                  │                  │                 │
     │ 12. Take signed  │                  │                 │
     │     redemption   │                  │                 │
     │     to gateway   │                  │                 │
     │─────────────────>│ 13. Submit       │                 │
     │                  │    to mint       │                 │
     │                  │─────────────────>│                 │
     │                  │ 14. Lightning    │                 │
     │                  │    payout        │                 │
     │                  │<─────────────────│                 │
     │ 15. Receive BTC  │                  │                 │
     │<─────────────────│                  │                 │
```

---

## 8. Security Considerations

| Threat | Mitigation |
|--------|------------|
| Mint key compromise | Federation of mints (Fedimint model); no single key controls all funds |
| Seal tampering | Tamper-evident tape + print-and-cut perforation; double-layered |
| Private key copying | Physical destruction required; secrets stored under destructible material |
| Double spending offline | Detection on redemption; economic incentives against fraud (e.g., deposit requirement) |
| Mint collusion with verifier | Verifier devices have hardware security modules; signed requests cannot be forged |
| Gateway single point of failure | Multiple gateway instances; fallback to direct mint interaction |

---

## 9. Implementation Roadmap

| Phase | Deliverable | Estimated Effort |
|-------|-------------|------------------|
| 1 | Core blind signature implementation (cashu crate) | 2-3 weeks |
| 2 | Multi-mint wallet with distribution policies | 3-4 weeks |
| 3 | Physical token encoding & printing pipeline | 1-2 weeks |
| 4 | ESP32 offline verifier firmware | 4-5 weeks |
| 5 | Redemption gateway & mint integration | 3-4 weeks |
| 6 | End-to-end testing & security audit | 4-6 weeks |

---

## 10. References

1. Cashu Protocol Specification – [NUTs documentation](https://github.com/cashubtc/nuts)
2. Cashu Development Kit (CDK) – [github.com/cashubtc/cdk](https://github.com/cashubtc/cdk)
3. Fedimint Architecture – [fedimint.org](https://fedimint.org)
4. Blind Diffie‑Hellman Key Exchange – [original cypherpunks post](https://cypherpunks.venona.com/date/1996/03/msg01848.html)
5. minicash implementation – [github.com/phyro/minicash](https://github.com/phyro/minicash)