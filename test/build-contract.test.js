const assert = require('node:assert/strict');
const fs = require('node:fs');

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const scripts = pkg.scripts || {};

assert.match(scripts.typecheck || '', /typecheck:app/);
assert.match(scripts.typecheck || '', /typecheck:config/);
assert.match(scripts['typecheck:app'] || '', /vue-tsc\b/);
assert.match(scripts['typecheck:config'] || '', /tsc\b.*tsconfig\.node\.json/);
assert.match(scripts.build || '', /npm run typecheck/);
assert.match(scripts['build-web'] || '', /npm run typecheck/);
assert.match(scripts['build-web'] || '', /node \.\/src\/build-web\.js/);

const sourceIndex = fs.readFileSync('src/web/index.html', 'utf8');
assert.doesNotMatch(sourceIndex, /src=["']\/main\.ts["']/);
assert.match(sourceIndex, /src=["']\.\/main\.ts["']/);
assert.match(sourceIndex, /Browsers cannot run its <code>main\.ts<\/code> module correctly from <code>file:\/\//);
assert.match(sourceIndex, /src\\\/web\\\/index\\\.html/);

process.stdout.write('Build contract tests passed\n');
