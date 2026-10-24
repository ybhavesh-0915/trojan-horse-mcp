1. **Implement an MCP server from scratch** — JSON-RPC 2.0 over stdio, without using
   the official SDK, to show that the protocol is small enough to read in one file.

2. **Expose shell execution as a single tool** — `run_command`, with a JSON Schema
   input, that returns exit code, stdout and stderr.

3. **Support both MCP transports** — stdio for the MCP Inspector, Streamable HTTP for
   a browser UI served by the same process.

4. **Containerise the server on Ubuntu 24.04** — with Node.js 22, since the Ubuntu
   archive ships Node 18, which cannot load an ES module entry point.

5. **Make the demo one command** — `docker compose up` must build the image, start the
   container, and serve the UI on `http://localhost:7331` without further steps.

6. **Prove the containment** — the same `ls -1 /` executed through the tool and through
   `docker exec` must produce identical output, and a container-only marker file must
   be invisible on the host.

7. **Document the work** — aim, theory, objectives, procedure and references, with a
   real screenshot and an architecture diagram.

## Expected outcomes

| Objective | Success criterion |
| --- | --- |
| 1 | `server.js` runs with `node server.js` and no `node_modules` |
| 2 | `tools/list` returns exactly one tool with an input schema |
| 3 | `POST /mcp` returns a valid `initialize` result; stdio mode still works |
| 4 | `node -v` inside the image prints `v22.x` |
| 5 | `docker compose up` → `http://localhost:7331` responds `200` |
| 6 | tool output and `docker exec` output are byte-identical |
| 7 | all five documents render on GitHub with images |
