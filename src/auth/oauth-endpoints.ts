/**
 * OAuth 2.1 authorization-server endpoints for the ProductClank MCP connector.
 *
 * Identity is delegated to the ProductClank webapp: /oauth/authorize validates
 * the request and hands the browser to the webapp's /connect/mcp consent page.
 * After the user logs in and approves, the webapp redirects back to
 * /oauth/callback with a short-lived HS256 grant identifying the user.
 *
 * Flow: register → authorize → (webapp login+consent) → callback → token
 */

import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { config } from "../config.js";
import * as store from "./store.js";
import { verifyGrant } from "../lib/grant.js";
import * as api from "../lib/productclank-api.js";

function isLoopback(uri: string): boolean {
  try {
    const u = new URL(uri);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

/**
 * A requested redirect_uri must exactly match a registered one. For loopback
 * (native/CLI clients) the port component is ignored per RFC 8252 §7.3.
 */
function redirectUriAllowed(registered: string[], requested: string): boolean {
  if (registered.includes(requested)) return true;
  if (!isLoopback(requested)) return false;
  try {
    const req = new URL(requested);
    return registered.some((entry) => {
      if (!isLoopback(entry)) return false;
      const reg = new URL(entry);
      return reg.hostname === req.hostname && reg.pathname === req.pathname;
    });
  } catch {
    return false;
  }
}

function redirectError(
  res: Response,
  redirectUri: string,
  state: string | null,
  error: string,
  description?: string
): void {
  try {
    const url = new URL(redirectUri);
    url.searchParams.set("error", error);
    if (description) url.searchParams.set("error_description", description);
    if (state) url.searchParams.set("state", state);
    res.redirect(302, url.toString());
  } catch {
    res.status(400).json({ error, error_description: description });
  }
}

export function createOAuthEndpoints(): Router {
  const router = Router();

  // ─── Dynamic Client Registration (RFC 7591) ──────────────────────────────
  router.post("/oauth/register", async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as {
        redirect_uris?: unknown;
        client_name?: unknown;
        token_endpoint_auth_method?: unknown;
      };
      if (
        !Array.isArray(body.redirect_uris) ||
        body.redirect_uris.length === 0
      ) {
        res.status(400).json({
          error: "invalid_redirect_uri",
          error_description: "redirect_uris is required",
        });
        return;
      }
      const method =
        typeof body.token_endpoint_auth_method === "string"
          ? body.token_endpoint_auth_method
          : "none";

      const client = await store.registerClient({
        clientName:
          typeof body.client_name === "string" ? body.client_name : undefined,
        redirectUris: body.redirect_uris as string[],
        tokenEndpointAuthMethod: method,
      });

      res.status(201).json({
        client_id: client.clientId,
        ...(client.clientSecret ? { client_secret: client.clientSecret } : {}),
        client_name: client.clientName ?? undefined,
        redirect_uris: client.redirectUris,
        token_endpoint_auth_method: client.tokenEndpointAuthMethod,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      });
    } catch (error) {
      console.error("[oauth/register]", error);
      res.status(500).json({ error: "server_error" });
    }
  });

  // ─── Authorization endpoint ───────────────────────────────────────────────
  router.get("/oauth/authorize", async (req: Request, res: Response) => {
    try {
      const query = req.query as unknown as Record<string, string | undefined>;
      const clientId = query.client_id;
      const redirectUri = query.redirect_uri;
      const responseType = query.response_type;
      const codeChallenge = query.code_challenge;
      const codeChallengeMethod = query.code_challenge_method ?? "S256";
      const scope = query.scope ?? config.oauth.scopesSupported.join(" ");
      const clientState = query.state ?? null;

      if (!clientId || !redirectUri) {
        res.status(400).send("Missing client_id or redirect_uri");
        return;
      }
      const client = await store.getClient(clientId);
      if (!client) {
        res.status(400).send("Unknown client_id");
        return;
      }
      if (!redirectUriAllowed(client.redirectUris, redirectUri)) {
        res.status(400).send("redirect_uri is not registered for this client");
        return;
      }
      // From here, protocol errors are reported to the client via redirect.
      if (responseType !== "code") {
        redirectError(
          res,
          redirectUri,
          clientState,
          "unsupported_response_type"
        );
        return;
      }
      if (!codeChallenge || codeChallengeMethod !== "S256") {
        redirectError(
          res,
          redirectUri,
          clientState,
          "invalid_request",
          "PKCE with S256 is required"
        );
        return;
      }

      const loginState = await store.createLoginState({
        clientId,
        redirectUri,
        codeChallenge,
        codeChallengeMethod,
        scope,
        clientState,
      });

      const url = new URL("/connect/mcp", config.webappUrl);
      url.searchParams.set("state", loginState);
      url.searchParams.set("redirect", `${config.oauth.issuer}/oauth/callback`);
      res.redirect(302, url.toString());
    } catch (error) {
      console.error("[oauth/authorize]", error);
      res.status(500).send("Authorization error");
    }
  });

  // ─── Callback from the webapp (carries a signed grant) ────────────────────
  router.get("/oauth/callback", async (req: Request, res: Response) => {
    try {
      const query = req.query as unknown as Record<string, string | undefined>;
      const state = query.state;
      const grant = query.grant;
      const denied = query.error;

      if (!state) {
        res.status(400).send("Missing state");
        return;
      }
      const login = await store.consumeLoginState(state);
      if (!login) {
        res.status(400).send("Login session expired. Please reconnect.");
        return;
      }
      if (denied) {
        redirectError(
          res,
          login.redirectUri,
          login.clientState,
          "access_denied"
        );
        return;
      }
      if (!grant) {
        res.status(400).send("Missing grant");
        return;
      }

      let userId: string;
      try {
        ({ userId } = verifyGrant(grant));
      } catch (error) {
        console.error("[oauth/callback] grant verify failed", error);
        redirectError(
          res,
          login.redirectUri,
          login.clientState,
          "access_denied",
          "Invalid grant"
        );
        return;
      }

      // Ensure the trusted connector agent is authorized to bill this user.
      try {
        await api.authorizeUser(userId);
      } catch (error) {
        console.error("[oauth/callback] authorizeUser failed", error);
        redirectError(
          res,
          login.redirectUri,
          login.clientState,
          "server_error",
          "Could not authorize account"
        );
        return;
      }

      const code = await store.createAuthCode({
        clientId: login.clientId,
        userId,
        redirectUri: login.redirectUri,
        codeChallenge: login.codeChallenge,
        codeChallengeMethod: login.codeChallengeMethod,
        scope: login.scope,
      });

      const target = new URL(login.redirectUri);
      target.searchParams.set("code", code);
      if (login.clientState) target.searchParams.set("state", login.clientState);
      res.redirect(302, target.toString());
    } catch (error) {
      console.error("[oauth/callback]", error);
      res.status(500).send("Callback error");
    }
  });

  // ─── Token endpoint ───────────────────────────────────────────────────────
  router.post("/oauth/token", async (req: Request, res: Response) => {
    try {
      const grantType = (req.body ?? {}).grant_type;
      if (grantType === "authorization_code") {
        await handleAuthorizationCode(req, res);
      } else if (grantType === "refresh_token") {
        await handleRefreshToken(req, res);
      } else {
        res.status(400).json({ error: "unsupported_grant_type" });
      }
    } catch (error) {
      console.error("[oauth/token]", error);
      res.status(500).json({ error: "server_error" });
    }
  });

  return router;
}

async function handleAuthorizationCode(
  req: Request,
  res: Response
): Promise<void> {
  const body = (req.body ?? {}) as {
    code?: string;
    code_verifier?: string;
    redirect_uri?: string;
    client_id?: string;
  };
  if (!body.code || !body.code_verifier) {
    res.status(400).json({
      error: "invalid_request",
      error_description: "code and code_verifier are required",
    });
    return;
  }
  const authCode = await store.consumeAuthCode(body.code);
  if (!authCode) {
    res.status(400).json({
      error: "invalid_grant",
      error_description: "Invalid or expired authorization code",
    });
    return;
  }
  if (body.redirect_uri && body.redirect_uri !== authCode.redirectUri) {
    res
      .status(400)
      .json({ error: "invalid_grant", error_description: "redirect_uri mismatch" });
    return;
  }
  if (body.client_id && body.client_id !== authCode.clientId) {
    res
      .status(400)
      .json({ error: "invalid_grant", error_description: "client_id mismatch" });
    return;
  }
  // PKCE S256 verification
  const computed = crypto
    .createHash("sha256")
    .update(body.code_verifier)
    .digest("base64url");
  if (computed !== authCode.codeChallenge) {
    res
      .status(400)
      .json({ error: "invalid_grant", error_description: "PKCE verification failed" });
    return;
  }

  const tokens = await store.issueTokens({
    clientId: authCode.clientId,
    userId: authCode.userId,
    scope: authCode.scope,
  });
  res.json({
    access_token: tokens.accessToken,
    token_type: "Bearer",
    expires_in: tokens.expiresIn,
    refresh_token: tokens.refreshToken,
    scope: tokens.scope,
  });
}

async function handleRefreshToken(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as { refresh_token?: string };
  if (!body.refresh_token) {
    res.status(400).json({
      error: "invalid_request",
      error_description: "refresh_token is required",
    });
    return;
  }
  const tokens = await store.rotateRefreshToken(body.refresh_token);
  if (!tokens) {
    res.status(400).json({
      error: "invalid_grant",
      error_description: "Invalid or expired refresh token",
    });
    return;
  }
  res.json({
    access_token: tokens.accessToken,
    token_type: "Bearer",
    expires_in: tokens.expiresIn,
    refresh_token: tokens.refreshToken,
    scope: tokens.scope,
  });
}
