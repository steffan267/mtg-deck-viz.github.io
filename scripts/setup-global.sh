#!/usr/bin/env bash
set -euo pipefail

# Link this local repository's CLIs globally for the current Node/npm install.
# This does not publish anything and does not call cloud APIs.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node >=20.19, then rerun this script." >&2
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
NODE_MINOR="$(node -p "process.versions.node.split('.')[1]")"
if (( NODE_MAJOR < 20 || (NODE_MAJOR == 20 && NODE_MINOR < 19) )); then
  echo "Node >=20.19 is required; found $(node -v)." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but was not found on PATH." >&2
  exit 1
fi

echo "[setup-global] Installing npm dependencies"
npm install

echo "[setup-global] Linking local CLIs globally"
npm link

echo "[setup-global] Available commands:"
echo "  mtg-commander-search"
echo "  mtg-deck-context"
echo "  mtg-proofs"
echo "  mtg-proof-loop"

echo "[setup-global] Quick checks:"
command -v mtg-proofs || true
command -v mtg-proof-loop || true

echo "[setup-global] Done. Optional local LLM setup: brew install ollama && ollama pull qwen3:14b"
