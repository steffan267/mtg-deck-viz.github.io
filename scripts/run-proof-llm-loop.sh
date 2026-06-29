#!/usr/bin/env bash
set -euo pipefail

# Local-first MTG proof review loop.
# - Starts Ollama if nothing is listening on 127.0.0.1:11434.
# - Runs deterministic proof persistence first.
# - Asks local Ollama only for untrusted NEEDS_REVIEW drafts.
# - Exports manual review batches.
# - Never imports, accepts, or promotes ChatGPT/LLM output automatically.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OLLAMA_BIN="${OLLAMA_BIN:-$(command -v ollama || true)}"
if [[ -z "$OLLAMA_BIN" && -x /opt/homebrew/opt/ollama/bin/ollama ]]; then
  OLLAMA_BIN=/opt/homebrew/opt/ollama/bin/ollama
fi
if [[ -z "$OLLAMA_BIN" ]]; then
  echo "Ollama is not installed or not on PATH. Install with: brew install ollama" >&2
  exit 1
fi

export MTG_OLLAMA_BASE_URL="${MTG_OLLAMA_BASE_URL:-http://127.0.0.1:11434}"
export MTG_LLM_PROOF_MODEL="${MTG_LLM_PROOF_MODEL:-qwen3:14b}"
export MTG_LLM_GENERATOR_MODEL="${MTG_LLM_GENERATOR_MODEL:-$MTG_LLM_PROOF_MODEL}"
export MTG_LLM_CRITIC_MODEL="${MTG_LLM_CRITIC_MODEL:-$MTG_LLM_PROOF_MODEL}"
export OLLAMA_FLASH_ATTENTION="${OLLAMA_FLASH_ATTENTION:-1}"
export OLLAMA_KV_CACHE_TYPE="${OLLAMA_KV_CACHE_TYPE:-q8_0}"

DRAFT_LIMIT="${MTG_PROOF_DRAFT_LIMIT:-1}"
EXPORT_LIMIT="${MTG_PROOF_EXPORT_LIMIT:-20}"
SLEEP_SECONDS="${MTG_PROOF_LOOP_SLEEP_SECONDS:-300}"
RUN_SAMPLE="${MTG_PROOF_RUN_SAMPLE:-1}"

start_ollama_if_needed() {
  if curl -fsS "$MTG_OLLAMA_BASE_URL/api/tags" >/dev/null 2>&1; then
    echo "[proof-loop] Ollama already running at $MTG_OLLAMA_BASE_URL"
    return
  fi

  echo "[proof-loop] Starting Ollama at $MTG_OLLAMA_BASE_URL"
  mkdir -p analysis/proof-review
  "$OLLAMA_BIN" serve > analysis/proof-review/ollama.log 2>&1 &
  echo $! > analysis/proof-review/ollama.pid

  for _ in $(seq 1 60); do
    if curl -fsS "$MTG_OLLAMA_BASE_URL/api/tags" >/dev/null 2>&1; then
      echo "[proof-loop] Ollama is ready"
      return
    fi
    sleep 1
  done

  echo "[proof-loop] Ollama did not become ready. See analysis/proof-review/ollama.log" >&2
  exit 1
}

ensure_model() {
  if "$OLLAMA_BIN" list | awk '{print $1}' | grep -Fxq "$MTG_LLM_PROOF_MODEL"; then
    echo "[proof-loop] Model present: $MTG_LLM_PROOF_MODEL"
  else
    echo "[proof-loop] Pulling model: $MTG_LLM_PROOF_MODEL"
    "$OLLAMA_BIN" pull "$MTG_LLM_PROOF_MODEL"
  fi
}

run_once() {
  local stamp
  stamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "[proof-loop] === iteration $stamp ==="

  if [[ "$RUN_SAMPLE" == "1" ]]; then
    node ./bin/mtg-proofs.js sample
  fi

  node ./bin/mtg-proofs.js run
  node ./bin/mtg-proofs.js draft-proofs --limit "$DRAFT_LIMIT"
  node ./bin/mtg-proofs.js export-review --limit "$EXPORT_LIMIT"

  echo "[proof-loop] iteration complete; review exports are under analysis/proof-review/"
}

start_ollama_if_needed
ensure_model

while true; do
  run_once || echo "[proof-loop] iteration failed; continuing after sleep" >&2
  echo "[proof-loop] sleeping ${SLEEP_SECONDS}s; Ctrl-C to stop"
  sleep "$SLEEP_SECONDS"
done
