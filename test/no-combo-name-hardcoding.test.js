const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  CORE_LOGIC_FILES,
  canonicalizeMentionText,
  collectEvidenceCardNames,
  discoverCoreLogicFiles,
  hasDistinctiveOptionalShape,
  runNoComboNameHardcodingCheck,
  stripJsComments,
} = require('../scripts/check-no-combo-name-hardcoding');

const names = collectEvidenceCardNames();
assert.ok(names.includes("Thassa's Oracle"), 'tracked EDHREC evidence snapshot should provide clean-checkout combo evidence names');
assert.equal(names.includes('Sacrifice'), false, 'exhaustive optional cache should not turn mechanic words into guard false positives');
assert.ok(CORE_LOGIC_FILES.includes('src/interaction-model.js'));
assert.equal(stripJsComments('const x = 1; // card name').startsWith('const x = 1;'), true);
assert.equal(stripJsComments('const url = "https://edhrec.com/combos";'), 'const url = "https://edhrec.com/combos";');
assert.equal(canonicalizeMentionText("Thassa’s  Oracle"), canonicalizeMentionText("thassa's oracle"));
assert.equal(hasDistinctiveOptionalShape('Sacrifice'), false);
assert.equal(hasDistinctiveOptionalShape("Thassa's Oracle"), true);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-hardcode-'));
const tmpFile = path.join(tmpDir, 'sample.js');
try {
  fs.writeFileSync(tmpFile, 'const forbidden = "thassa’s oracle";\n');
  const normalizedHit = runNoComboNameHardcodingCheck({ names: ["Thassa's Oracle"], files: [tmpFile] });
  assert.equal(normalizedHit.ok, false, 'guard should catch lower/curly-apostrophe card-name branches');
  assert.equal(normalizedHit.findings.length, 1);

  fs.writeFileSync(tmpFile, 'const url = "https://edhrec.com/combos";\n');
  const clean = runNoComboNameHardcodingCheck({ names: ["Thassa's Oracle"], files: [tmpFile] });
  assert.equal(clean.ok, true, 'guard should not confuse URLs with card-name evidence');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

const result = runNoComboNameHardcodingCheck({ names });
assert.equal(result.ok, true, result.findings.map(item => `${item.file}:${item.line} ${item.name}`).join('\n'));
assert.equal(result.findings.length, 0);
assert.ok(result.checkedFiles.includes('src/interaction-model.js'));

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'no-hardcode-root-'));
try {
  fs.mkdirSync(path.join(tmpRoot, 'src'), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'src', 'interaction-new.js'), 'const rule = "Thassa’s Oracle";\n');
  fs.writeFileSync(path.join(tmpRoot, 'src', 'combo-family-library.js'), 'const example = "Thassa’s Oracle";\n');
  const discovered = discoverCoreLogicFiles(tmpRoot);
  assert.deepEqual(discovered, ['src/interaction-new.js']);
  const autoDiscoveredHit = runNoComboNameHardcodingCheck({ root: tmpRoot, names: ["Thassa's Oracle"] });
  assert.equal(autoDiscoveredHit.ok, false, 'default guard should auto-discover new runtime interaction files');
  assert.deepEqual(autoDiscoveredHit.findings.map(item => item.file), ['src/interaction-new.js']);

  fs.writeFileSync(path.join(tmpRoot, 'src', 'interaction-new.js'), 'const rule = "generic trigger";\n');
  const autoDiscoveredClean = runNoComboNameHardcodingCheck({ root: tmpRoot, names: ["Thassa's Oracle"] });
  assert.equal(autoDiscoveredClean.ok, true, 'declarative combo-family examples stay out of runtime hardcode scan');
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

process.stdout.write('No combo name hardcoding tests passed\n');
