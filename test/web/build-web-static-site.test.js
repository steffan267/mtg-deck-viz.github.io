const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildSources, publicSourceId, splitSourceList } = require('../../src/build-web.js');

const ROOT = path.resolve(__dirname, '../..');
const ROOT_INDEX = path.join(ROOT, 'index.html');
const ROOT_BOOTSTRAP = path.join(ROOT, 'bootstrap-data.json');
const ROOT_NOJEKYLL = path.join(ROOT, '.nojekyll');
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
  [ROOT_INDEX, snapshot(ROOT_INDEX)],
  [ROOT_BOOTSTRAP, snapshot(ROOT_BOOTSTRAP)],
  [ROOT_NOJEKYLL, snapshot(ROOT_NOJEKYLL)],
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

  test('keeps a root Pages entrypoint for branch-root publishing', () => {
    assert.equal(fs.existsSync(ROOT_INDEX), true);
    const rootHtml = fs.readFileSync(ROOT_INDEX, 'utf8');
    assert.match(rootHtml, /<div id="app"><\/div>/);
    assert.doesNotMatch(rootHtml, /url=\.\/docs\//);
  });

  test('preserves the GitHub Pages .nojekyll marker under docs and root', () => {
    assert.equal(fs.existsSync(DOCS_NOJEKYLL), true);
    assert.equal(fs.existsSync(ROOT_NOJEKYLL), true);
  });

  test('embeds the sample deck bootstrap as the default active deck', () => {
    const bootstrap = JSON.parse(fs.readFileSync(DOCS_BOOTSTRAP, 'utf8'));
    assert.equal(bootstrap.decks[0].title, 'Sample deck — Xantcha');
    assert.equal(bootstrap.active, 0);
    assert.equal(fs.existsSync(ROOT_BOOTSTRAP), true);
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

  test('parses CLI and environment deck sources for static inclusion', () => {
    assert.deepEqual(splitSourceList('one.txt, two.txt\nhttps://moxfield.com/decks/abc'), ['one.txt', 'two.txt', 'https://moxfield.com/decks/abc']);
    assert.deepEqual(buildSources(['cli-a.txt', 'cli-b.txt'], { MTG_DECK_SOURCES: 'ignored.txt' }), ['cli-a.txt', 'cli-b.txt']);
    assert.deepEqual(buildSources([], { MTG_DECK_SOURCES: 'env-a.txt\nenv-b.txt' }), ['env-a.txt', 'env-b.txt']);
    assert.deepEqual(buildSources([], { MTG_DECK_SOURCES: '  ', DECK_SOURCES: 'legacy-a.txt' }), ['legacy-a.txt']);
    assert.equal(publicSourceId(path.join(ROOT, 'data/sample-decklist.txt')), 'data/sample-decklist.txt');
    assert.equal(publicSourceId(path.join(os.tmpdir(), 'agent-a.txt')), 'agent-a.txt');
    assert.equal(publicSourceId('https://moxfield.com/decks/abc'), 'https://moxfield.com/decks/abc');
  });

  test('can include multiple decks in the generated static bootstrap', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mtg-build-web-'));
    const first = path.join(dir, 'agent-a.txt');
    const second = path.join(dir, 'agent-b.txt');
    fs.writeFileSync(first, '1 Sol Ring\n1 Mountain\n');
    fs.writeFileSync(second, '1 Arcane Signet\n1 Swamp\n');

    childProcess.execFileSync(process.execPath, ['src/build-web.js', first, second], {
      cwd: ROOT,
      env: { ...process.env, MOXFIELD_PROXY: 'https://proxy.example.test' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const bootstrap = JSON.parse(fs.readFileSync(DOCS_BOOTSTRAP, 'utf8'));
    assert.equal(bootstrap.decks.length, 2);
    assert.equal(bootstrap.active, 0);
    assert.deepEqual(bootstrap.decks.map(deck => deck.title), ['agent-a', 'agent-b']);
    assert.deepEqual(bootstrap.decks.map(deck => deck.sourceId), ['agent-a.txt', 'agent-b.txt']);
    assert.equal(fs.existsSync(ROOT_BOOTSTRAP), true);
  });

  test('inlines Vite assets into the generated static HTML', () => {
    const html = readGeneratedHtml();
    assert.doesNotMatch(html, /<script[^>]+src="\.\/assets\//);
    assert.doesNotMatch(html, /<link[^>]+href="\.\/assets\//);
    assert.match(html, /createApp|app/);
  });

  test('does not leak source CommonJS loaders into browser HTML', () => {
    const html = readGeneratedHtml();
    assert.doesNotMatch(html, /(?:^|[;{}])module\.exports\s*=/, 'browser bundle must not assign to an undefined CommonJS module');
    assert.doesNotMatch(html, /\brequire\s*\(/, 'browser bundle must not call CommonJS require');
  });

  test('copies bundled recommendation worker JavaScript next to the docs static HTML entrypoint', () => {
    const worker = fs.readdirSync(DOCS_INDEX.endsWith('index.html') ? path.dirname(DOCS_INDEX) : DOCS_INDEX).find(name => workerPattern.test(name));
    assert.ok(worker, 'expected bundled worker asset next to docs/index.html');
    assert.equal(fs.existsSync(path.join(ROOT, worker)), true);
    const workerCode = fs.readFileSync(path.join(path.dirname(DOCS_INDEX), worker), 'utf8');
    assert.doesNotMatch(workerCode, /import\s+type\s/);
    assert.doesNotMatch(workerCode, /from ['\"]\.\.\/\.\.\//);
  });

  process.stdout.write('Static web build smoke tests passed\n');
} finally {
  for (const [file, snap] of snapshots) restore(file, snap);
}
