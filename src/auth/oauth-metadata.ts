/**
 * OAuth 2.1 metadata endpoints required by the MCP authorization spec.
 *
 *  /.well-known/oauth-protected-resource   (RFC 9728) — points clients at the AS
 *  /.well-known/oauth-authorization-server (RFC 8414) — advertises AS capabilities
 */

import { Router } from "express";
import { config } from "../config.js";

export function createOAuthRoutes(): Router {
  const router = Router();
  const issuer = config.oauth.issuer;

  router.get("/.well-known/oauth-protected-resource", (_req, res) => {
    res.json({
      resource: config.mcpServerUrl,
      authorization_servers: [issuer],
      bearer_methods_supported: ["header"],
      scopes_supported: [...config.oauth.scopesSupported],
      resource_documentation:
        "https://github.com/covariance-network/productclank-mcp-server",
    });
  });

  router.get("/.well-known/oauth-authorization-server", (_req, res) => {
    res.json({
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
    });
  });

  return router;
}
