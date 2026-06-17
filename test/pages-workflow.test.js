const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const workflow = readFileSync('.github/workflows/deploy-pages.yml', 'utf8');

assert.match(workflow, /^on:\n(?:  .+\n)*  push:\n/m, 'Pages workflow must run on push');
assert.match(workflow, /branches:\s*\[main\]|branches:\n\s*-\s*main/, 'Pages workflow push trigger must target main');
assert.match(workflow, /^  workflow_dispatch:\s*$/m, 'Pages workflow must remain manually runnable');
assert.match(workflow, /uses:\s*actions\/configure-pages@v5/, 'Pages workflow should configure GitHub Pages before uploading');
assert.match(workflow, /uses:\s*actions\/upload-pages-artifact@v3[\s\S]*?path:\s*docs/, 'Pages workflow must upload generated docs artifact');
assert.match(workflow, /uses:\s*actions\/deploy-pages@v4/, 'Pages workflow must deploy with deploy-pages');
assert.doesNotMatch(workflow, /Manual only|NOT triggered on push/i, 'Pages workflow documentation must not claim manual-only publishing');

console.log('pages-workflow.test.js passed');
