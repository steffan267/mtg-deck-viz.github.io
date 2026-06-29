/*
 * local-llm-client.js — minimal Ollama HTTP client for local-only draft help.
 *
 * This client is intentionally generic and optional. It never calls OpenAI or
 * cloud APIs; callers inject it into proof-review drafting, and deterministic
 * validation remains authoritative.
 */

const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_GENERATOR_MODEL = 'qwen3:14b';
const DEFAULT_PROOF_MODEL = 'qwen3:32b';
const DEFAULT_CRITIC_MODEL = 'qwen3-coder:30b';

class LocalLlmClient {
  constructor(options = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl || process.env.MTG_OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL);
    this.generatorModel = options.generatorModel || process.env.MTG_LLM_GENERATOR_MODEL || DEFAULT_GENERATOR_MODEL;
    this.proofModel = options.proofModel || process.env.MTG_LLM_PROOF_MODEL || DEFAULT_PROOF_MODEL;
    this.criticModel = options.criticModel || process.env.MTG_LLM_CRITIC_MODEL || DEFAULT_CRITIC_MODEL;
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
    const response = await this.postGenerate({
      model,
      prompt: promptWithJsonSchema(prompt, schema),
      stream: false,
      format: 'json',
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

  async postGenerate(body) {
    if (typeof this.fetchImpl !== 'function') throw unavailableError('global fetch is unavailable in this Node runtime');
    let response;
    try {
      response = await this.fetchImpl(this.baseUrl + '/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
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
  DEFAULT_GENERATOR_MODEL,
  DEFAULT_PROOF_MODEL,
  DEFAULT_CRITIC_MODEL,
  LocalLlmClient,
  unavailableError,
};
