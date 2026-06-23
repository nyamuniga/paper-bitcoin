# Contributing to Physical Ecash

Thank you for your interest in contributing to Physical Ecash! We welcome bug reports, feature requests, and pull requests.

## Development Setup

The project consists of a Rust backend/CLI and a Tauri frontend (`cashu-app`).

### Prerequisites
- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) (v18+)

### Rust Workspace (CLI, Core, Verifier, Encoder)
```bash
# Build the workspace
cargo build

# Run all tests
cargo test
```

### Tauri Application (cashu-app)
```bash
cd cashu-app

# Install dependencies
npm install

# Run frontend in development mode
npm run dev

# Run Tauri app
npm run tauri dev
```

## Submitting Pull Requests

1. Fork the repository and create your branch from `main`.
2. Make sure your code passes all tests (`cargo test`).
3. If you added code that should be tested, add tests.
4. Issue that pull request!

Please note that this is an early prototype and all cryptographic changes require careful review.
