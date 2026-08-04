/**
 * OAuth 2.1 metadata endpoints required by the MCP authorization spec.
 *
 *  /.well-known/oauth-protected-resource   (RFC 9728) — points clients at the AS
 *  /.well-known/oauth-authorization-server (RFC 8414) — advertises AS capabilities
 *
 * Each document is served at BOTH the root path AND the resource-path-suffixed
 * path (…/mcp). The MCP resource lives at `${mcpServerUrl}/mcp`, so per RFC 9728
 * §3.1 / RFC 8414 §3 a strict client derives the metadata URL by inserting the
 * resource path — e.g. `/.well-known/oauth-protected-resource/mcp`. Claude (and
 * VS Code/Copilot) tolerate a missing suffix by falling back to the root path,
 * but ChatGPT's connector fetches the suffixed URL first and fails the connect
 * if it 404s. Serving both makes the connector discoverable from every
 * spec-compliant client, Claude and ChatGPT alike.
 */

import { Router } from "express";
import { config } from "../config.js";

/**
 * Canonical resource identifier for this MCP server: the endpoint itself
 * (`…/mcp`), not the bare origin. RFC 8707 resource indicators sent by ChatGPT
 * are matched against this value, so it must equal the URL clients connect to.
 */
function mcpResourceUrl(): string {
  const base = config.mcpServerUrl.replace(/\/+$/, "");
  return base.endsWith("/mcp") ? base : `${base}/mcp`;
}

export function createOAuthRoutes(): Router {
  const router = Router();
  const issuer = config.oauth.issuer;

  const protectedResourceDoc = {
    resource: mcpResourceUrl(),
    authorization_servers: [issuer],
    bearer_methods_supported: ["header"],
    scopes_supported: [...config.oauth.scopesSupported],
    resource_documentation:
      "https://github.com/covariance-network/productclank-mcp-server",
  };

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

  // Root + /mcp-suffixed variants of each document (see file header).
  for (const path of [
    "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-protected-resource/mcp",
  ]) {
    router.get(path, (_req, res) => res.json(protectedResourceDoc));
  }
  for (const path of [
    "/.well-known/oauth-authorization-server",
    "/.well-known/oauth-authorization-server/mcp",
  ]) {
    router.get(path, (_req, res) => res.json(authorizationServerDoc));
  }

  return router;
}
