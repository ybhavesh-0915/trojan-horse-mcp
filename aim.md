To design and implement a **Model Context Protocol (MCP) server** that gives an AI
client the ability to execute shell commands, and to **contain that execution inside
a disposable Docker container** so that the commands can be verified from outside
while the host filesystem remains unreachable.

An MCP server is a realistic *trojan-horse* vector: it is installed like any other
developer tool, it runs with the user's privileges, and once connected it can expose
arbitrary capabilities — including a shell — to whatever client is driving it.

This project demonstrates that mechanism **with the blast radius contained**: the
server, the commands it runs, and the files they touch all live inside one container.
Nothing on the host is mounted, so the demonstration can be shown safely.

## What is demonstrated

| # | Claim | How it is shown |
| --- | --- | --- |
| 1 | An MCP server can expose a shell as a tool | `run_command` appears in `tools/list` and executes real commands |
| 2 | The same server works over two transports | stdio (Inspector) and Streamable HTTP (browser) |
| 3 | Commands run inside the container, not the host | `ls /` from the tool and from `docker exec` return identical output |
| 4 | The host filesystem is out of reach | `/INSIDE_CONTAINER.txt` exists in the container only |
| 5 | One command starts the whole demo | `docker compose up` builds, starts, and serves the UI |

## Architecture

![Architecture](https://raw.githubusercontent.com/ybhavesh-0915/trojan-horse-mcp/refs/heads/main/images/architecture.svg)

The browser talks to `server.js` over loopback. `server.js` spawns `bash` **inside the
container**, so every command reads and writes the container filesystem only.
