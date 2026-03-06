/**
 * ProductClank MCP Server
 *
 * Remote MCP server that exposes ProductClank Communiply tools
 * as a Claude custom connector via Streamable HTTP transport.
 *
 * Architecture:
 *   Claude ←→ MCP Server (this) ←→ ProductClank REST API (existing)
 *                  ↕
 *            OAuth 2.1 Server
 */

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools } from "./tools/index.js";
import { createOAuthRoutes } from "./auth/oauth-metadata.js";
import { createOAuthEndpoints } from "./auth/oauth-endpoints.js";
import { config } from "./config.js";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── OAuth well-known endpoints ──────────────────────────────
app.use(createOAuthRoutes());
app.use(createOAuthEndpoints());

// ─── MCP Server setup ────────────────────────────────────────

// Store transports by session ID
const transports = new Map<string, StreamableHTTPServerTransport>();

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "ProductClank",
    version: "0.1.0",
  });

  registerTools(server);
  return server;
}

// ─── Streamable HTTP MCP endpoint ────────────────────────────

// POST /mcp — Client sends JSON-RPC messages
app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId && transports.has(sessionId)) {
    // Existing session — route to its transport
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res, req.body);
  } else if (!sessionId) {
    // New session — create server + transport
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (newSessionId) => {
        transports.set(newSessionId, transport);
      },
    });

    transport.onclose = () => {
      const sid = [...transports.entries()].find(
        ([, t]) => t === transport
      )?.[0];
      if (sid) transports.delete(sid);
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } else {
    // Session ID provided but not found — client should re-initialize
    res.status(404).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Session not found. Please re-initialize." },
      id: null,
    });
  }
});

// GET /mcp — Optional SSE stream for server-initiated messages
app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ error: "Missing or invalid session ID" });
    return;
  }

  const transport = transports.get(sessionId)!;
  await transport.handleRequest(req, res);
});

// DELETE /mcp — Terminate session
app.delete("/mcp", (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId && transports.has(sessionId)) {
    const transport = transports.get(sessionId)!;
    transport.close();
    transports.delete(sessionId);
    res.status(200).json({ message: "Session terminated" });
  } else {
    res.status(404).json({ error: "Session not found" });
  }
});

// ─── Health check ────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", version: "0.1.0", sessions: transports.size });
});

// ─── Start server ────────────────────────────────────────────
app.listen(config.port, () => {
  console.log(`ProductClank MCP Server running on port ${config.port}`);
  console.log(`MCP endpoint: ${config.mcpServerUrl}/mcp`);
  console.log(`OAuth metadata: ${config.mcpServerUrl}/.well-known/oauth-authorization-server`);
});
