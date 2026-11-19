'use strict';

/**
 * Node worker (json-rpc-stdio). One JSON-RPC 2.0 object per line in each direction;
 * stdout carries protocol messages only.
 *
 * Methods:
 *   detect({ locale? }) -> { available, path?, version?, reason?, message?, messages?, detail? }
 *     Finds the local agy executable and checks that `agy --version` runs. `message`
 *     is in the requested locale ('zh-CN' or English); `messages` carries both.
 *   listModels({ sessionId? })
 *     -> { supported: true, models: [{ id, name, description?, group?, efforts?, defaultEffort? }],
 *          modes?, defaultMode?, sessionId? }
 *      | { supported: false, reason: 'not-installed' | 'not-signed-in' } | { supported: true, error, detail? }
 *     Asks agy over ACP in the plugin's one dedicated session (see agy-models.js); `tier` is the
 *     subscription tier name agy reports.
 *   account({ sessionId? }) -> { supported: true, signedIn, tier?, canSignIn, canSignOut }
 *      | { supported: false, reason } | { supported: true, error, detail? }
 *   login() -> { ok: true, tier? } | { ok: false, error, detail? }
 *     agy's Google sign-in: agy opens the browser; answers when the sign-in finished, was cancelled
 *     or after 5 minutes. Sends a `progress` notification every 10 s meanwhile (keeps Cindy's
 *     request alive).
 *   cancelLogin() -> { ok: true, cancelled }
 *   logout() -> { ok: true } | { ok: false, error, detail? }
 *     Signs agy out; the settings page only asks after the user confirmed.
 *   Sign-in stays with agy (see agy-account.js); the plugin never sees credentials or the email.
 */

const readline = require('node:readline');
const { detectAgy } = require('./resolve-agy.js');
const { listModels } = require('./agy-models.js');
const account = require('./agy-account.js');

function reply(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

function replyError(id, code, message) {
  reply({ jsonrpc: '2.0', id, error: { code, message } });
}

const handlers = {
  async detect(params) {
    const locale = params && typeof params.locale === 'string' ? params.locale : undefined;
    return detectAgy({ locale });
  },
  async account(params) {
    return account.status(params).catch((error) => ({
      supported: true,
      error: 'status-failed',
      detail: String((error && error.message) || error).slice(0, 300),
    }));
  },
  async login() {
    return account.login(undefined, () => {
      reply({ jsonrpc: '2.0', method: 'progress', params: { stage: 'waiting-for-browser' } });
    });
  },
  async cancelLogin() {
    return account.cancelLogin();
  },
  async logout() {
    return account.logout();
  },
  async listModels(params) {
    return listModels(params).catch((error) => ({
      supported: true,
      error: 'list-failed',
      detail: String((error && error.message) || error).slice(0, 300),
    }));
  },
};

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

input.on('line', (line) => {
  if (!line.trim()) return;
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    replyError(null, -32700, 'Parse error');
    return;
  }
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    replyError(null, -32600, 'Invalid request');
    return;
  }
  const hasId = Object.prototype.hasOwnProperty.call(request, 'id') && request.id !== null;
  if (typeof request.method !== 'string') {
    if (hasId) replyError(request.id, -32600, 'Invalid request');
    return;
  }
  const handler = Object.prototype.hasOwnProperty.call(handlers, request.method) ? handlers[request.method] : null;
  if (!handler) {
    if (hasId) replyError(request.id, -32601, 'Method not found');
    return;
  }
  Promise.resolve()
    .then(() => handler(request.params))
    .then(
      (result) => {
        if (hasId) reply({ jsonrpc: '2.0', id: request.id, result });
      },
      (error) => {
        process.stderr.write(`[agy-acp worker] ${request.method} failed: ${error && error.message ? error.message : error}\n`);
        if (hasId) replyError(request.id, -32603, `Antigravity ${request.method} failed`);
      },
    );
});

input.on('close', () => {
  process.exit(0);
});
