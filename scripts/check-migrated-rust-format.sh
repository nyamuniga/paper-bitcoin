#!/bin/sh
set -eu

# Enforce rustfmt on migrated Rust modules and tests without whole-repo reformatting.
exec rustfmt --edition 2021 --check \
  crates/ecash-wallet/src/proof_selection.rs \
  crates/ecash-wallet/src/outgoing.rs \
  crates/ecash-wallet/src/payment_quote.rs \
  crates/ecash-wallet/src/send_error.rs \
  crates/ecash-wallet/src/send.rs \
  crates/ecash-wallet/src/receive_input.rs \
  crates/ecash-wallet/src/receive.rs \
  crates/ecash-wallet/src/storage.rs \
  crates/ecash-wallet/tests/proof_selection.rs \
  crates/ecash-wallet/tests/outgoing_tokens.rs \
  crates/ecash-wallet/tests/pending_send.rs \
  crates/ecash-wallet/tests/send_operation.rs \
  crates/ecash-wallet/tests/receive_input.rs \
  crates/ecash-wallet/tests/receive_operation.rs \
  crates/ecash-wallet/tests/wallet_storage.rs \
  crates/ecash-wallet/tests/proof_normalization.rs
