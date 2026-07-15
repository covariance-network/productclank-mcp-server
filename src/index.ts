/**
 * ProductClank MCP Server
 *
 * Remote MCP server exposing ProductClank "boost" tools as a Claude custom
 * connector over Streamable HTTP, with an OAuth 2.1 authorization server that
 * delegates end-user login to the ProductClank webapp.
 *
 *   Claude  ←→  MCP server (this)  ←→  ProductClank REST API (trusted agent key)
 *                     ↕
 *               OAuth 2.1 AS  ──▶  webapp /connect/mcp (login + consent)
 */

import crypto from "node:crypto";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { registerTools } from "./tools/index.js";
import { createOAuthRoutes } from "./auth/oauth-metadata.js";
import { createOAuthEndpoints } from "./auth/oauth-endpoints.js";
import { tokenVerifier } from "./auth/verifier.js";
import { config, assertRuntimeConfig } from "./config.js";

assertRuntimeConfig();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── OAuth metadata + endpoints (public — no bearer required) ──────────────
app.use(createOAuthRoutes());
app.use(createOAuthEndpoints());

// ─── MCP server / transport ────────────────────────────────────────────────
const transports = new Map<string, StreamableHTTPServerTransport>();

function createMcpServer(): McpServer {
  const server = new McpServer({ name: "ProductClank", version: "0.3.0" });
  registerTools(server);
  return server;
}

// Enforce a valid access token on every /mcp request. On missing/invalid tokens
// this returns 401 with a WWW-Authenticate challenge pointing at the resource
// metadata, which is how Claude discovers it must run the OAuth flow.
const bearerAuth = requireBearerAuth({
  verifier: tokenVerifier,
  resourceMetadataUrl: `${config.oauth.issuer}/.well-known/oauth-protected-resource`,
});

app.post("/mcp", bearerAuth, async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId && transports.has(sessionId)) {
    await transports.get(sessionId)!.handleRequest(req, res, req.body);
    return;
  }

  if (!sessionId) {
    // New session — create server + transport.
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
    return;
  }

  res.status(404).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Session not found. Please re-initialize." },
    id: null,
  });
});

app.get("/mcp", bearerAuth, async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ error: "Missing or invalid session ID" });
    return;
  }
  await transports.get(sessionId)!.handleRequest(req, res);
});

app.delete("/mcp", bearerAuth, (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (sessionId && transports.has(sessionId)) {
    const transport = transports.get(sessionId)!;
    transport.close();
    transports.delete(sessionId);
    res.status(200).json({ message: "Session terminated" });
    return;
  }
  res.status(404).json({ error: "Session not found" });
});

// ─── Health check ──────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", version: "0.3.0", sessions: transports.size });
});

app.listen(config.port, () => {
  console.log(`ProductClank MCP server listening on :${config.port}`);
  console.log(`  MCP endpoint:   ${config.mcpServerUrl}/mcp`);
  console.log(
    `  OAuth metadata: ${config.oauth.issuer}/.well-known/oauth-authorization-server`
  );
});
