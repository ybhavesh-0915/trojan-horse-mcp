## Requirements

| Tool | Version used | Check |
| --- | --- | --- |
| Docker | 29.x (Compose v2) | `docker compose version` |
| Node.js (optional, for stdio mode) | 22.x | `node -v` |

## Step 1 — Files

```
mcp-cmd/
├── server.js            # MCP server, single file, zero dependencies
├── Dockerfile           # Ubuntu 24.04 + Node 22
├── docker-compose.yml   # one-command startup
└── images/              # screenshot + diagram
```

## Step 2 — Build and start

```bash
docker compose up
```

Compose builds the image, starts the container, and waits until the healthcheck passes.

```
mcp-cmd-mcp-1  | [local-cmd] ready on http://0.0.0.0:7331 — UI at /, MCP at /mcp
```

The port is published as `127.0.0.1:7331` — reachable from this machine only.

## Step 3 — Open the UI

Go to **<http://localhost:7331>**.

![Browser UI](https://raw.githubusercontent.com/ybhavesh-0915/trojan-horse-mcp/refs/heads/main/images/ui.png)

The page connects to `/mcp`, calls `initialize`, then `tools/list`, and runs `ls -1 /`
through `run_command`. The header confirms the connection:
`connected to local-cmd v1.0.0`.

Try the quick buttons — `whoami`, `inside marker`, `ls /home`, `os-release` — or type
any command and press **Enter**.

## Step 4 — Verify the container boundary

In a second terminal, enter the **same** container the tool is using:

```bash
docker compose exec mcp bash
```

Now compare what each side sees.

| Command | Through the tool | Through `docker exec` |
| --- | --- | --- |
| `ls -1 /` | image root of Ubuntu 24.04 | identical |
| `whoami` | `root` | `root` |
| `ls /home` | `ubuntu` | `ubuntu` |
| `cat /INSIDE_CONTAINER.txt` | `This is the Ubuntu container, not your host.` | identical |

The decisive check is the marker file:

```bash
cat /INSIDE_CONTAINER.txt     # inside the container: exists
```

```bash
cat /INSIDE_CONTAINER.txt     # on the host: No such file or directory
```

Because the host filesystem is not mounted, the tool cannot read or write anything of
yours — `ls /` is the container's root, and the host's home directory is not present.

## Step 5 — Use the MCP Inspector (optional)

The same server also speaks stdio, so the official Inspector can drive it:

```bash
npx @modelcontextprotocol/inspector --transport http \
  --server-url http://localhost:7331/mcp
```

Or over stdio, without Compose:

```bash
npx @modelcontextprotocol/inspector node server.js
```

In both cases the Inspector opens at `http://localhost:6274`; click **Connect**, then
**Tools → List Tools → run_command → Run**.

## Step 6 — Stop and clean up

```bash
docker compose down
```

The container is removed. Anything created inside it — files, packages, changes — is
gone with it, which is the point of the demonstration.

## Observation

| Observation | Result |
| --- | --- |
| `tools/list` count | 1 (`run_command`) |
| Transport used by the UI | Streamable HTTP, `POST /mcp` |
| Transport used by Inspector (stdio mode) | stdio, newline-delimited JSON |
| Tool output vs `docker exec` output | identical |
| Host files visible inside the container | none |
| Commands surviving `docker compose down` | none |
