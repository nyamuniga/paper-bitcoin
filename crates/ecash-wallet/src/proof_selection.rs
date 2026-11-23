//! Pure selection of existing proofs, without mint requests or wallet mutation.

use ecash_core::types::Proof;

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
