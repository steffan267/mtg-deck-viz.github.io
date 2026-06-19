const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  CORE_LOGIC_FILES,
  canonicalizeMentionText,
  collectEvidenceCardNames,
  runNoComboNameHardcodingCheck,
  stripJsComments,
} = require('../scripts/check-no-combo-name-hardcoding');

const names = collectEvidenceCardNames();
assert.ok(names.includes("Thassa's Oracle"), 'tracked EDHREC evidence snapshot should provide clean-checkout combo evidence names');
assert.ok(CORE_LOGIC_FILES.includes('src/interaction-model.js'));
assert.equal(stripJsComments('const x = 1; // card name').startsWith('const x = 1;'), true);
assert.equal(stripJsComments('const url = "https://edhrec.com/combos";'), 'const url = "https://edhrec.com/combos";');
assert.equal(canonicalizeMentionText("Thassa’s  Oracle"), canonicalizeMentionText("thassa's oracle"));

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

process.stdout.write('No combo name hardcoding tests passed\n');
