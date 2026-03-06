/**
 * OAuth 2.1 metadata endpoints required by the MCP authorization spec.
 *
 * Two well-known endpoints:
 * 1. /.well-known/oauth-protected-resource  (RFC 9728)
 *    — tells clients which authorization server to use
 * 2. /.well-known/oauth-authorization-server (RFC 8414)
 *    — tells clients the auth server's capabilities
 *
 * These are served as plain Express routes alongside the MCP endpoint.
 */

import { Router } from "express";
import { config } from "../config.js";

export function createOAuthRoutes(): Router {
  const router = Router();
  const issuer = config.oauth.issuer;

  /**
   * Protected Resource Metadata (RFC 9728)
   * The MCP server (resource server) advertises its authorization server.
   */
  router.get("/.well-known/oauth-protected-resource", (_req, res) => {
    res.json({
      resource: config.mcpServerUrl,
      authorization_servers: [`${issuer}`],
      bearer_methods_supported: ["header"],
      resource_documentation: "https://github.com/covariance-network/productclank-agent-skill",
    });
  });

  /**
   * Authorization Server Metadata (RFC 8414)
   * Describes the OAuth endpoints and capabilities.
   */
  router.get("/.well-known/oauth-authorization-server", (_req, res) => {
    res.json({
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      registration_endpoint: config.oauth.dynamicRegistrationEnabled
        ? `${issuer}/oauth/register`
        : undefined,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: [
        "client_secret_basic",
        "client_secret_post",
        "none",
      ],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: [
        "campaigns:read",
        "campaigns:write",
        "credits:read",
        "products:read",
      ],
    });
  });

  return router;
}
