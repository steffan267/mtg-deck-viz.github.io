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

print_iteration_status() {
  local iteration="$1"
  local outcome="$2"
  local duration_seconds="$3"

  PROOF_LOOP_ITERATION="$iteration" \
  PROOF_LOOP_OUTCOME="$outcome" \
  PROOF_LOOP_DURATION_SECONDS="$duration_seconds" \
  PROOF_LOOP_SLEEP_SECONDS="$SLEEP_SECONDS" \
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
  const batches = fs.readdirSync(storeDir)
    .filter(name => /^review_batch_.*\.jsonl$/.test(name))
    .map(name => {
      const file = path.join(storeDir, name);
      return { name, mtimeMs: fs.statSync(file).mtimeMs, count: readJsonl(name).length };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (!batches.length) return 'exports=none';
  return `latest_export=${batches[0].name} (${batches[0].count} items)`;
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

console.log(`[proof-loop] status iteration=${process.env.PROOF_LOOP_ITERATION} outcome=${process.env.PROOF_LOOP_OUTCOME} duration=${process.env.PROOF_LOOP_DURATION_SECONDS}s next_sleep=${process.env.PROOF_LOOP_SLEEP_SECONDS}s`);
console.log(`[proof-loop] overview ${runSummary}; proofs ${proofSummary}`);
console.log(`[proof-loop] overview ${draftSummary}${draftStatusSummary ? ` (${draftStatusSummary})` : ''}; ${latestExportSummary()}`);
NODE
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

ITERATION=0
while true; do
  ITERATION=$((ITERATION + 1))
  iteration_started_at=$(date +%s)
  outcome="ok"
  if ! run_once; then
    outcome="failed"
    echo "[proof-loop] iteration failed; continuing after sleep" >&2
  fi
  iteration_finished_at=$(date +%s)
  print_iteration_status "$ITERATION" "$outcome" "$((iteration_finished_at - iteration_started_at))" || \
    echo "[proof-loop] status overview unavailable; continuing to sleep" >&2
  echo "[proof-loop] sleeping ${SLEEP_SECONDS}s; Ctrl-C to stop"
  sleep "$SLEEP_SECONDS"
done
