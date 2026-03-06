/**
 * OAuth 2.1 endpoint stubs for the ProductClank MCP authorization server.
 *
 * TODO: These need full implementation. For now they provide the shape
 * of the endpoints that Claude will call during the connector auth flow.
 *
 * Flow:
 * 1. Claude discovers /.well-known/oauth-authorization-server
 * 2. Claude calls POST /oauth/register (dynamic client registration)
 * 3. Claude opens /oauth/authorize in user's browser
 * 4. User logs in / approves → redirect back with auth code
 * 5. Claude calls POST /oauth/token to exchange code for access token
 * 6. Access token maps to user's pck_live_* API key
 */

import { Router } from "express";
import crypto from "node:crypto";

// In-memory stores — replace with DB/Redis in production
const clients = new Map<string, { client_id: string; client_secret: string; redirect_uris: string[] }>();
const authCodes = new Map<string, { client_id: string; code_challenge: string; redirect_uri: string; scope: string; api_key: string }>();
const tokens = new Map<string, { api_key: string; client_id: string; scope: string }>();

export function createOAuthEndpoints(): Router {
  const router = Router();

  /**
   * Dynamic Client Registration (RFC 7591)
   * Claude auto-registers as an OAuth client.
   */
  router.post("/oauth/register", (req, res) => {
    const { redirect_uris, client_name, token_endpoint_auth_method } = req.body;

    const client_id = `pc_${crypto.randomUUID().replace(/-/g, "")}`;
    const client_secret = `pcs_${crypto.randomBytes(32).toString("hex")}`;

    clients.set(client_id, {
      client_id,
      client_secret,
      redirect_uris: redirect_uris || [],
    });

    res.status(201).json({
      client_id,
      client_secret,
      client_name: client_name || "MCP Client",
      redirect_uris: redirect_uris || [],
      token_endpoint_auth_method: token_endpoint_auth_method || "client_secret_basic",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });
  });

  /**
   * Authorization endpoint
   * User is redirected here to approve the MCP client.
   *
   * TODO: Render a proper login/approval page.
   * For now, returns a placeholder HTML page.
   */
  router.get("/oauth/authorize", (req, res) => {
    const {
      client_id,
      redirect_uri,
      response_type,
      code_challenge,
      code_challenge_method,
      state,
      scope,
    } = req.query as Record<string, string>;

    if (response_type !== "code") {
      res.status(400).json({ error: "unsupported_response_type" });
      return;
    }

    // TODO: Replace with real auth page that:
    // 1. Shows ProductClank login (or verifies existing session)
    // 2. Shows which scopes the MCP client is requesting
    // 3. On approval, looks up user's pck_live_* API key
    // 4. Creates auth code mapped to that API key
    res.send(`<!DOCTYPE html>
<html>
<head><title>ProductClank — Authorize</title></head>
<body style="font-family: sans-serif; max-width: 500px; margin: 80px auto; text-align: center;">
  <h1>ProductClank</h1>
  <p>An application wants to access your ProductClank account.</p>
  <p><strong>Scopes:</strong> ${scope || "campaigns:read campaigns:write"}</p>
  <form method="POST" action="/oauth/authorize">
    <input type="hidden" name="client_id" value="${client_id}" />
    <input type="hidden" name="redirect_uri" value="${redirect_uri}" />
    <input type="hidden" name="code_challenge" value="${code_challenge}" />
    <input type="hidden" name="code_challenge_method" value="${code_challenge_method}" />
    <input type="hidden" name="state" value="${state}" />
    <input type="hidden" name="scope" value="${scope}" />
    <label>
      <div style="margin: 20px 0;">Your ProductClank API Key:</div>
      <input type="text" name="api_key" placeholder="pck_live_..." style="width: 100%; padding: 8px; font-size: 14px;" />
    </label>
    <br/><br/>
    <button type="submit" style="padding: 10px 24px; font-size: 16px; cursor: pointer;">Authorize</button>
  </form>
</body>
</html>`);
  });

  /**
   * Authorization POST — user submits approval.
   * Creates an auth code and redirects back to the client.
   */
  router.post("/oauth/authorize", (req, res) => {
    const {
      client_id,
      redirect_uri,
      code_challenge,
      state,
      scope,
      api_key,
    } = req.body;

    if (!api_key || !api_key.startsWith("pck_live_")) {
      res.status(400).send("Invalid API key. Must start with pck_live_");
      return;
    }

    const code = crypto.randomBytes(32).toString("hex");
    authCodes.set(code, {
      client_id,
      code_challenge: code_challenge || "",
      redirect_uri,
      scope: scope || "",
      api_key,
    });

    // Auth codes expire after 5 minutes
    setTimeout(() => authCodes.delete(code), 5 * 60 * 1000);

    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set("code", code);
    if (state) redirectUrl.searchParams.set("state", state);

    res.redirect(302, redirectUrl.toString());
  });

  /**
   * Token endpoint — exchange auth code for access token.
   * The access token IS the user's pck_live_* API key (or maps to it).
   */
  router.post("/oauth/token", (req, res) => {
    const { grant_type, code, code_verifier, redirect_uri } = req.body;

    if (grant_type !== "authorization_code") {
      res.status(400).json({ error: "unsupported_grant_type" });
      return;
    }

    const authCode = authCodes.get(code);
    if (!authCode) {
      res.status(400).json({ error: "invalid_grant", error_description: "Invalid or expired authorization code" });
      return;
    }

    // Verify PKCE code_verifier against code_challenge (S256)
    if (authCode.code_challenge) {
      const expectedChallenge = crypto
        .createHash("sha256")
        .update(code_verifier || "")
        .digest("base64url");

      if (expectedChallenge !== authCode.code_challenge) {
        res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
        return;
      }
    }

    // Consume the auth code (one-time use)
    authCodes.delete(code);

    // Create access token that maps to the user's API key
    const accessToken = `mcp_${crypto.randomBytes(32).toString("hex")}`;
    const refreshToken = `mcp_rt_${crypto.randomBytes(32).toString("hex")}`;

    tokens.set(accessToken, {
      api_key: authCode.api_key,
      client_id: authCode.client_id,
      scope: authCode.scope,
    });

    res.json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: refreshToken,
      scope: authCode.scope,
    });
  });

  return router;
}

/**
 * Resolve an MCP access token to a ProductClank API key.
 * Used by tool handlers to make API calls on behalf of the user.
 */
export function resolveApiKey(accessToken: string): string | null {
  const tokenData = tokens.get(accessToken);
  return tokenData?.api_key ?? null;
}
