use ecash_core::types::{Dleq, Proof};
use ecash_wallet::proof_selection::{
    nearest_offline_amounts, select_exact_proofs, split_for_pocket_change, NearestOfflineAmounts,
};
use std::collections::HashSet;

fn proofs(amounts: &[u64]) -> Vec<Proof> {
    amounts
        .iter()
        .enumerate()
        .map(|(index, &amount)| Proof {
            amount,
            id: "synthetic-keyset".into(),
            secret: format!("synthetic-proof-{index}"),
            c: "synthetic-signature".into(),
            c_prime: Some("synthetic-blinded-signature".into()),
            b_prime: Some("synthetic-blinded-message".into()),
            witness: Some(serde_json::json!({"signatures": ["synthetic-witness"]})),
            dleq: Some(Dleq {
                e: "synthetic-e".into(),
                s: "synthetic-s".into(),
            }),
            derivation_index: index as u64,
        })
        .collect()
}

#[test]
fn selects_exact_amount_largest_first_without_changing_proofs() {
    let input = proofs(&[1, 4, 2, 4, 8]);
    let before = serde_json::to_value(&input).unwrap();

    let selected = select_exact_proofs(&input, 7).unwrap();

    // The first equal-valued proof wins; all credential metadata is preserved.
    let expected = vec![input[1].clone(), input[2].clone(), input[0].clone()];
    assert_eq!(
        serde_json::to_value(selected).unwrap(),
        serde_json::to_value(expected).unwrap()
    );
    assert_eq!(serde_json::to_value(&input).unwrap(), before);
}

#[test]
fn returns_none_for_insufficient_funds_or_missing_denominations() {
    assert!(select_exact_proofs(&proofs(&[1, 2]), 4).is_none());
    assert!(select_exact_proofs(&proofs(&[4, 4]), 3).is_none());
    assert!(select_exact_proofs(&[], 1).is_none());
}

#[test]
fn retains_greedy_fallback_for_non_cashu_denominations() {
    // General subset-sum search would find 3 + 3; the existing send policy swaps.
    assert!(select_exact_proofs(&proofs(&[4, 3, 3]), 6).is_none());
}

#[test]
fn preserves_zero_target_and_zero_proof_behavior() {
    assert!(select_exact_proofs(&[], 0).is_none());
    assert!(select_exact_proofs(&proofs(&[1, 0]), 0).unwrap().is_empty());
    let zeros = proofs(&[0, 0]);
    assert_eq!(
        serde_json::to_value(select_exact_proofs(&zeros, 0).unwrap()).unwrap(),
        serde_json::to_value(&zeros[..1]).unwrap()
    );
    assert!(select_exact_proofs(&zeros, 1).is_none());
}

#[test]
fn handles_every_u64_cashu_denomination_and_its_neighbors() {
    for bit in 0..64 {
        let amount = 1u64 << bit;
        let input = proofs(&[amount]);
        assert_eq!(
            select_exact_proofs(&input, amount).unwrap()[0].amount,
            amount
        );
        if amount > 1 {
            assert!(select_exact_proofs(&input, amount - 1).is_none());
        }
        assert!(select_exact_proofs(&input, amount + 1).is_none());
    }
}

#[test]
fn skips_oversized_proofs_without_overflowing() {
    let largest = 1u64 << 63;
    assert!(select_exact_proofs(&proofs(&[largest, largest]), u64::MAX).is_none());

    let mut amounts = vec![largest, largest];
    amounts.extend((0..63).map(|bit| 1u64 << bit));
    let selected = select_exact_proofs(&proofs(&amounts), u64::MAX).unwrap();
    assert_eq!(selected.len(), 64);
    assert_eq!(
        selected.iter().map(|proof| proof.amount).sum::<u64>(),
        u64::MAX
    );
    assert_eq!(selected[0].secret, "synthetic-proof-0");
}

#[test]
fn matches_independent_subset_sum_oracle_for_cashu_inventories() {
    // All 81 inventories with 0..=2 copies of denominations 1, 2, 4 and 8.
    for inventory in 0..81 {
        let mut counts = inventory;
        let mut amounts = Vec::new();
        for amount in [1, 2, 4, 8] {
            amounts.extend(std::iter::repeat(amount).take(counts % 3));
            counts /= 3;
        }
        let input = proofs(&amounts);
        let mut possible = HashSet::from([0]);
        for &amount in &amounts {
            let added: Vec<_> = possible.iter().map(|sum| sum + amount).collect();
            possible.extend(added);
        }
        for target in 1..=amounts.iter().sum::<u64>() + 1 {
            let selected = select_exact_proofs(&input, target);
            assert_eq!(
                selected.is_some(),
                possible.contains(&target),
                "inventory {amounts:?}, target {target}"
            );
            if let Some(selected) = selected {
                assert_eq!(
                    selected.iter().map(|proof| proof.amount).sum::<u64>(),
                    target
                );
                let identities: HashSet<_> = selected.iter().map(|proof| &proof.secret).collect();
                assert_eq!(identities.len(), selected.len());
                for proof in selected {
                    assert!(input.iter().any(|original| {
                        serde_json::to_value(original).unwrap()
                            == serde_json::to_value(&proof).unwrap()
                    }));
                }
            }
        }
    }
}

#[test]
fn nearest_offline_amounts_matches_subset_sum_oracle_for_cashu_inventories() {
    for inventory in 0..81 {
        let mut counts = inventory;
        let mut amounts = Vec::new();
        for amount in [1, 2, 4, 8] {
            amounts.extend(std::iter::repeat(amount).take(counts % 3));
            counts /= 3;
        }
        let input = proofs(&amounts);
        let mut possible = HashSet::from([0u64]);
        for &amount in &amounts {
            let added: Vec<_> = possible.iter().map(|sum| sum + amount).collect();
            possible.extend(added);
        }
        let total = amounts.iter().sum::<u64>();
        for target in 1..=total + 2 {
            let nearest = nearest_offline_amounts(&input, target);
            let expected_lower = possible
                .iter()
                .copied()
                .filter(|&sum| sum > 0 && sum < target)
                .max();
            let expected_higher = possible.iter().copied().filter(|&sum| sum > target).min();
            assert_eq!(
                nearest,
                NearestOfflineAmounts {
                    lower: expected_lower,
                    higher: expected_higher,
                },
                "inventory {amounts:?}, target {target}"
            );
            if let Some(lower) = nearest.lower {
                assert!(select_exact_proofs(&input, lower).is_some());
            }
            if let Some(higher) = nearest.higher {
                assert!(select_exact_proofs(&input, higher).is_some());
            }
        }
    }
}

#[test]
fn split_for_pocket_change_tops_up_small_denominations_and_preserves_total() {
    let empty_split = split_for_pocket_change(100, &[]);
    assert_eq!(empty_split.iter().sum::<u64>(), 100);
    assert!(empty_split.iter().all(|&d| d.is_power_of_two()));
    // Should include small change (1, 2, 4, 8, 16) so common offline amounts are exact-matchable.
    let funded = proofs(&empty_split);
    for amount in [1, 2, 3, 5, 10, 15, 16, 20, 25] {
        assert!(
            select_exact_proofs(&funded, amount).is_some(),
            "expected {amount} sats to be offline-sendable from {empty_split:?}"
        );
    }

    // Once pocket change is already stocked (2x of 1..=64), no extra small splits are added.
    let stocked_amounts: Vec<u64> = [1, 2, 4, 8, 16, 32, 64]
        .into_iter()
        .flat_map(|d| [d, d])
        .collect();
    let stocked = proofs(&stocked_amounts);
    let minimal = split_for_pocket_change(100, &stocked);
    assert_eq!(minimal, vec![4, 32, 64]);
    assert!(split_for_pocket_change(0, &stocked).is_empty());
}
