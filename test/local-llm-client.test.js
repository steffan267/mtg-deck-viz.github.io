const assert = require('node:assert/strict');
const { LocalLlmClient } = require('../src/local-llm-client');

async function main() {
  const requests = [];
  const client = new LocalLlmClient({
    baseUrl: 'http://localhost:11434/',
    proofModel: 'proof-model',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        async json() { return { response: '{"ok":true}' }; },
      };
    },
  });

  const json = await client.generateJson('Return JSON', { required: ['ok'] });
  assert.deepEqual(json, { ok: true });
  assert.equal(requests[0].url, 'http://localhost:11434/api/generate');
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.model, 'proof-model');
  assert.equal(body.stream, false);
  assert.equal(body.format, 'json');
  assert.match(body.prompt, /Return strict JSON only/);

  const textClient = new LocalLlmClient({
    fetchImpl: async () => ({ ok: true, async json() { return { response: 'plain text' }; } }),
  });
  assert.equal(await textClient.generateText('hello', { model: 'text-model' }), 'plain text');

  assert.throws(() => new LocalLlmClient({ baseUrl: 'https://example.com' }), /loopback host/, 'remote Ollama-compatible endpoints must be rejected');
  assert.doesNotThrow(() => new LocalLlmClient({ baseUrl: 'http://127.0.0.2:11434' }), '127/8 loopback aliases should be allowed');

  const unavailableClient = new LocalLlmClient({
    fetchImpl: async () => { throw new Error('connection refused'); },
  });
  await assert.rejects(() => unavailableClient.generateText('hello'), /Ollama is unavailable/);

  const badJsonClient = new LocalLlmClient({
    fetchImpl: async () => ({ ok: true, async json() { return { response: 'not json' }; } }),
  });
  await assert.rejects(() => badJsonClient.generateJson('json'), /malformed JSON/);

  process.stdout.write('Local LLM client tests passed\n');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
