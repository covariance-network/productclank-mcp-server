/**
 * OAuth 2.1 metadata endpoints required by the MCP authorization spec.
 *
 *  /.well-known/oauth-protected-resource   (RFC 9728) — points clients at the AS
 *  /.well-known/oauth-authorization-server (RFC 8414) — advertises AS capabilities
 *
 * Each document is served at BOTH the root path AND the resource-path-suffixed
 * path (…/mcp, …/creator). The MCP resources live at `${mcpServerUrl}/mcp` and
 * `${mcpServerUrl}/creator`, so per RFC 9728 §3.1 / RFC 8414 §3 a strict client
 * derives the metadata URL by inserting the resource path — e.g.
 * `/.well-known/oauth-protected-resource/mcp`. Claude (and VS Code/Copilot)
 * tolerate a missing suffix by falling back to the root path, but ChatGPT's
 * connector fetches the suffixed URL first and fails the connect if it 404s.
 * Serving both makes the connector discoverable from every spec-compliant
 * client, Claude and ChatGPT alike.
 *
 * The protected-resource document IS endpoint-specific: its `resource` value
 * must equal the URL the client connected to, so /mcp and /creator each get
 * their own document. The authorization-server document is shared — one AS
 * backs both endpoints, with the same clients, scopes and tokens. The root
 * (unsuffixed) protected-resource path keeps answering for /mcp, which is what
 * every client connected to it already expects.
 */

import { Router } from "express";
import { config } from "../config.js";

/**
 * The MCP endpoints this server exposes, each its own OAuth protected
 * resource. "/mcp" = full tool profile; "/creator" = creator-campaign profile
 * (see src/tools/index.ts). Keep in sync with the mounts in src/index.ts.
 */
const MCP_ENDPOINT_PATHS = ["/mcp", "/creator"] as const;

/**
 * Canonical resource identifier for one MCP endpoint: the endpoint URL itself,
 * not the bare origin. RFC 8707 resource indicators sent by ChatGPT are matched
 * against this value, so it must equal the URL clients connect to.
 */
function mcpResourceUrl(path: string): string {
  const base = config.mcpServerUrl.replace(/\/+$/, "");
  return base.endsWith(path) ? base : `${base}${path}`;
}

export function createOAuthRoutes(): Router {
  const router = Router();
  const issuer = config.oauth.issuer;

  const protectedResourceDocFor = (path: string) => ({
    resource: mcpResourceUrl(path),
    authorization_servers: [issuer],
    bearer_methods_supported: ["header"],
    scopes_supported: [...config.oauth.scopesSupported],
    resource_documentation:
      "https://github.com/covariance-network/productclank-mcp-server",
  });

  const authorizationServerDoc = {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: [
      "none",
      "client_secret_post",
      "client_secret_basic",
    ],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: [...config.oauth.scopesSupported],
  };

  // Root + per-endpoint-suffixed variants of each document (see file header).
  // The root protected-resource path answers for the default endpoint (/mcp).
  const rootProtectedResourceDoc = protectedResourceDocFor(
    MCP_ENDPOINT_PATHS[0]
  );
  router.get("/.well-known/oauth-protected-resource", (_req, res) =>
    res.json(rootProtectedResourceDoc)
  );
  for (const endpointPath of MCP_ENDPOINT_PATHS) {
    const doc = protectedResourceDocFor(endpointPath);
    router.get(`/.well-known/oauth-protected-resource${endpointPath}`, (_req, res) =>
      res.json(doc)
    );
  }

  // One authorization server backs every endpoint, so this document is shared.
  for (const path of [
    "/.well-known/oauth-authorization-server",
    ...MCP_ENDPOINT_PATHS.map((p) => `/.well-known/oauth-authorization-server${p}`),
  ]) {
    router.get(path, (_req, res) => res.json(authorizationServerDoc));
  }

  return router;
}
