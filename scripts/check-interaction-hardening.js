#!/usr/bin/env node
/*
 * check-interaction-hardening.js — cheap maintainability/budget guardrails for
 * the rulesbuilder interaction engine.
 */
const fs = require('node:fs');
const path = require('node:path');
const {
  DEFAULT_OPTIONS: PROOF_PACKAGE_OPTIONS,
  PROOF_PACKAGE_SCHEMA_FIELDS,
  PROOF_PACKAGE_SCHEMA_VERSION,
  buildInteractionProofPackages,
} = require('../src/interaction-proof-packages');
const { COMBO_FAMILIES, validateComboFamilyLibrary } = require('../src/combo-family-library');
const { createProgress } = require('../lib/progress');

const ROOT = path.resolve(__dirname, '..');
const VALIDATION_REPORT = path.join(ROOT, 'analysis/interaction-validation/report.json');
const ENGINE_DOC = path.join(ROOT, 'src/INTERACTION_ENGINE.md');
const BROWSER_GRAPH_BUILDER = path.join(ROOT, 'src/web/services/browserGraphBuilder.ts');
const PAYLOAD_ADAPTER = path.join(ROOT, 'src/web/services/adapters/payload.ts');
const GRAPH_TYPES = path.join(ROOT, 'src/web/types/graph.ts');
const APP_VUE = path.join(ROOT, 'src/web/App.vue');

const BUDGETS = {
  validationRecallFloor: 0.8,
  validationPrecisionFloor: 0.9,
  validationUnexplainedRateCeiling: 0.15,
  validationRuntimeBudgetMs: 250,
  maxProofPackagesPerDeck: 24,
  maxProofPayloadBytes: 50_000,
  maxEvidenceSnippetChars: 240,
  allowedMissedCombos: [],
};

const PAYLOAD_FIXTURE = [
  { id: 'Self Untap Dork', type_line: 'Creature — Elf Druid', oracle_text: '{T}: Add {G}{G}. {0}: Untap this creature.', cmc: 2 },
  { id: 'Deadeye Navigator', type_line: 'Creature — Spirit', oracle_text: '{1}{U}: Exile another target creature you control, then return it to the battlefield under your control.', cmc: 6 },
  { id: 'Peregrine Drake', type_line: 'Creature — Drake', oracle_text: 'Flying When this creature enters, untap up to five lands.', cmc: 5 },
  { id: 'Sanguine Bond', type_line: 'Enchantment', oracle_text: 'Whenever you gain life, target opponent loses that much life.', cmc: 5 },
  { id: 'Exquisite Blood', type_line: 'Enchantment', oracle_text: 'Whenever an opponent loses life, you gain that much life.', cmc: 5 },
  { id: 'Self Top Draw Artifact', type_line: 'Artifact', oracle_text: '{T}: Draw a card, then put this artifact on top of its owner’s library.', cmc: 1, mana_cost: '{1}' },
  { id: 'Artifact Spell Reducer', type_line: 'Artifact Creature — Vedalken Artificer', oracle_text: 'Artifact spells you cast cost {1} less to cast.', cmc: 2 },
  { id: 'Artifact Top Caster', type_line: 'Artifact', oracle_text: 'You may look at the top card of your library any time. You may cast artifact spells from the top of your library.', cmc: 4 },
  { id: 'Token Source', type_line: 'Creature', oracle_text: 'When this creature enters, create a 1/1 white Soldier creature token.', cmc: 2 },
  { id: 'Token Doubler', type_line: 'Enchantment', oracle_text: 'If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.', cmc: 4 },
  { id: 'Token Payoff', type_line: 'Creature', oracle_text: 'Whenever one or more tokens you control enter, draw a card.', cmc: 3 },
  { id: 'Token Fodder', type_line: 'Creature', oracle_text: 'When this creature enters, create a 1/1 white Soldier creature token.', cmc: 2 },
  { id: 'Sac Outlet', type_line: 'Creature', oracle_text: 'Sacrifice a creature: Add {C}.', cmc: 1 },
  { id: 'Death Payoff', type_line: 'Creature', oracle_text: 'Whenever another creature dies, each opponent loses 1 life.', cmc: 2 },
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function assertOk(condition, message, errors) {
  if (!condition) errors.push(message);
}

function requireDocSections(errors) {
  const text = fs.existsSync(ENGINE_DOC) ? fs.readFileSync(ENGINE_DOC, 'utf8') : '';
  for (const heading of [
    '## Architecture layers',
    '## Ontology and facts',
    '## Adding or changing a combo family',
    '## Runtime vs audit-only boundaries',
    '## Budgets and QA gates',
    '## Behavior notes',
  ]) {
    assertOk(text.includes(heading), `missing documentation heading: ${heading}`, errors);
  }
}

function checkValidationMetrics(errors) {
  const report = readJson(VALIDATION_REPORT);
  const summary = report.summary || {};
  assertOk(summary.recall >= BUDGETS.validationRecallFloor, `validation recall ${summary.recall} below ${BUDGETS.validationRecallFloor}`, errors);
  assertOk(summary.sampledPrecision >= BUDGETS.validationPrecisionFloor, `sampled precision ${summary.sampledPrecision} below ${BUDGETS.validationPrecisionFloor}`, errors);
  assertOk(summary.unexplainedRate <= BUDGETS.validationUnexplainedRateCeiling, `unexplained rate ${summary.unexplainedRate} above ${BUDGETS.validationUnexplainedRateCeiling}`, errors);
  assertOk(report.runtime && report.runtime.measuredSeparately === true, 'validation report must keep measured runtime out of deterministic artifacts', errors);
  assertOk(report.runtime && report.runtime.budgetMs <= BUDGETS.validationRuntimeBudgetMs, `runtime budget must be <= ${BUDGETS.validationRuntimeBudgetMs}ms`, errors);
  const misses = (report.manualAudit && report.manualAudit.topMissedCombos) || [];
  const unexpectedMisses = misses.filter(id => !BUDGETS.allowedMissedCombos.includes(id));
  assertOk(unexpectedMisses.length === 0, `unexpected missed combos: ${unexpectedMisses.join(', ')}`, errors);
}

function checkProofPayloadBudgets(errors) {
  const packages = buildInteractionProofPackages(PAYLOAD_FIXTURE);
  const payloadBytes = Buffer.byteLength(JSON.stringify(packages), 'utf8');
  assertOk(PROOF_PACKAGE_OPTIONS.maxProofPackages === BUDGETS.maxProofPackagesPerDeck, 'proof package max option must match hardening budget', errors);
  assertOk(packages.length <= BUDGETS.maxProofPackagesPerDeck, `proof package count ${packages.length} exceeds ${BUDGETS.maxProofPackagesPerDeck}`, errors);
  assertOk(payloadBytes <= BUDGETS.maxProofPayloadBytes, `proof payload ${payloadBytes} bytes exceeds ${BUDGETS.maxProofPayloadBytes}`, errors);
  for (const pkg of packages) {
    assertOk(pkg.schemaVersion === PROOF_PACKAGE_SCHEMA_VERSION, `${pkg.id} has unexpected schema version ${pkg.schemaVersion}`, errors);
    for (const field of PROOF_PACKAGE_SCHEMA_FIELDS) assertOk(field in pkg, `${pkg.id} missing schema field ${field}`, errors);
    assertOk(pkg.cards.length <= 3, `${pkg.id} exceeds supported 3-card package size`, errors);
    assertOk(pkg.sequence.length > 0, `${pkg.id} is missing sequence steps`, errors);
    assertOk(pkg.contributions.length === pkg.cards.length, `${pkg.id} contribution/card mismatch`, errors);
    for (const evidence of pkg.evidence || []) {
      assertOk(!evidence.text || evidence.text.length <= BUDGETS.maxEvidenceSnippetChars, `${pkg.id} evidence snippet exceeds ${BUDGETS.maxEvidenceSnippetChars} chars`, errors);
    }
  }
}

function checkRuntimeContracts(errors) {
  const browserBuilder = fs.readFileSync(BROWSER_GRAPH_BUILDER, 'utf8');
  const payloadAdapter = fs.readFileSync(PAYLOAD_ADAPTER, 'utf8');
  const graphTypes = fs.readFileSync(GRAPH_TYPES, 'utf8');
  const appVue = fs.readFileSync(APP_VUE, 'utf8');
  assertOk(browserBuilder.includes('includeInteractionProofs?: boolean'), 'browser graph builder must keep proof generation explicit/opt-in', errors);
  assertOk(browserBuilder.includes('buildInteractionProofPackages?:'), 'browser graph builder must inject browser-safe proof generation instead of importing Node CommonJS', errors);
  assertOk(browserBuilder.includes('if (options.includeInteractionProofs)'), 'browser graph builder must not always emit proof packages on import', errors);
  assertOk(!browserBuilder.includes("interaction-proof-packages.js"), 'browser graph builder must not directly import CommonJS proof packages', errors);
  assertOk(!appVue.includes("interaction-proof-packages.js"), 'App.vue must not directly import CommonJS proof packages', errors);
  assertOk(payloadAdapter.includes("schemaVersion: asString(input.schemaVersion, 'interaction-proof-package.v1')"), 'payload adapter must normalize proof schemaVersion', errors);
  assertOk(graphTypes.includes('schemaVersion: string'), 'web graph types must expose proof schemaVersion', errors);
  assertOk(appVue.includes('materializeInteractionProofs()'), 'App.vue must materialize proof packages only when proof UX asks for them', errors);
}

function checkFamilyDefinitions(errors) {
  const validation = validateComboFamilyLibrary();
  assertOk(validation.ok, validation.errors.join('; '), errors);
  for (const family of COMBO_FAMILIES) {
    assertOk(family.examples.length >= 1, `${family.id} missing positive example`, errors);
    assertOk(family.negativeFixtures.length >= 1, `${family.id} missing negative fixture`, errors);
    assertOk(family.knownFalsePositives.length >= 1, `${family.id} missing known false-positive note`, errors);
  }
}

function runHardeningChecks() {
  const errors = [];
  const progress = createProgress('interaction-hardening', 5, { every: 1 });
  progress.start();
  checkFamilyDefinitions(errors);
  progress.tick(1, 'family-definitions');
  checkValidationMetrics(errors);
  progress.tick(2, 'validation-metrics');
  checkProofPayloadBudgets(errors);
  progress.tick(3, 'proof-payload-budgets');
  checkRuntimeContracts(errors);
  progress.tick(4, 'runtime-contracts');
  requireDocSections(errors);
  progress.tick(5, 'doc-sections');
  progress.done(`errors=${errors.length}`);
  return {
    ok: errors.length === 0,
    errors,
    budgets: BUDGETS,
  };
}

function main() {
  const result = runHardeningChecks();
  if (!result.ok) {
    process.stderr.write(`Interaction hardening checks failed:\n- ${result.errors.join('\n- ')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`Interaction hardening checks passed (${COMBO_FAMILIES.length} families; proof budget ${BUDGETS.maxProofPackagesPerDeck} packages/${BUDGETS.maxProofPayloadBytes} bytes)\n`);
}

if (require.main === module) main();
else module.exports = { BUDGETS, PAYLOAD_FIXTURE, runHardeningChecks };
