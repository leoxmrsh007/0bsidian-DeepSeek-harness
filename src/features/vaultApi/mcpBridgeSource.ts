/**
 * Source of the self-contained stdio MCP proxy that DSH spawns.
 *
 * The proxy reads the bridge settings (port + token) from the plugin's
 * data.json inside the vault, exposes a read-only `vault_*` tool set over
 * MCP stdio, and forwards `tools/call` to the plugin's loopback HTTP server.
 *
 * The script is intentionally dependency-free and embedded as a string so the
 * plugin can materialize it into its own directory at runtime. It must not
 * use template literals or backticks (the enclosing TS template literal).
 */

export const MCP_BRIDGE_SCRIPT_SOURCE = `'use strict';
// DeepSeek Vault Harness read-only MCP bridge.
// Spawned by DSH via .cordis.yml; talks to the Obsidian plugin over loopback.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

function argValue(name, def) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return def;
}

const vaultBase = argValue('--vault', process.env.OBSIDIAN_VAULT_PATH || process.cwd());
const portOverride = Number(argValue('--port', '0')) || 0;

function pluginDataPath() {
  return path.join(vaultBase, '.obsidian', 'plugins', 'deepseek-vault-harness', 'data.json');
}

function loadBridgeConfig() {
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(pluginDataPath(), 'utf8'));
  } catch (err) {
    return { error: 'cannot read plugin data.json: ' + (err && err.message ? err.message : String(err)) };
  }
  const cfg = (data && typeof data === 'object' && data.vaultApi) || {};
  if (cfg.enabled !== true) return { error: 'vault bridge is disabled in plugin settings' };
  if (typeof cfg.token !== 'string' || cfg.token.length < 32) return { error: 'vault bridge token missing' };
  const port = portOverride || cfg.port || 3081;
  return { port: port, token: cfg.token, url: 'http://127.0.0.1:' + port };
}

function callVault(url, token, method, payload) {
  return new Promise(function (resolve, reject) {
    const body = JSON.stringify({
      type: 'client-request',
      rpcId: 'bridge-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10),
      method: method,
      payload: payload || {},
    });
    const u = new URL(url + '/api/' + method);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'X-DSH-Vault-Token': token,
        },
        timeout: 30000,
      },
      function (res) {
        const chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed;
          try { parsed = JSON.parse(text); } catch (e) { reject(new Error('invalid vault response')); return; }
          const err = parsed && parsed.result && parsed.result.error;
          if (parsed && parsed.result && parsed.result.ok === true) {
            resolve(parsed.result.value);
          } else if (err) {
            const e = new Error(err.message || 'vault request failed');
            e.code = err.code;
            e.confirmId = err.confirmId;
            e.preview = err.preview;
            reject(e);
          } else {
            reject(new Error('vault request failed'));
          }
        });
      },
    );
    req.on('timeout', function () { req.destroy(new Error('vault request timed out')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const TOOLS = [
  { name: 'vault_capabilities', description: 'Describe the Obsidian vault and the bridge API surface (read-only).', inputSchema: { type: 'object', properties: {} } },
  { name: 'vault_list', description: 'List files in a vault folder (read-only).', inputSchema: { type: 'object', properties: { dir: { type: 'string' }, limit: { type: 'integer' } } } },
  { name: 'vault_read', description: 'Read a note by vault-relative path (read-only).', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'vault_search', description: 'Search note contents for a query (read-only).', inputSchema: { type: 'object', properties: { query: { type: 'string' }, dir: { type: 'string' }, limit: { type: 'integer' }, context: { type: 'integer' } }, required: ['query'] } },
  { name: 'vault_backlinks', description: 'List notes linking to a given note (read-only).', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'vault_tags', description: 'List tags and their counts (read-only).', inputSchema: { type: 'object', properties: { dir: { type: 'string' } } } },
  { name: 'vault_frontmatter_get', description: 'Read a note\\'s YAML frontmatter (read-only).', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'vault_write', description: 'Write a note. Requires explicit approval in Obsidian.', inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
  { name: 'vault_append', description: 'Append text to a note. Requires explicit approval in Obsidian.', inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
  { name: 'vault_delete', description: 'Delete (trash) a note. Requires explicit approval in Obsidian.', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'vault_move', description: 'Move or rename a note. Requires explicit approval in Obsidian.', inputSchema: { type: 'object', properties: { path: { type: 'string' }, to: { type: 'string' } }, required: ['path', 'to'] } },
  { name: 'vault_frontmatter_set', description: 'Set a YAML frontmatter field. Requires explicit approval in Obsidian.', inputSchema: { type: 'object', properties: { path: { type: 'string' }, key: { type: 'string' }, value: {} }, required: ['path', 'key'] } },
  { name: 'vault_frontmatter_delete', description: 'Delete a YAML frontmatter field. Requires explicit approval in Obsidian.', inputSchema: { type: 'object', properties: { path: { type: 'string' }, key: { type: 'string' } }, required: ['path', 'key'] } },
];

function methodFor(name) {
  const map = {
    vault_capabilities: 'vault.capabilities',
    vault_list: 'vault.list',
    vault_read: 'vault.read',
    vault_search: 'vault.search',
    vault_backlinks: 'vault.backlinks',
    vault_tags: 'vault.tags',
    vault_frontmatter_get: 'vault.frontmatter.get',
    vault_write: 'vault.write',
    vault_append: 'vault.append',
    vault_delete: 'vault.delete',
    vault_move: 'vault.move',
    vault_frontmatter_set: 'vault.frontmatter.set',
    vault_frontmatter_delete: 'vault.frontmatter.delete',
  };
  return map[name] || null;
}

function describeError(err) {
  if (err && err.code === 'pending-confirmation') {
    return 'A write was requested and is awaiting your approval inside Obsidian.\\nConfirmation ID: ' + err.confirmId + '\\nPreview:\\n' + (err.preview || '');
  }
  return (err && err.message) || String(err);
}

function textResult(text, isError) {
  return { content: [{ type: 'text', text: text }], isError: isError === true };
}

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\\n');
}

let config = null;

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', function (line) {
  let msg;
  try { msg = JSON.parse(line); } catch (e) { return; }
  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: '2025-03-26',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'obsidian-vault-bridge', version: '0.3.0' },
      },
    });
    return;
  }
  if (msg.method === 'notifications/initialized') return;
  if (msg.method === 'ping') { send({ jsonrpc: '2.0', id: msg.id, result: {} }); return; }
  if (msg.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } });
    return;
  }
  if (msg.method === 'tools/call') {
    if (!config) config = loadBridgeConfig();
    if (config.error) {
      send({ jsonrpc: '2.0', id: msg.id, result: textResult(config.error, true) });
      return;
    }
    const name = msg.params && msg.params.name;
    const method = methodFor(name);
    if (!method) {
      send({ jsonrpc: '2.0', id: msg.id, result: textResult('unknown tool: ' + name, true) });
      return;
    }
    callVault(config.url, config.token, method, (msg.params && msg.params.arguments) || {})
      .then(function (value) {
        send({ jsonrpc: '2.0', id: msg.id, result: textResult(JSON.stringify(value), false) });
      })
      .catch(function (err) {
        send({ jsonrpc: '2.0', id: msg.id, result: textResult(describeError(err), true) });
      });
    return;
  }
  send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'method not found' } });
});
`;

export const MCP_BRIDGE_SCRIPT_FILENAME = 'mcp-bridge.cjs';
