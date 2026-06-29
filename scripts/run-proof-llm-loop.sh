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
RUN_SAMPLE="${MTG_PROOF_RUN_SAMPLE:-auto}"
SUCCESS_SLEEP_SECONDS="${MTG_PROOF_LOOP_SUCCESS_SLEEP_SECONDS:-0.05}"
ERROR_LOG="analysis/proof-review/proof-loop-errors.log"

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

print_iteration_status() {
  local iteration="$1"
  local outcome="$2"
  local duration_seconds="$3"

  PROOF_LOOP_ITERATION="$iteration" \
  PROOF_LOOP_OUTCOME="$outcome" \
  PROOF_LOOP_DURATION_SECONDS="$duration_seconds" \
  PROOF_LOOP_SUCCESS_SLEEP_SECONDS="$SUCCESS_SLEEP_SECONDS" \
  node <<'NODE'
const fs = require('fs');
const path = require('path');

const storeDir = path.resolve('analysis/proof-review');

function readJsonl(file) {
  const target = path.join(storeDir, file);
  if (!fs.existsSync(target)) return [];
  return fs.readFileSync(target, 'utf8')
    .split(/\n/)
    .filter(line => line.trim())
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function latestById(rows, field) {
  const latest = new Map();
  for (const row of rows) {
    if (row && row[field]) latest.set(row[field], row);
  }
  return [...latest.values()];
}

function countBy(rows, field) {
  return rows.reduce((counts, row) => {
    const key = row && row[field] ? row[field] : 'UNKNOWN';
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function latestCommandRun(command) {
  return [...readJsonl('engine-runs.jsonl')].reverse().find(row => row.command === command);
}

function latestExportSummary() {
  if (!fs.existsSync(storeDir)) return 'exports=none';
  const streamFile = path.join(storeDir, 'review-batches.jsonl');
  if (!fs.existsSync(streamFile)) return 'exports=none';
  const rows = readJsonl('review-batches.jsonl');
  const batches = new Map();
  for (const row of rows) {
    if (!row.batch_id) continue;
    if (!batches.has(row.batch_id)) batches.set(row.batch_id, 0);
    batches.set(row.batch_id, batches.get(row.batch_id) + 1);
  }
  const latest = [...batches.entries()].at(-1);
  if (!latest) return 'exports=none';
  return `latest_export=${latest[0]} in review-batches.jsonl (${latest[1]} items)`;
}

const latestRun = latestCommandRun('run');
const latestDraftRun = latestCommandRun('draft-proofs');
const proofs = latestById(readJsonl('proof-attempts.jsonl'), 'proof_id');
const drafts = readJsonl('llm-drafts.jsonl');
const proofStatuses = countBy(proofs, 'status');
const draftStatuses = countBy(drafts, 'status');

const runSummary = latestRun && latestRun.summary
  ? `run cards=${latestRun.summary.cards ?? '?'} edges=${latestRun.summary.graph_edges ?? '?'} packages=${latestRun.summary.proof_packages ?? '?'} needs_review=${latestRun.summary.needs_review ?? '?'}`
  : 'run unavailable';
const proofSummary = Object.entries(proofStatuses)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([status, count]) => `${status.toLowerCase()}=${count}`)
  .join(' ') || 'proofs=none';
const draftSummary = latestDraftRun && latestDraftRun.summary
  ? `drafts last requested=${latestDraftRun.summary.requested ?? '?'} generated=${latestDraftRun.summary.generated ?? '?'} rejected=${latestDraftRun.summary.rejected ?? '?'}`
  : `drafts total=${drafts.length}`;
const draftStatusSummary = Object.entries(draftStatuses)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([status, count]) => `${status.toLowerCase()}=${count}`)
  .join(' ');

console.log(`[proof-loop] status iteration=${process.env.PROOF_LOOP_ITERATION} outcome=${process.env.PROOF_LOOP_OUTCOME} duration=${process.env.PROOF_LOOP_DURATION_SECONDS}s next_sleep=${process.env.PROOF_LOOP_SUCCESS_SLEEP_SECONDS}s`);
console.log(`[proof-loop] overview ${runSummary}; proofs ${proofSummary}`);
console.log(`[proof-loop] overview ${draftSummary}${draftStatusSummary ? ` (${draftStatusSummary})` : ''}; ${latestExportSummary()}`);
NODE
}

run_once() {
  local stamp
  stamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "[proof-loop] === iteration $stamp ==="

  if should_run_sample; then
    node ./bin/mtg-proofs.js sample
  fi

  node ./bin/mtg-proofs.js run
  node ./bin/mtg-proofs.js draft-proofs --limit "$DRAFT_LIMIT"
  node ./bin/mtg-proofs.js export-review --limit "$EXPORT_LIMIT"

  echo "[proof-loop] iteration complete; review exports are under analysis/proof-review/"
}

sample_deck_exists() {
  node <<'NODE'
const fs = require('fs');
const file = 'analysis/proof-review/decks.jsonl';
if (!fs.existsSync(file)) process.exit(1);
for (const line of fs.readFileSync(file, 'utf8').split(/\n/)) {
  if (!line.trim()) continue;
  try {
    const row = JSON.parse(line);
    if (row && row.deck_id === 'sample') process.exit(0);
  } catch {}
}
process.exit(1);
NODE
}

should_run_sample() {
  case "$RUN_SAMPLE" in
    1|true|yes|always)
      return 0
      ;;
    once|auto)
      ! sample_deck_exists
      return
      ;;
    0|false|no|never)
      return 1
      ;;
    *)
      echo "[proof-loop] ERROR invalid MTG_PROOF_RUN_SAMPLE=$RUN_SAMPLE (expected auto, once, always, or never)" >&2
      return 2
      ;;
  esac
}

start_ollama_if_needed
ensure_model
mkdir -p analysis/proof-review

ITERATION=0
while true; do
  ITERATION=$((ITERATION + 1))
  iteration_started_at=$(date +%s)
  if ! run_once 2> >(tee -a "$ERROR_LOG" >&2); then
    iteration_finished_at=$(date +%s)
    {
      echo "[proof-loop] ERROR iteration=$ITERATION failed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ) duration=$((iteration_finished_at - iteration_started_at))s"
      echo "[proof-loop] ERROR stopping after failed iteration"
    } | tee -a "$ERROR_LOG" >&2
    print_iteration_status "$ITERATION" "failed" "$((iteration_finished_at - iteration_started_at))" || \
      echo "[proof-loop] ERROR status overview unavailable after failure" | tee -a "$ERROR_LOG" >&2
    exit 1
  fi
  iteration_finished_at=$(date +%s)
  if ! print_iteration_status "$ITERATION" "ok" "$((iteration_finished_at - iteration_started_at))"; then
    echo "[proof-loop] ERROR status overview unavailable; stopping" | tee -a "$ERROR_LOG" >&2
    exit 1
  fi
  echo "[proof-loop] sleeping ${SUCCESS_SLEEP_SECONDS}s before next iteration; Ctrl-C to stop"
  sleep "$SUCCESS_SLEEP_SECONDS"
done
