/**
 * ProductClank MCP Server
 *
 * Remote MCP server exposing ProductClank "boost" tools as a custom connector
 * for Claude and ChatGPT (and any spec-compliant MCP client) over Streamable
 * HTTP, with an OAuth 2.1 authorization server that delegates end-user login to
 * the ProductClank webapp.
 *
 *   Claude / ChatGPT  ←→  MCP server (this)  ←→  ProductClank REST API (trusted key)
 *                     ↕
 *               OAuth 2.1 AS  ──▶  webapp /connect/mcp (login + consent)
 */

import crypto from "node:crypto";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { registerTools, type ToolProfile } from "./tools/index.js";
import { createOAuthRoutes } from "./auth/oauth-metadata.js";
import { createOAuthEndpoints } from "./auth/oauth-endpoints.js";
import { tokenVerifier } from "./auth/verifier.js";
import { config, assertRuntimeConfig, SERVER_VERSION } from "./config.js";
import { shutdownAnalytics } from "./lib/analytics.js";

assertRuntimeConfig();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── OAuth metadata + endpoints (public — no bearer required) ──────────────
app.use(createOAuthRoutes());
app.use(createOAuthEndpoints());

// ─── MCP server / transports ───────────────────────────────────────────────
//
// The server serves the SAME MCP implementation at two URLs, each with its own
// tool profile (see src/tools/index.ts):
//
//   /mcp      → profile "full"    — every tool. Claude, ChatGPT, the registry.
//   /creator  → profile "creator" — creator campaigns only (no boost_post),
//                                   the endpoint submitted to Meta's Muse
//                                   connector directory.
//
// Each endpoint keeps its OWN session state. Session ids are globally unique,
// so one shared map would work for lookups — but the profile has to be
// remembered for the life of a session, and per-endpoint maps make that
// unambiguous (a session created on /creator can never be resumed on /mcp).
// Everything else — bearer auth, the in-flight bookkeeping, the idle sweep and
// the JSON-only Accept shim — is identical for both.

interface McpEndpoint {
  readonly profile: ToolProfile;
  /** URL path this endpoint is mounted at, e.g. "/mcp". */
  readonly path: string;
  readonly transports: Map<string, StreamableHTTPServerTransport>;
  /** Last time (epoch ms) each session serviced a request, for idle cleanup. */
  readonly lastSeenAt: Map<string, number>;
  /**
   * Requests currently executing per session. A tool call can outlive the idle
   * TTL (discovery runs take minutes), and closing its transport mid-flight
   * means the client never receives a response — it just waits forever. Idle
   * means "nothing running and nothing recent", never "started a while ago".
   */
  readonly inFlight: Map<string, number>;
}

function createEndpointState(profile: ToolProfile, path: string): McpEndpoint {
  return {
    profile,
    path,
    transports: new Map(),
    lastSeenAt: new Map(),
    inFlight: new Map(),
  };
}

function touchSession(ep: McpEndpoint, sessionId: string): void {
  ep.lastSeenAt.set(sessionId, Date.now());
}

function beginRequest(ep: McpEndpoint, sessionId: string): void {
  touchSession(ep, sessionId);
  ep.inFlight.set(sessionId, (ep.inFlight.get(sessionId) ?? 0) + 1);
}

function endRequest(ep: McpEndpoint, sessionId: string): void {
  const remaining = (ep.inFlight.get(sessionId) ?? 1) - 1;
  if (remaining > 0) ep.inFlight.set(sessionId, remaining);
  else ep.inFlight.delete(sessionId);
  // Stamp on completion too: a 4-minute call should leave the session looking
  // fresh for the full TTL afterwards, not already 4 minutes stale.
  touchSession(ep, sessionId);
}

function forgetSession(ep: McpEndpoint, sessionId: string): void {
  ep.transports.delete(sessionId);
  ep.lastSeenAt.delete(sessionId);
  ep.inFlight.delete(sessionId);
}

// Close transports idle longer than the configured TTL. Unauthenticated
// discovery clients (health checks, glama.ai, directory reviewers) open a
// session via initialize and rarely send a DELETE to close it, so without this
// sweep those transports — each holding an McpServer instance — would leak
// until the process restarts. Sweeps EVERY mounted endpoint.
function sweepIdleSessions(endpoints: readonly McpEndpoint[]): void {
  const now = Date.now();
  let swept = 0;
  for (const ep of endpoints) {
    const stale: string[] = [];
    for (const [sessionId] of ep.transports) {
      if (ep.inFlight.get(sessionId)) continue; // work in progress — never sweep
      if (now - (ep.lastSeenAt.get(sessionId) ?? 0) > config.session.idleTtlMs) {
        stale.push(sessionId);
      }
    }
    for (const sessionId of stale) {
      const transport = ep.transports.get(sessionId);
      forgetSession(ep, sessionId);
      try {
        transport?.close();
      } catch {
        // Already closing/closed — nothing to do.
      }
    }
    swept += stale.length;
  }
  if (swept > 0) {
    console.log(`Swept ${swept} idle MCP session(s)`);
  }
}

function createMcpServer(profile: ToolProfile): McpServer {
  const server = new McpServer({ name: "ProductClank", version: SERVER_VERSION });
  registerTools(server, profile);
  return server;
}

// Enforce a valid access token on every MCP request. On missing/invalid tokens
// this returns 401 with a WWW-Authenticate challenge pointing at the resource
// metadata, which is how Claude discovers it must run the OAuth flow. The
// metadata URL is per-endpoint: each mount point is its own OAuth protected
// resource (RFC 9728 §3.1), served by createOAuthRoutes().
function createBearerAuth(path: string): express.RequestHandler {
  return requireBearerAuth({
    verifier: tokenVerifier,
    resourceMetadataUrl: `${config.oauth.issuer}/.well-known/oauth-protected-resource${path}`,
  });
}

// Discovery / handshake methods that carry no user identity and do nothing on
// the user's behalf. Allowing these unauthenticated lets any client — including
// automated directory health checks (e.g. glama.ai) — introspect the tool list
// without completing the OAuth flow. Every method that acts on a user's data
// (tools/call, …) still requires a valid access token, and each tool also
// defends itself via getUserId(...) → NOT_AUTHED, so this only exposes the
// public tool catalog, never any account or credit action.
//
// It is also exactly why the creator profile is a separate URL rather than a
// per-OAuth-client filter: a reviewer can reach tools/list before any client
// identity exists, so only the URL can decide what they see.
const PUBLIC_MCP_METHODS = new Set([
  "initialize",
  "ping",
  "tools/list",
  "prompts/list",
  "resources/list",
  "resources/templates/list",
]);

function isPublicMcpMessage(msg: unknown): boolean {
  if (!msg || typeof msg !== "object") return false;
  const method = (msg as { method?: unknown }).method;
  if (typeof method !== "string") return false;
  return method.startsWith("notifications/") || PUBLIC_MCP_METHODS.has(method);
}

// Runs bearer auth on every MCP POST EXCEPT pure discovery requests. Fails
// closed: a request skips auth only when it is non-empty and *every* JSON-RPC
// message in it (single or batch) is a public method — so a batch that smuggles
// a tools/call alongside an initialize is still gated.
function createBearerAuthUnlessDiscovery(
  bearerAuth: express.RequestHandler
): express.RequestHandler {
  return (req, res, next) => {
    const messages = Array.isArray(req.body) ? req.body : [req.body];
    const allPublic = messages.length > 0 && messages.every(isPublicMcpMessage);
    if (allPublic) return next();
    return bearerAuth(req, res, next);
  };
}

// Some minimal HTTP clients — Meta's Muse directory test harness among them —
// send `Accept: application/json` with no `text/event-stream`. The SDK 406s
// that unconditionally (the spec says clients MUST list both), even in its
// JSON-response mode. So: for such a request we (1) widen the Accept header
// before the SDK sees it and (2) open the session's transport in
// `enableJsonResponse` mode, so every POST in that session answers with a plain
// JSON body instead of an SSE stream. Sessions opened by SSE-capable clients
// (Claude, ChatGPT, the official SDK) are untouched. None of our tools emit
// notifications mid-call, so JSON mode loses nothing for the JSON-only client.
function wantsJsonOnly(req: express.Request): boolean {
  const accept = req.headers.accept ?? "";
  return accept.includes("application/json") && !accept.includes("text/event-stream");
}

// The SDK hands the request to Hono's Node adapter, which rebuilds the web
// `Request` from `rawHeaders`, not from the parsed `headers` object — so both
// must be rewritten or the SDK still sees the original Accept value.
const WIDENED_ACCEPT = "application/json, text/event-stream";
function widenAcceptHeader(req: express.Request): void {
  req.headers.accept = WIDENED_ACCEPT;
  const raw = req.rawHeaders;
  for (let i = 0; i + 1 < raw.length; i += 2) {
    if (raw[i].toLowerCase() === "accept") {
      raw[i + 1] = WIDENED_ACCEPT;
      return;
    }
  }
  raw.push("Accept", WIDENED_ACCEPT);
}

/**
 * Mount POST/GET/DELETE for one MCP endpoint and return its session state, so
 * the sweep timer and /health can see it. Every endpoint gets identical
 * transport behaviour; only the tool profile and the URL differ.
 */
function mountMcpEndpoint(profile: ToolProfile, path: string): McpEndpoint {
  const ep = createEndpointState(profile, path);
  const bearerAuth = createBearerAuth(path);
  const bearerAuthUnlessDiscovery = createBearerAuthUnlessDiscovery(bearerAuth);

  app.post(path, bearerAuthUnlessDiscovery, async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const jsonOnly = wantsJsonOnly(req);
    if (jsonOnly) widenAcceptHeader(req);

    if (sessionId && ep.transports.has(sessionId)) {
      beginRequest(ep, sessionId);
      try {
        await ep.transports.get(sessionId)!.handleRequest(req, res, req.body);
      } finally {
        endRequest(ep, sessionId);
      }
      return;
    }

    if (!sessionId) {
      // New session — create server + transport for THIS endpoint's profile.
      const server = createMcpServer(ep.profile);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        enableJsonResponse: jsonOnly,
        onsessioninitialized: (newSessionId) => {
          ep.transports.set(newSessionId, transport);
          touchSession(ep, newSessionId);
        },
      });
      transport.onclose = () => {
        const sid = [...ep.transports.entries()].find(
          ([, t]) => t === transport
        )?.[0];
        if (sid) forgetSession(ep, sid);
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

  app.get(path, bearerAuth, async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !ep.transports.has(sessionId)) {
      res.status(400).json({ error: "Missing or invalid session ID" });
      return;
    }
    beginRequest(ep, sessionId);
    try {
      await ep.transports.get(sessionId)!.handleRequest(req, res);
    } finally {
      endRequest(ep, sessionId);
    }
  });

  app.delete(path, bearerAuth, (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId && ep.transports.has(sessionId)) {
      const transport = ep.transports.get(sessionId)!;
      forgetSession(ep, sessionId);
      transport.close();
      res.status(200).json({ message: "Session terminated" });
      return;
    }
    res.status(404).json({ error: "Session not found" });
  });

  return ep;
}

const endpoints: readonly McpEndpoint[] = [
  mountMcpEndpoint("full", "/mcp"),
  mountMcpEndpoint("creator", "/creator"),
];

const sessionSweepTimer = setInterval(
  () => sweepIdleSessions(endpoints),
  config.session.sweepIntervalMs
);
// Don't let the sweep timer keep the process alive on shutdown.
sessionSweepTimer.unref();

// ─── Health check ──────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  // `telemetry` answers the question that cost an afternoon to diagnose: is
  // this process actually configured to emit? Capture is fire-and-forget, so a
  // missing or wrong key is indistinguishable from "nobody used the connector"
  // without container logs. `key_kind` catches the specific mistake of pasting
  // a personal key (phx_) where a project key (phc_) belongs — it reports the
  // SHAPE of the value, never the value.
  //
  // `sessions` stays a NUMBER — the total across every mounted endpoint — so
  // any existing monitor that reads it keeps working; the per-profile split
  // goes in the additive `sessions_by_profile` object.
  const apiKey = config.posthog.apiKey;
  res.json({
    status: "ok",
    version: SERVER_VERSION,
    sessions: endpoints.reduce((n, ep) => n + ep.transports.size, 0),
    sessions_by_profile: Object.fromEntries(
      endpoints.map((ep) => [ep.profile, ep.transports.size])
    ),
    telemetry: apiKey ? "on" : "off",
    ...(apiKey
      ? { key_kind: apiKey.startsWith("phc_") ? "project" : "not-a-project-key" }
      : {}),
  });
});

// ─── Glama connector-ownership proof ───────────────────────────────────────
// Glama verifies claim of the registry-synced connector listing
// (glama.ai/mcp/connectors/com.productclank/productclank) by fetching this
// file from the server's own domain — the HTTP challenge.
//
// This MUST stay published: Glama re-checks it, and removing the file silently
// un-claims the listing (losing the admin panel, analytics, and the ability to
// disable a tool at the gateway). The token is account-bound and carries no
// personal information, so it is safe in source.
//
// The previous `maintainers: [{ email }]` form is deprecated in Glama's schema
// and never completed a claim; the opaque token replaces it.
app.get("/.well-known/glama.json", (_req, res) => {
  res.json({
    $schema: "https://glama.ai/mcp/schemas/connector.json",
    claim: "glama_claim_UGeNRXW0l-RtY0YtZUMGhK9qWOdH0mpW",
  });
});

// Flush buffered analytics before the container goes away (Railway redeploys
// send SIGTERM); exit even if the flush hangs.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    void shutdownAnalytics().finally(() => process.exit(0));
  });
}

app.listen(config.port, () => {
  console.log(`ProductClank MCP server listening on :${config.port}`);
  for (const ep of endpoints) {
    console.log(
      `  MCP endpoint:   ${config.mcpServerUrl}${ep.path}  (profile: ${ep.profile})`
    );
  }
  console.log(
    `  OAuth metadata: ${config.oauth.issuer}/.well-known/oauth-authorization-server`
  );
});
