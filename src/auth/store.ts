/**
 * Supabase-backed persistence for the MCP OAuth authorization server.
 *
 * Tables (see migrations/0001_mcp_oauth.sql):
 *   mcp_oauth_clients  — dynamically-registered OAuth clients (RFC 7591)
 *   mcp_login_states   — in-flight /authorize requests awaiting webapp login
 *   mcp_auth_codes     — issued authorization codes (short-lived, one-time)
 *   mcp_tokens         — access + refresh tokens mapped to a ProductClank user
 */

import crypto from "node:crypto";
import { getServiceSupabase } from "../lib/supabase.js";
import { config } from "../config.js";

function isoIn(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

// ─── Clients (Dynamic Client Registration) ─────────────────────────────────

export interface OAuthClient {
  clientId: string;
  clientSecret: string | null;
  clientName: string | null;
  redirectUris: string[];
  tokenEndpointAuthMethod: string;
}

export async function registerClient(params: {
  clientName?: string;
  redirectUris: string[];
  tokenEndpointAuthMethod: string;
}): Promise<OAuthClient> {
  const isPublic = params.tokenEndpointAuthMethod === "none";
  const client: OAuthClient = {
    clientId: `pc_${crypto.randomUUID().replace(/-/g, "")}`,
    clientSecret: isPublic
      ? null
      : `pcs_${crypto.randomBytes(32).toString("hex")}`,
    clientName: params.clientName ?? null,
    redirectUris: params.redirectUris,
    tokenEndpointAuthMethod: params.tokenEndpointAuthMethod,
  };

  const { error } = await getServiceSupabase().from("mcp_oauth_clients").insert({
    client_id: client.clientId,
    client_secret: client.clientSecret,
    client_name: client.clientName,
    redirect_uris: client.redirectUris,
    token_endpoint_auth_method: client.tokenEndpointAuthMethod,
  });
  if (error) throw new Error(`Failed to register client: ${error.message}`);
  return client;
}

export async function getClient(clientId: string): Promise<OAuthClient | null> {
  const { data, error } = await getServiceSupabase()
    .from("mcp_oauth_clients")
    .select(
      "client_id, client_secret, client_name, redirect_uris, token_endpoint_auth_method"
    )
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load client: ${error.message}`);
  if (!data) return null;
  const row = data as {
    client_id: string;
    client_secret: string | null;
    client_name: string | null;
    redirect_uris: string[];
    token_endpoint_auth_method: string;
  };
  return {
    clientId: row.client_id,
    clientSecret: row.client_secret,
    clientName: row.client_name,
    redirectUris: row.redirect_uris,
    tokenEndpointAuthMethod: row.token_endpoint_auth_method,
  };
}

// ─── Login states (authorize → webapp round-trip) ──────────────────────────

export interface LoginState {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  clientState: string | null;
}

export async function createLoginState(state: LoginState): Promise<string> {
  const id = crypto.randomBytes(24).toString("hex");
  const { error } = await getServiceSupabase().from("mcp_login_states").insert({
    state: id,
    client_id: state.clientId,
    redirect_uri: state.redirectUri,
    code_challenge: state.codeChallenge,
    code_challenge_method: state.codeChallengeMethod,
    scope: state.scope,
    client_state: state.clientState,
    expires_at: isoIn(config.oauth.loginStateTtlSeconds),
  });
  if (error) throw new Error(`Failed to persist login state: ${error.message}`);
  return id;
}

export async function consumeLoginState(
  id: string
): Promise<LoginState | null> {
  const db = getServiceSupabase();
  const { data, error } = await db
    .from("mcp_login_states")
    .select(
      "client_id, redirect_uri, code_challenge, code_challenge_method, scope, client_state, expires_at"
    )
    .eq("state", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load login state: ${error.message}`);
  if (!data) return null;
  await db.from("mcp_login_states").delete().eq("state", id);
  const row = data as {
    client_id: string;
    redirect_uri: string;
    code_challenge: string;
    code_challenge_method: string;
    scope: string;
    client_state: string | null;
    expires_at: string;
  };
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return {
    clientId: row.client_id,
    redirectUri: row.redirect_uri,
    codeChallenge: row.code_challenge,
    codeChallengeMethod: row.code_challenge_method,
    scope: row.scope,
    clientState: row.client_state,
  };
}

// ─── Authorization codes ───────────────────────────────────────────────────

export interface AuthCode {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
}

export async function createAuthCode(code: AuthCode): Promise<string> {
  const value = crypto.randomBytes(32).toString("hex");
  const { error } = await getServiceSupabase().from("mcp_auth_codes").insert({
    code: value,
    client_id: code.clientId,
    user_id: code.userId,
    redirect_uri: code.redirectUri,
    code_challenge: code.codeChallenge,
    code_challenge_method: code.codeChallengeMethod,
    scope: code.scope,
    expires_at: isoIn(config.oauth.authCodeTtlSeconds),
  });
  if (error) throw new Error(`Failed to persist auth code: ${error.message}`);
  return value;
}

export async function consumeAuthCode(value: string): Promise<AuthCode | null> {
  const db = getServiceSupabase();
  const { data, error } = await db
    .from("mcp_auth_codes")
    .select(
      "client_id, user_id, redirect_uri, code_challenge, code_challenge_method, scope, expires_at"
    )
    .eq("code", value)
    .maybeSingle();
  if (error) throw new Error(`Failed to load auth code: ${error.message}`);
  if (!data) return null;
  await db.from("mcp_auth_codes").delete().eq("code", value);
  const row = data as {
    client_id: string;
    user_id: string;
    redirect_uri: string;
    code_challenge: string;
    code_challenge_method: string;
    scope: string;
    expires_at: string;
  };
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return {
    clientId: row.client_id,
    userId: row.user_id,
    redirectUri: row.redirect_uri,
    codeChallenge: row.code_challenge,
    codeChallengeMethod: row.code_challenge_method,
    scope: row.scope,
  };
}

// ─── Tokens ────────────────────────────────────────────────────────────────

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
}

export async function issueTokens(params: {
  clientId: string;
  userId: string;
  scope: string;
}): Promise<IssuedTokens> {
  const accessToken = `pcat_${crypto.randomBytes(32).toString("hex")}`;
  const refreshToken = `pcrt_${crypto.randomBytes(32).toString("hex")}`;
  const { error } = await getServiceSupabase().from("mcp_tokens").insert({
    access_token: accessToken,
    refresh_token: refreshToken,
    client_id: params.clientId,
    user_id: params.userId,
    scope: params.scope,
    access_token_expires_at: isoIn(config.oauth.accessTokenTtlSeconds),
    refresh_token_expires_at: isoIn(config.oauth.refreshTokenTtlSeconds),
  });
  if (error) throw new Error(`Failed to issue tokens: ${error.message}`);
  return {
    accessToken,
    refreshToken,
    expiresIn: config.oauth.accessTokenTtlSeconds,
    scope: params.scope,
  };
}

export interface ResolvedToken {
  userId: string;
  clientId: string;
  scope: string;
  expiresAtSeconds: number;
}

export async function resolveAccessToken(
  accessToken: string
): Promise<ResolvedToken | null> {
  const { data, error } = await getServiceSupabase()
    .from("mcp_tokens")
    .select("user_id, client_id, scope, access_token_expires_at, revoked_at")
    .eq("access_token", accessToken)
    .maybeSingle();
  if (error) throw new Error(`Failed to resolve access token: ${error.message}`);
  if (!data) return null;
  const row = data as {
    user_id: string;
    client_id: string;
    scope: string;
    access_token_expires_at: string;
    revoked_at: string | null;
  };
  if (row.revoked_at) return null;
  return {
    userId: row.user_id,
    clientId: row.client_id,
    scope: row.scope,
    expiresAtSeconds: Math.floor(
      new Date(row.access_token_expires_at).getTime() / 1000
    ),
  };
}

/**
 * Rotate a refresh token: the presented refresh token is revoked and a fresh
 * access/refresh pair is issued for the same user (refresh-token rotation).
 */
export async function rotateRefreshToken(
  refreshToken: string
): Promise<IssuedTokens | null> {
  const db = getServiceSupabase();
  const { data, error } = await db
    .from("mcp_tokens")
    .select("client_id, user_id, scope, refresh_token_expires_at, revoked_at")
    .eq("refresh_token", refreshToken)
    .maybeSingle();
  if (error) throw new Error(`Failed to load refresh token: ${error.message}`);
  if (!data) return null;
  const row = data as {
    client_id: string;
    user_id: string;
    scope: string;
    refresh_token_expires_at: string;
    revoked_at: string | null;
  };
  if (row.revoked_at) return null;
  if (new Date(row.refresh_token_expires_at).getTime() < Date.now()) return null;

  await db
    .from("mcp_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("refresh_token", refreshToken);

  return issueTokens({
    clientId: row.client_id,
    userId: row.user_id,
    scope: row.scope,
  });
}
