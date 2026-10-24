1. **[Model Context Protocol — Specification (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18)**
   Normative reference for the lifecycle, tools and transports used here.

2. **[MCP — Introduction](https://modelcontextprotocol.io/docs/getting-started/intro)**
   Conceptual overview of hosts, clients and servers.

3. **[MCP — Transports](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)**
   Difference between stdio and Streamable HTTP.

4. **[MCP — Tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)**
   `tools/list`, `tools/call`, input schemas and result shape.

5. **[JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)**
   The message format implemented in `server.js`.

6. **[MCP Inspector](https://github.com/modelcontextprotocol/inspector)**
   The browser client used to list and call the tool.

7. **[MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)**
   The library this project deliberately avoids, to keep the server dependency-free.

8. **[Node.js v22 API documentation](https://nodejs.org/docs/latest-v22.x/api/)**
   `child_process`, `readline` and `http` modules used by the server.

9. **[Docker — Engine security](https://docs.docker.com/engine/security/)**
   Namespaces, cgroups and capabilities: why the container boundary holds.

10. **[Docker Compose — Overview](https://docs.docker.com/compose/)**
    The single-command startup used in this project.

11. **[Ubuntu 24.04 LTS release notes](https://releases.ubuntu.com/24.04/)**
    Base image; note that its archive provides Node.js 18, hence the Node 22 tarball.

12. **[OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/)**
    Risks that arise when a model is given real capabilities.

13. **[OWASP — LLM06: Excessive Agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/)**
    Why a tool that can run arbitrary commands must be scoped by the process boundary.

14. **[MITRE ATT&CK — T1195: Supply Chain Compromise](https://attack.mitre.org/techniques/T1195/)**
    Background on why installing a server is a trust decision.
