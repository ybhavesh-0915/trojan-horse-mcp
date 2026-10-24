## 1. Model Context Protocol (MCP)

MCP is an open protocol that standardises how an AI application (**host**) talks to
external capabilities (**servers**) through a **client** that lives in the host.

```
Host (Claude Desktop / Inspector / IDE)
  └── MCP client  ⇄  MCP server  →  tools, resources, prompts
```

The protocol is **JSON-RPC 2.0**. Every exchange is a request/response pair (or a
one-way notification), which keeps it transport-agnostic: the same messages travel
over a child process's stdin/stdout or over HTTP.

### Lifecycle

| Step | Message | Purpose |
| --- | --- | --- |
| 1 | `initialize` | exchange protocol version and capabilities |
| 2 | `notifications/initialized` | client confirms it is ready |
| 3 | `tools/list` | server advertises its tools and JSON Schemas |
| 4 | `tools/call` | client invokes a tool with arguments |
| 5 | `tools/call` result | `content[]` array plus an optional `isError` flag |

A tool is described by a name, a description, and an **input schema**. That schema is
what the model reads when deciding whether and how to call the tool — it is also the
first place a malicious server can hide something dangerous.

### Transports

| Transport | How it works | Used here for |
| --- | --- | --- |
| **stdio** | host spawns the server as a child process; newline-delimited JSON on stdin/stdout | MCP Inspector, any desktop client |
| **Streamable HTTP** | server listens on a URL; each POST carries one JSON-RPC message | the built-in browser UI, remote Inspector |

## 2. Why an MCP server is a "trojan horse"

A trojan horse is code that looks legitimate, is trusted enough to be installed, and
then acts on the installer's machine. An MCP server fits that shape unusually well:

- it is installed like ordinary developer tooling (`npx`, a config entry, a container);
- it inherits the user's privileges and environment;
- it declares its own tool list, so the model has no independent way to audit it;
- a single tool named `run_command` is enough to read files, exfiltrate secrets, or
  install persistence — and the model will happily call it if asked.

The practical lesson is **least privilege at the process boundary**: assume the server
may be hostile, and decide what it can reach *before* it runs. Containers make that
decision explicit and reversible.

## 3. Container isolation

A container is a normal Linux process with three restrictions applied by the kernel:

| Mechanism | Effect |
| --- | --- |
| **namespaces** | the process gets its own view of PIDs, mounts, network, hostname |
| **cgroups** | CPU, memory and process count are capped |
| **filesystem layers** | the image is read-only; writes go to a throwaway layer |

Consequences used in this project:

- `ls /` shows the **image's** root, not the host's.
- Files created at runtime disappear when the container is removed.
- The host's `~/Desktop` is only visible if it is explicitly bind-mounted — and here
  it is not.

## 4. How this project maps to the theory

| Concept | Implementation |
| --- | --- |
| JSON-RPC 2.0 | hand-written in `server.js` — no SDK, no dependencies |
| `initialize` / `tools/list` / `tools/call` | `buildResponse()` switch statement |
| stdio transport | `readline` over `process.stdin`, one JSON object per line |
| Streamable HTTP transport | `node:http` server, `POST /mcp`, JSON responses |
| Tool execution | `spawn('/bin/bash', ['-lc', command])` |
| Containment | Docker: Ubuntu 24.04 image, no host mount, loopback-only port |
| Verification | `ls /` compared between `run_command` and `docker exec` |

## 5. Limitations of this model

- A container is **not** a virtual machine; a kernel vulnerability is out of scope.
- The demo container runs as **root** for convenience. A production server should use
  an unprivileged user, dropped capabilities, a read-only root filesystem, and no
  network.
- The HTTP endpoint has **no authentication**. It is bound to `127.0.0.1` and intended
  for a local demo only.
