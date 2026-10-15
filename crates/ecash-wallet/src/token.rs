use anyhow::{anyhow, Result};
use ecash_core::types::Proof;
use base64::Engine;
use ciborium::Value;
use std::collections::HashMap;

/// Encode a token to cashuB (NUT-00 V4 CBOR)
pub fn encode_token_v4(mint_url: &str, proofs: &[Proof], unit: Option<&str>) -> Result<String> {
    let mut proofs_by_id: HashMap<String, Vec<&Proof>> = HashMap::new();
    for p in proofs {
        proofs_by_id.entry(p.id.clone()).or_default().push(p);
    }

    let mut token_entries = Vec::new();
    for (id, id_proofs) in proofs_by_id {
        let proofs_cbor = id_proofs.into_iter().map(|p| {
            let mut map = vec![
                (Value::Text("a".to_string()), Value::Integer(p.amount.into())),
                (Value::Text("s".to_string()), Value::Text(p.secret.clone())),
                (Value::Text("c".to_string()), Value::Bytes(hex::decode(&p.c).unwrap_or_default())),
            ];
            // Do NOT include DLEQ unless blinding factor r is present and valid.
            // Incomplete DLEQ (e, s without r) causes external wallets (Cashu.me, Minibits)
            // to fail verification with "Token contains a proof with an invalid DLEQ".
            if let Some(ref witness) = p.witness {
                let witness_str = if let Some(s) = witness.as_str() {
                    s.to_string()
                } else {
                    witness.to_string()
                };
                map.push((Value::Text("w".to_string()), Value::Text(witness_str)));
            }
            Value::Map(map)
        }).collect::<Vec<_>>();

        // Keyset ID as raw bytes. For NUT-00 v4, keyset IDs longer than 16 hex characters
        // (such as v2 keyset IDs starting with 01) MUST be truncated to 16 hex characters (8 bytes).
        let truncated_id = if id.len() > 16 { &id[..16] } else { &id };
        let id_bytes = hex::decode(truncated_id).unwrap_or_else(|_| truncated_id.as_bytes().to_vec());
        token_entries.push(Value::Map(vec![
            (Value::Text("i".to_string()), Value::Bytes(id_bytes)),
            (Value::Text("p".to_string()), Value::Array(proofs_cbor)),
        ]));
    }

    let unit_str = unit.unwrap_or("sat");
    let token_cbor = Value::Map(vec![
        (Value::Text("m".to_string()), Value::Text(mint_url.to_string())),
        (Value::Text("u".to_string()), Value::Text(unit_str.to_string())),
        (Value::Text("t".to_string()), Value::Array(token_entries)),
    ]);

    let mut cbor_bytes = Vec::new();
    ciborium::into_writer(&token_cbor, &mut cbor_bytes)?;
    Ok(format!(
        "cashuB{}",
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&cbor_bytes)
    ))
}

/// Encode a token to cashuA (NUT-00 V3 Base64 JSON)
pub fn encode_token_v3(mint_url: &str, proofs: &[Proof], unit: Option<&str>) -> Result<String> {
    let proofs_json = proofs.iter().map(|p| {
        let mut obj = serde_json::json!({
            "amount": p.amount,
            "id": p.id,
            "secret": p.secret,
            "C": p.c
        });
        // Do NOT include DLEQ without r to ensure 100% compatibility across all Cashu wallets
        if let Some(ref witness) = p.witness {
            obj["witness"] = witness.clone();
        }
        obj
    }).collect::<Vec<_>>();

    let unit_str = unit.unwrap_or("sat");
    let token_obj = serde_json::json!({
        "token": [
            {
                "mint": mint_url,
                "proofs": proofs_json
            }
        ],
        "unit": unit_str
    });

    let json_bytes = serde_json::to_vec(&token_obj)?;
    Ok(format!(
        "cashuA{}",
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&json_bytes)
    ))
}

/// Decode a Cashu token string (either cashuA JSON or cashuB CBOR)
/// Returns (mint_url, proofs, total_amount).
pub fn decode_token_string(token_string: &str) -> Result<(String, Vec<Proof>, u64)> {
    let mut input_proofs: Vec<Proof> = Vec::new();
    let mut total_amount: u64 = 0;
    let mint_url: String;

    if token_string.starts_with("cashuA") {
        let token_body = token_string.strip_prefix("cashuA").unwrap();
        let json_bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(token_body)
            .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(token_body))
            .or_else(|_| base64::engine::general_purpose::STANDARD.decode(token_body))
            .map_err(|e| anyhow!("Base64 decode error: {}", e))?;

        let token_json: serde_json::Value = serde_json::from_slice(&json_bytes)
            .map_err(|e| anyhow!("JSON parse error: {}", e))?;

        let token_array = token_json
            .get("token")
            .and_then(|t| t.as_array())
            .ok_or_else(|| anyhow!("Invalid token format: missing 'token' array"))?;

        if token_array.is_empty() {
            return Err(anyhow!("Token contains no entries"));
        }

        let entry = &token_array[0];
        mint_url = entry
            .get("mint")
            .and_then(|m| m.as_str())
            .ok_or_else(|| anyhow!("Token missing mint URL"))?
            .to_string();

        let proofs_json = entry
            .get("proofs")
            .and_then(|p| p.as_array())
            .ok_or_else(|| anyhow!("Token missing proofs"))?;

        for pj in proofs_json {
            let amount = pj
                .get("amount")
                .and_then(|a| a.as_u64())
                .ok_or_else(|| anyhow!("Proof missing amount"))?;
            let id = pj
                .get("id")
                .and_then(|i| i.as_str())
                .ok_or_else(|| anyhow!("Proof missing id"))?
                .to_string();
            let secret = pj
                .get("secret")
                .and_then(|s| s.as_str())
                .ok_or_else(|| anyhow!("Proof missing secret"))?
                .to_string();
            let c = pj
                .get("C")
                .and_then(|c| c.as_str())
                .ok_or_else(|| anyhow!("Proof missing C"))?
                .to_string();

            let witness = pj.get("witness").cloned();

            input_proofs.push(Proof {
                amount,
                id,
                secret,
                c,
                c_prime: None,
                b_prime: None,
                witness,
                dleq: None,
                derivation_index: 0,
            });
            total_amount += amount;
        }
    } else if token_string.starts_with("cashuB") {
        let token_body = token_string.strip_prefix("cashuB").unwrap();
        let cbor_bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(token_body)
            .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(token_body))
            .or_else(|_| base64::engine::general_purpose::STANDARD.decode(token_body))
            .map_err(|e| anyhow!("Base64 decode error: {}", e))?;

        let cbor_val: ciborium::Value = ciborium::from_reader(&cbor_bytes[..])
            .map_err(|e| anyhow!("CBOR parse error: {}", e))?;

        let cbor_map = cbor_val
            .as_map()
            .ok_or_else(|| anyhow!("CBOR token is not a map"))?;

        fn get_val<'a>(
            map: &'a Vec<(ciborium::Value, ciborium::Value)>,
            key: &str,
        ) -> Option<&'a ciborium::Value> {
            map.iter()
                .find(|(k, _)| k.as_text() == Some(key))
                .map(|(_, v)| v)
        }

        let bytes_to_hex =
            |v: &ciborium::Value| -> Option<String> { v.as_bytes().map(|b| hex::encode(b)) };

        mint_url = get_val(cbor_map, "m")
            .and_then(|v| v.as_text())
            .ok_or_else(|| anyhow!("Token missing mint URL"))?
            .to_string();

        let tokens = get_val(cbor_map, "t")
            .and_then(|v| v.as_array())
            .ok_or_else(|| anyhow!("Token missing 't' array"))?;

        if tokens.is_empty() {
            return Err(anyhow!("Token contains no entries"));
        }

        for t in tokens {
            let t_map = t
                .as_map()
                .ok_or_else(|| anyhow!("Token entry is not a map"))?;
            let keyset_id = get_val(t_map, "i")
                .and_then(bytes_to_hex)
                .ok_or_else(|| anyhow!("Token missing keyset id"))?;

            let proofs = get_val(t_map, "p")
                .and_then(|v| v.as_array())
                .ok_or_else(|| anyhow!("Token missing proofs"))?;

            for p in proofs {
                let p_map = p
                    .as_map()
                    .ok_or_else(|| anyhow!("Proof is not a map"))?;

                let amount_int = get_val(p_map, "a")
                    .and_then(|v| v.as_integer())
                    .ok_or_else(|| anyhow!("Proof missing amount"))?;
                let amount: u64 = amount_int.try_into().unwrap_or(0);

                let secret = get_val(p_map, "s")
                    .and_then(|v| bytes_to_hex(v).or_else(|| v.as_text().map(|s| s.to_string())))
                    .ok_or_else(|| anyhow!("Proof missing secret"))?;

                let c = get_val(p_map, "c")
                    .and_then(bytes_to_hex)
                    .ok_or_else(|| anyhow!("Proof missing C"))?;

                let witness = get_val(p_map, "w").and_then(|w| {
                    if let Some(s) = w.as_text() {
                        Some(serde_json::Value::String(s.to_string()))
                    } else {
                        None
                    }
                });

                input_proofs.push(Proof {
                    amount,
                    id: keyset_id.clone(),
                    secret,
                    c,
                    c_prime: None,
                    b_prime: None,
                    witness,
                    dleq: None,
                    derivation_index: 0,
                });
                total_amount += amount;
            }
        }
    } else {
        return Err(anyhow!("Invalid token: must start with cashuA or cashuB"));
    }

    let mint_url = crate::state::normalize_mint_url(&mint_url);

    if total_amount == 0 {
        return Err(anyhow!("Token has zero value"));
    }

    Ok((mint_url, input_proofs, total_amount))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode_decode_v3_v4() {
        let proofs = vec![Proof {
            amount: 21,
            id: "009a1f29325bba02".to_string(),
            secret: "test_secret_12345".to_string(),
            c: "02e70e17633c77d90d796720f8629ca4a59bb0f214227f4c207d5d0458df8a7f1a".to_string(),
            c_prime: None,
            b_prime: None,
            witness: None,
            dleq: None,
            derivation_index: 0,
        }];

        let v3 = encode_token_v3("https://mint.example.com", &proofs, Some("sat")).unwrap();
        println!("V3: {}", v3);
        let (mint3, _p3, amt3) = decode_token_string(&v3).unwrap();
        assert_eq!(mint3, "https://mint.example.com");
        assert_eq!(amt3, 21);

        let v4 = encode_token_v4("https://mint.example.com", &proofs, Some("sat")).unwrap();
        println!("V4: {}", v4);
        let (mint4, _p4, amt4) = decode_token_string(&v4).unwrap();
        assert_eq!(mint4, "https://mint.example.com");
        assert_eq!(amt4, 21);
    }

    #[test]
    fn test_bip340_schnorr_verification() {
        use k256::schnorr::{SigningKey, VerifyingKey};
        use k256::schnorr::signature::{Signer, Verifier};
        use k256::sha2::{Sha256, Digest};

        let key_bytes = [7u8; 32];
        let signing_key = SigningKey::from_bytes(&key_bytes).unwrap();
        let verifying_key: VerifyingKey = *signing_key.verifying_key();

        let secret = "[\"P2PK\",{\"data\":\"02...\",\"nonce\":\"...\",\"tags\":[]}]";
        let msg_hash = Sha256::digest(secret.as_bytes());

        // Case 1: Sign the hash
        let sig_of_hash: k256::schnorr::Signature = signing_key.sign(&msg_hash);
        assert!(verifying_key.verify(&msg_hash, &sig_of_hash).is_ok());
        assert!(verifying_key.verify(secret.as_bytes(), &sig_of_hash).is_err());

        // Case 2: Sign the raw secret
        let sig_of_raw: k256::schnorr::Signature = signing_key.sign(secret.as_bytes());
        assert!(verifying_key.verify(secret.as_bytes(), &sig_of_raw).is_ok());
        assert!(verifying_key.verify(&msg_hash, &sig_of_raw).is_err());
    }
}

