const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const ROOT_INDEX = path.join(ROOT, 'index.html');
const DOCS_INDEX = path.join(ROOT, 'docs/index.html');
const DOCS_BOOTSTRAP = path.join(ROOT, 'docs/bootstrap-data.json');
const DOCS_NOJEKYLL = path.join(ROOT, 'docs/.nojekyll');
const workerPattern = /^recommendation\.worker-.*\.js$/;

function snapshot(file) {
  return fs.existsSync(file) ? { existed: true, value: fs.readFileSync(file, 'utf8') } : { existed: false, value: null };
}

function restore(file, snap) {
  if (snap.existed) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, snap.value);
    return;
  }
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

function readGeneratedHtml() {
  return fs.readFileSync(DOCS_INDEX, 'utf8');
}

const snapshots = new Map([
  [DOCS_INDEX, snapshot(DOCS_INDEX)],
  [DOCS_BOOTSTRAP, snapshot(DOCS_BOOTSTRAP)],
  [DOCS_NOJEKYLL, snapshot(DOCS_NOJEKYLL)],
]);

function test(name, fn) {
  try {
    fn();
    process.stdout.write(`✓ ${name}\n`);
  } catch (error) {
    error.message = `${name}: ${error.message}`;
    throw error;
  }
}

try {
  childProcess.execFileSync(process.execPath, ['src/build-web.js'], {
    cwd: ROOT,
    env: { ...process.env, MOXFIELD_PROXY: 'https://proxy.example.test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  test('writes the GitHub Pages static HTML artifact under docs', () => {
    assert.equal(fs.existsSync(DOCS_INDEX), true);
  });

  test('keeps a root Pages fallback that redirects branch-root publishing to docs', () => {
    assert.equal(fs.existsSync(ROOT_INDEX), true);
    const rootHtml = fs.readFileSync(ROOT_INDEX, 'utf8');
    assert.match(rootHtml, /url=\.\/docs\//);
    assert.match(rootHtml, /window\.location\.replace\('\.\/docs\/'/);
  });

  test('preserves the GitHub Pages .nojekyll marker under docs only', () => {
    assert.equal(fs.existsSync(DOCS_NOJEKYLL), true);
    assert.equal(fs.existsSync(path.join(ROOT, '.nojekyll')), false);
  });

  test('embeds the sample deck bootstrap as the default active deck', () => {
    const bootstrap = JSON.parse(fs.readFileSync(DOCS_BOOTSTRAP, 'utf8'));
    assert.equal(bootstrap.decks[0].title, 'Sample deck — Xantcha');
    assert.equal(bootstrap.active, 0);
    assert.equal(fs.existsSync(path.join(ROOT, 'bootstrap-data.json')), false);
  });

  test('writes candidate data to a cacheable bootstrap asset', () => {
    const bootstrap = JSON.parse(fs.readFileSync(DOCS_BOOTSTRAP, 'utf8'));
    assert.ok(Array.isArray(bootstrap.candidates));
    assert.ok(bootstrap.candidates.length > 1000);
    const html = readGeneratedHtml();
    assert.match(html, /window\.__MTG_BOOTSTRAP_URL__ = "\.\/bootstrap-data\.json"/);
    assert.doesNotMatch(html, /window\.__MTG_BOOTSTRAP__ = \{"decks"/);
    assert.ok(Buffer.byteLength(html) < 2_000_000, `expected thin HTML, got ${Buffer.byteLength(html)} bytes`);
  });

  test('injects the Moxfield proxy configured at build time', () => {
    assert.match(readGeneratedHtml(), /window\.__MOXFIELD_PROXY__ = "https:\/\/proxy\.example\.test";/);
  });

  test('inlines Vite assets into the generated static HTML', () => {
    const html = readGeneratedHtml();
    assert.doesNotMatch(html, /<script[^>]+src="\.\/assets\//);
    assert.doesNotMatch(html, /<link[^>]+href="\.\/assets\//);
    assert.match(html, /createApp|app/);
  });

  test('copies bundled recommendation worker JavaScript next to the docs static HTML entrypoint', () => {
    const worker = fs.readdirSync(DOCS_INDEX.endsWith('index.html') ? path.dirname(DOCS_INDEX) : DOCS_INDEX).find(name => workerPattern.test(name));
    assert.ok(worker, 'expected bundled worker asset next to docs/index.html');
    assert.equal(fs.existsSync(path.join(ROOT, worker)), false);
    const workerCode = fs.readFileSync(path.join(path.dirname(DOCS_INDEX), worker), 'utf8');
    assert.doesNotMatch(workerCode, /import\s+type\s/);
    assert.doesNotMatch(workerCode, /from ['\"]\.\.\/\.\.\//);
  });

  process.stdout.write('Static web build smoke tests passed\n');
} finally {
  for (const [file, snap] of snapshots) restore(file, snap);
}
