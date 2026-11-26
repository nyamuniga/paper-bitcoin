//! Pure selection of existing proofs, without mint requests or wallet mutation.

use ecash_core::types::{split_into_powers_of_2, Proof};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Nearest offline-sendable amounts around an unavailable target amount.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct NearestOfflineAmounts {
    pub lower: Option<u64>,
    pub higher: Option<u64>,
}

/// Power-of-2 denominations kept stocked as offline pocket change when online.
const POCKET_CHANGE_DENOMS: [u64; 7] = [1, 2, 4, 8, 16, 32, 64];
const POCKET_CHANGE_TARGET_COUNT: usize = 2;

/// Select an exact amount using the existing largest-first greedy policy.
///
/// Equal denominations retain their input order. `None` tells the caller to use
/// its swap path; this is not a general subset-sum search for arbitrary amounts.
/// Proof credentials are copied unchanged and the input is never reordered.
///
/// For compatibility, an empty input returns `None` even for a zero target.
/// With a zero target, a nonempty input returns after examining its first sorted
/// proof, selecting it only if its amount is zero.
pub fn select_exact_proofs(proofs: &[Proof], target_amount: u64) -> Option<Vec<Proof>> {
    let mut sorted = proofs.to_vec();
    sorted.sort_by_key(|proof| std::cmp::Reverse(proof.amount));

    let mut selected = Vec::new();
    let mut remaining = target_amount;
    for proof in sorted {
        if proof.amount <= remaining {
            remaining -= proof.amount;
            selected.push(proof);
        }
        if remaining == 0 {
            return Some(selected);
        }
    }
    None
}

fn max_greedy_sum_at_most(proofs: &[Proof], cap: u64) -> u64 {
    if cap == 0 || proofs.is_empty() {
        return 0;
    }
    let mut amounts: Vec<u64> = proofs.iter().map(|proof| proof.amount).collect();
    amounts.sort_unstable_by(|a, b| b.cmp(a));
    let mut sum = 0u64;
    for amount in amounts {
        if amount > 0 && amount <= cap - sum {
            sum += amount;
            if sum == cap {
                break;
            }
        }
    }
    sum
}

/// Compute the nearest lower and higher amounts sendable offline via `select_exact_proofs`.
///
/// Every returned suggestion is verified against `select_exact_proofs` so tapping it
/// succeeds offline without needing a mint swap.
pub fn nearest_offline_amounts(proofs: &[Proof], target_amount: u64) -> NearestOfflineAmounts {
    if proofs.is_empty() {
        return NearestOfflineAmounts {
            lower: None,
            higher: None,
        };
    }

    let lower = if target_amount > 1 {
        let candidate = max_greedy_sum_at_most(proofs, target_amount - 1);
        (candidate > 0 && select_exact_proofs(proofs, candidate).is_some()).then_some(candidate)
    } else {
        None
    };

    let total = proofs
        .iter()
        .fold(0u64, |acc, proof| acc.saturating_add(proof.amount));
    let higher = if total > target_amount {
        let complement_cap = total - target_amount - 1;
        let complement = max_greedy_sum_at_most(proofs, complement_cap);
        let candidate = total - complement;
        (candidate > target_amount && select_exact_proofs(proofs, candidate).is_some())
            .then_some(candidate)
    } else {
        None
    };

    NearestOfflineAmounts { lower, higher }
}

/// Split an online wallet-bound amount into power-of-2 outputs while topping up
/// a small pocket-change buffer (`2x` of `1..=64` sats) based on `existing_proofs`.
///
/// Always returns power-of-2 denominations summing to `amount`.
pub fn split_for_pocket_change(amount: u64, existing_proofs: &[Proof]) -> Vec<u64> {
    if amount == 0 {
        return Vec::new();
    }

    let mut counts: HashMap<u64, usize> = HashMap::new();
    for proof in existing_proofs {
        if POCKET_CHANGE_DENOMS.contains(&proof.amount) {
            *counts.entry(proof.amount).or_insert(0) += 1;
        }
    }

    let mut remaining = amount;
    let mut outputs = Vec::new();

    for denom in POCKET_CHANGE_DENOMS {
        let existing = counts.get(&denom).copied().unwrap_or(0);
        let missing = POCKET_CHANGE_TARGET_COUNT.saturating_sub(existing);
        for _ in 0..missing {
            if remaining < denom {
                break;
            }
            outputs.push(denom);
            remaining -= denom;
        }
    }

    if remaining > 0 {
        outputs.extend(split_into_powers_of_2(remaining));
    }
    outputs.sort_unstable();
    outputs
}
