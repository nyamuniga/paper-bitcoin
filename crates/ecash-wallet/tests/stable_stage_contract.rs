use ecash_wallet::stable::{StableOperation, StableStage};
use serde::Deserialize;

#[derive(Deserialize)]
struct StageContract {
    stage: StableStage,
    active: bool,
    next: Vec<StableStage>,
}

fn contract() -> Vec<StageContract> {
    serde_json::from_str(include_str!("fixtures/stable-stages.json")).unwrap()
}

// An added enum variant must be considered here and in the shared fixture.
fn stage_index(stage: StableStage) -> usize {
    match stage {
        StableStage::Quoted => 0,
        StableStage::Funding => 1,
        StableStage::Funded => 2,
        StableStage::Converting => 3,
        StableStage::Settling => 4,
        StableStage::ReturnQuoted => 5,
        StableStage::Returning => 6,
        StableStage::Complete => 7,
        StableStage::Cancelled => 8,
        StableStage::Refunded => 9,
    }
}

fn operation(stage: StableStage) -> StableOperation {
    let mut operation: StableOperation =
        serde_json::from_str(include_str!("fixtures/stable-operation.json")).unwrap();
    operation.stage = stage;
    operation
}

#[test]
fn shared_stage_contract_covers_every_variant_once_and_preserves_active_states() {
    let mut covered = [false; 10];
    for row in contract() {
        let index = stage_index(row.stage);
        assert!(!covered[index], "duplicate stage: {:?}", row.stage);
        covered[index] = true;
        assert_eq!(operation(row.stage).active(), row.active, "{:?}", row.stage);
        for (index, next) in row.next.iter().enumerate() {
            assert!(
                !row.next[..index].contains(next),
                "duplicate destination: {next:?}"
            );
        }
    }
    assert!(covered.into_iter().all(|stage| stage), "missing stage");
}

#[test]
fn shared_transition_contract_checks_every_allowed_and_forbidden_stage_pair() {
    let stages = contract();
    for from in &stages {
        let operation = operation(from.stage);
        for to in &stages {
            assert_eq!(
                operation.can_transition(to.stage),
                from.next.contains(&to.stage),
                "{:?} -> {:?}",
                from.stage,
                to.stage,
            );
        }
    }
}
