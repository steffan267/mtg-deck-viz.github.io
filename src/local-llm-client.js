/*
 * local-llm-client.js — minimal Ollama HTTP client for local-only draft help.
 *
 * This client is intentionally generic and optional. It never calls OpenAI or
 * cloud APIs; callers inject it into proof-review drafting, and deterministic
 * validation remains authoritative.
 */

const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
// Single default model for the whole loop. Generator and critic both fall back
// to it so a stock pipeline run loads ONE model and never swaps per entry —
// each generate→critique pair stays on the resident model. Override the
// generator/critic env vars only if you have the VRAM to keep two models
// resident at once; otherwise distinct models force an unload/reload per entry.
const DEFAULT_PROOF_MODEL = 'qwen3:14b';
// keep_alive acts as a rolling debounce: Ollama resets the unload timer on every
// request, so as long as entries arrive within this window the model stays
// resident, and it frees VRAM only after a genuine idle period (e.g. once the
// loop stops). '5m' matches Ollama's own default window. Use -1 to pin forever.
const DEFAULT_KEEP_ALIVE = '5m';

class LocalLlmClient {
  constructor(options = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl || process.env.MTG_OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL);
    this.proofModel = options.proofModel || process.env.MTG_LLM_PROOF_MODEL || DEFAULT_PROOF_MODEL;
    // Generator and critic default to the proof model (one resident model, no
    // per-entry swap). They are still independently overridable.
    this.generatorModel = options.generatorModel || process.env.MTG_LLM_GENERATOR_MODEL || this.proofModel;
    this.criticModel = options.criticModel || process.env.MTG_LLM_CRITIC_MODEL || this.proofModel;
    this.keepAlive = options.keepAlive ?? process.env.MTG_OLLAMA_KEEP_ALIVE ?? DEFAULT_KEEP_ALIVE;
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
  }

  async generateText(prompt, options = {}) {
    const model = options.model || this.proofModel;
    const response = await this.postGenerate({ model, prompt, stream: false });
    if (typeof response.response !== 'string') throw new Error('Ollama response did not include a text response field.');
    return response.response;
  }

  async generateJson(prompt, schema, options = {}) {
    const model = options.model || this.proofModel;
    // Prefer Ollama structured outputs: a real JSON Schema in `format` constrains
    // decoding to the required shape. Fall back to free-form JSON mode otherwise.
    const format = schema && schema.jsonSchema ? schema.jsonSchema : 'json';
    const response = await this.postGenerate({
      model,
      prompt: promptWithJsonSchema(prompt, schema),
      stream: false,
      format,
    });
    if (typeof response.response !== 'string') throw new Error('Ollama response did not include a JSON text response field.');
    try {
      return JSON.parse(response.response);
    } catch (error) {
      const err = new Error('Ollama returned malformed JSON: ' + error.message);
      err.cause = error;
      err['rawResponse'] = response.response;
      throw err;
    }
  }

  // Pre-load a model into Ollama's memory without generating output. Call once
  // before a drafting loop so the first entry isn't paying a cold model load.
  async warmup(model = this.proofModel) {
    const response = await this.postGenerate({ model, prompt: '', stream: false });
    return { model, loaded: true, response };
  }

  async postGenerate(body) {
    if (typeof this.fetchImpl !== 'function') throw unavailableError('global fetch is unavailable in this Node runtime');
    // Pin the loaded model in memory (default keep_alive: -1) so it stays
    // resident across entries instead of idle-unloading between calls. Callers
    // can still override per request by setting keep_alive on the body.
    const payload = 'keep_alive' in body ? body : Object.assign({ keep_alive: this.keepAlive }, body);
    let response;
    try {
      response = await this.fetchImpl(this.baseUrl + '/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      throw unavailableError(error.message, error);
    }
    if (!response || !response.ok) {
      const status = response ? response.status + ' ' + (response.statusText || '') : 'no response';
      let details = '';
      try {
        details = response && typeof response.text === 'function' ? await response.text() : '';
      } catch (_) {
        details = '';
      }
      throw unavailableError(status + (details ? ': ' + details : ''));
    }
    return response.json();
  }
}

function normalizeBaseUrl(url) {
  const value = String(url || DEFAULT_OLLAMA_BASE_URL).replace(/\/+$/, '');
  let parsed;
  try {
    parsed = new URL(value);
  } catch (error) {
    throw new Error('MTG_OLLAMA_BASE_URL must be a valid http:// loopback URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('MTG_OLLAMA_BASE_URL must use http:// or https:// for local Ollama.');
  if (!isLoopbackHost(parsed.hostname)) throw new Error('MTG_OLLAMA_BASE_URL must point to a loopback host (localhost, 127.0.0.1, or ::1); remote Ollama endpoints are not allowed.');
  return value;
}

function isLoopbackHost(hostname) {
  const host = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
  return host === 'localhost' || host === '::1' || host === '0:0:0:0:0:0:0:1' || /^127(?:\.\d{1,3}){3}$/.test(host);
}

function promptWithJsonSchema(prompt, schema) {
  if (!schema) return prompt;
  return prompt + '\n\nReturn strict JSON only matching this schema description:\n' + JSON.stringify(schema, null, 2);
}

function unavailableError(reason, cause) {
  const err = new Error('Ollama is unavailable at MTG_OLLAMA_BASE_URL. Start Ollama locally, install/configure the requested model, or skip draft-proofs. Details: ' + reason);
  if (cause) err.cause = cause;
  err['code'] = 'OLLAMA_UNAVAILABLE';
  return err;
}

module.exports = {
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_PROOF_MODEL,
  DEFAULT_KEEP_ALIVE,
  LocalLlmClient,
  unavailableError,
};
