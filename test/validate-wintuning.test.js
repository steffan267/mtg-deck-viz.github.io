const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const VALIDATE = require("../analysis/bracket/validate-wintuning.js");

function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "validate-wintuning-"));
  const arrayCorpus = path.join(tmp, "array.json");
  const objectCorpus = path.join(tmp, "object.json");
  const arrayOut = path.join(tmp, "array-out.json");
  const objectOut = path.join(tmp, "object-out.json");

  fs.writeFileSync(arrayCorpus, JSON.stringify([{ id: "a" }], null, 2));
  fs.writeFileSync(objectCorpus, JSON.stringify({ decks: [{ id: "b" }] }, null, 2));
  fs.writeFileSync(arrayOut, JSON.stringify([{ id: "done" }], null, 2));
  fs.writeFileSync(objectOut, JSON.stringify({ results: [{ id: "ok" }], failures: [{ id: "bad", error: "boom" }] }, null, 2));

  const parsed = VALIDATE.parseArgs(["25", "--corpus", objectCorpus, "--out", objectOut]);
  assert.equal(parsed.limit, 25);
  assert.equal(parsed.corpus, objectCorpus);
  assert.equal(parsed.out, objectOut);

  assert.deepEqual(VALIDATE.loadCorpus(arrayCorpus), [{ id: "a" }]);
  assert.deepEqual(VALIDATE.loadCorpus(objectCorpus), [{ id: "b" }]);
  assert.deepEqual(VALIDATE.loadPrior(arrayOut), { results: [{ id: "done" }], failures: [] });
  assert.deepEqual(VALIDATE.loadPrior(objectOut), { results: [{ id: "ok" }], failures: [{ id: "bad", error: "boom" }] });

  const built = VALIDATE.buildOutput("corpus.json", 3, [{ id: "ok1" }, { id: "ok2" }], [{ id: "bad" }]);
  assert.equal(built.meta.corpus, "corpus.json");
  assert.equal(built.meta.requestedDecks, 3);
  assert.equal(built.meta.analyzedDecks, 2);
  assert.equal(built.meta.failedDecks, 1);
  assert.equal(built.meta.complete, true);

  process.stdout.write("Validate wintuning tests passed\n");
}

main();
