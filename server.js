#!/usr/bin/env node
/**
 * Minimal MCP server — one file, zero dependencies.
 *
 * Two modes, same file:
 *   node server.js                    stdio  → npx @modelcontextprotocol/inspector node server.js
 *   MCP_TRANSPORT=http node server.js http   → browser UI + /mcp endpoint
 *
 * Exposes a single tool: run_command (bash on this machine / container).
 */

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createInterface } from "node:readline";

const NAME = "local-cmd";
const VERSION = "1.0.0";
const PROTOCOL_VERSIONS = ["2024-11-05", "2025-03-26", "2025-06-18"];
const MAX_OUTPUT_BYTES = 65_536;

const TRANSPORT = (process.env.MCP_TRANSPORT ?? "stdio").toLowerCase();
const HOST = process.env.MCP_HOST ?? "127.0.0.1";
const PORT = Number(process.env.MCP_PORT ?? 7331);

const TOOLS = [
  {
    name: "run_command",
    description:
      "Run a shell command (bash -lc) on the local machine. Returns exit code, stdout and stderr.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Command to run, e.g. `ls -la`" },
      },
      required: ["command"],
    },
  },
];

const log = (...args) => console.error("[local-cmd]", ...args);

// ------------------------------------------------------------------- the tool

function runCommand(command) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn("/bin/bash", ["-lc", command], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const collect = () => {
      const chunks = [];
      let size = 0;
      let truncated = false;
      return {
        push(chunk) {
          if (size >= MAX_OUTPUT_BYTES) {
            truncated = true;
            return;
          }
          const room = MAX_OUTPUT_BYTES - size;
          const buf = chunk.subarray(0, room);
          chunks.push(buf);
          size += buf.length;
          if (buf.length < chunk.length) truncated = true;
        },
        text: () => Buffer.concat(chunks).toString("utf8"),
        get truncated() {
          return truncated;
        },
      };
    };

    const out = collect();
    const err = collect();

    child.stdout.on("data", (c) => out.push(c));
    child.stderr.on("data", (c) => err.push(c));

    const finish = (code, signal, spawnError) => {
      const lines = [
        `$ ${command}`,
        `exit: ${code ?? "killed"}${signal ? ` (${signal})` : ""}`,
        `duration: ${Date.now() - startedAt}ms`,
        out.truncated || err.truncated ? "output: truncated" : null,
        spawnError ? `error: ${spawnError}` : null,
      ].filter(Boolean);

      const body = [
        out.text() && `--- stdout ---\n${out.text()}`,
        err.text() && `--- stderr ---\n${err.text()}`,
      ].filter(Boolean);

      resolve({
        text: lines.join("\n") + (body.length ? `\n\n${body.join("\n")}` : "\n(no output)"),
        isError: Boolean(spawnError),
      });
    };

    child.on("error", (e) => finish(null, null, e.message));
    child.on("close", (code, signal) => finish(code, signal, null));
  });
}

// ------------------------------------------------------------------- protocol

/** Returns a JSON-RPC response object, or null for notifications. */
async function buildResponse(message) {
  const { id, method, params } = message;

  // Notifications carry no id and expect no response.
  if (id === undefined || id === null) return null;

  const result = (value) => ({ jsonrpc: "2.0", id, result: value });
  const error = (code, msg) => ({ jsonrpc: "2.0", id, error: { code, message: msg } });

  switch (method) {
    case "initialize": {
      const requested = params?.protocolVersion;
      return result({
        protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS.at(-1),
        capabilities: { tools: {} },
        serverInfo: { name: NAME, version: VERSION },
      });
    }

    case "ping":
      return result({});

    case "tools/list":
      return result({ tools: TOOLS });

    case "tools/call": {
      if (params?.name !== "run_command") {
        return error(-32602, `Unknown tool: ${params?.name}`);
      }

      const args = params?.arguments ?? {};
      if (typeof args.command !== "string" || args.command.trim() === "") {
        return result({
          content: [{ type: "text", text: "`command` must be a non-empty string." }],
          isError: true,
        });
      }

      const res = await runCommand(args.command);
      return result({ content: [{ type: "text", text: res.text }], isError: res.isError });
    }

    default:
      return error(-32601, `Method not found: ${method}`);
  }
}

// ---------------------------------------------------------------------- stdio

function startStdio() {
  const rl = createInterface({ input: process.stdin, terminal: false });
  let queue = Promise.resolve();

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let message;
    try {
      message = JSON.parse(trimmed);
    } catch {
      log("ignoring malformed JSON line");
      return;
    }

    queue = queue
      .then(async () => {
        const response = await buildResponse(message);
        if (response) process.stdout.write(JSON.stringify(response) + "\n");
      })
      .catch((e) => {
        log("handler error:", e);
        if (message?.id != null) {
          process.stdout.write(
            JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32603, message: "Internal error" } }) + "\n",
          );
        }
      });
  });

  rl.on("close", () => queue.finally(() => process.exit(0)));
  log("ready on stdio — 1 tool (run_command)");
}

// ----------------------------------------------------------------------- http

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, mcp-protocol-version, mcp-session-id",
  "access-control-expose-headers": "mcp-session-id",
};

const readBody = (req, limit = 1_000_000) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > limit) {
        reject(new Error("request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>mcp-cmd</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; background: #0d1117; color: #c9d1d9;
    font: 15px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    display: flex; justify-content: center; padding: 32px 16px;
  }
  main { width: 100%; max-width: 820px; }
  h1 { font-size: 20px; margin: 0 0 4px; color: #e6edf3; letter-spacing: -0.3px; }
  .sub { margin: 0 0 20px; color: #8b949e; font-size: 13px; }
  .ok { color: #3fb950; }
  .err { color: #f85149; }
  .row { display: flex; gap: 8px; }
  input {
    flex: 1; padding: 10px 12px; border-radius: 6px; border: 1px solid #30363d;
    background: #161b22; color: #e6edf3; font: inherit; outline: none;
  }
  input:focus { border-color: #58a6ff; }
  button {
    padding: 10px 16px; border-radius: 6px; border: 1px solid #30363d;
    background: #21262d; color: #e6edf3; font: inherit; cursor: pointer;
  }
  button:hover { background: #30363d; }
  #run { background: #238636; border-color: #2ea043; font-weight: 600; }
  #run:hover { background: #2ea043; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 18px; }
  .chips button { padding: 5px 10px; font-size: 12px; color: #8b949e; }
  pre {
    margin: 0; padding: 14px; border-radius: 6px; border: 1px solid #30363d;
    background: #010409; min-height: 240px; white-space: pre-wrap; word-break: break-word;
  }
</style>
</head>
<body>
<main>
  <h1>mcp-cmd</h1>
  <p class="sub">Commands run inside this container. <span id="status">connecting…</span></p>
  <div class="row">
    <input id="cmd" value="ls -1 /" spellcheck="false" autocomplete="off" autofocus>
    <button id="run">Run</button>
  </div>
  <div class="chips">
    <button data-cmd="ls -1 /">ls /</button>
    <button data-cmd="whoami">whoami</button>
    <button data-cmd="cat /INSIDE_CONTAINER.txt">inside marker</button>
    <button data-cmd="ls /home">ls /home</button>
    <button data-cmd="cat /etc/os-release">os-release</button>
  </div>
  <pre id="out">Press Run.</pre>
</main>
<script>
  var nextId = 1;
  var ready = false;
  var statusEl = document.getElementById('status');
  var out = document.getElementById('out');

  async function rpc(method, params) {
    var res = await fetch('/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method: method, params: params || {} })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var json = await res.json();
    if (json.error) throw new Error(json.error.message);
    return json.result;
  }

  async function init() {
    try {
      var r = await rpc('initialize', {
        protocolVersion: '2025-06-18', capabilities: {},
        clientInfo: { name: 'mcp-cmd-ui', version: '1.0.0' }
      });
      ready = true;
      statusEl.textContent = 'connected to ' + r.serverInfo.name + ' v' + r.serverInfo.version;
      statusEl.className = 'ok';
    } catch (e) {
      statusEl.textContent = 'connect failed: ' + e.message;
      statusEl.className = 'err';
    }
  }

  async function run(cmd) {
    if (!ready) await init();
    out.textContent = '$ ' + cmd + '\\n\\nrunning…';
    try {
      var r = await rpc('tools/call', { name: 'run_command', arguments: { command: cmd } });
      out.textContent = r.content.map(function (c) { return c.text; }).join('\\n');
    } catch (e) {
      out.textContent = 'error: ' + e.message;
    }
  }

  document.getElementById('run').addEventListener('click', function () {
    run(document.getElementById('cmd').value);
  });
  document.getElementById('cmd').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') run(e.target.value);
  });
  document.querySelectorAll('.chips button').forEach(function (b) {
    b.addEventListener('click', function () {
      document.getElementById('cmd').value = b.dataset.cmd;
      run(b.dataset.cmd);
    });
  });
  init().then(function () {
    run(document.getElementById('cmd').value);
  });
</script>
</body>
</html>`;

function startHttp() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const send = (status, body, type = "application/json") => {
      res.writeHead(status, { "content-type": type, ...CORS });
      res.end(body);
    };

    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS);
      return res.end();
    }

    if (url.pathname === "/healthz") {
      return send(200, JSON.stringify({ ok: true, transport: "http", version: VERSION }));
    }

    if (url.pathname === "/" && req.method === "GET") {
      return send(200, PAGE, "text/html; charset=utf-8");
    }

    if (url.pathname !== "/mcp") {
      return send(404, JSON.stringify({ error: "not found" }));
    }

    if (req.method !== "POST") {
      return send(405, JSON.stringify({ error: "use POST" }));
    }

    let message;
    try {
      message = JSON.parse(await readBody(req));
    } catch (e) {
      return send(400, JSON.stringify({ error: e.message }));
    }

    try {
      const response = await buildResponse(message);
      if (!response) {
        res.writeHead(202, CORS);
        return res.end();
      }
      return send(200, JSON.stringify(response));
    } catch (e) {
      log("request failed:", e);
      return send(500, JSON.stringify({ error: "internal error" }));
    }
  });

  server.listen(PORT, HOST, () => {
    log(`ready on http://${HOST}:${PORT} — UI at /, MCP at /mcp`);
  });
}

// ---------------------------------------------------------------------- main

if (TRANSPORT === "http") startHttp();
else if (TRANSPORT === "stdio") startStdio();
else {
  log(`unknown MCP_TRANSPORT: ${TRANSPORT} (use "stdio" or "http")`);
  process.exit(1);
}
