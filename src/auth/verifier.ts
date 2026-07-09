import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { resolveAccessToken } from "./store.js";

/**
 * Verifies MCP access tokens for the requireBearerAuth middleware.
 *
 * On success the resolved ProductClank user id is attached at
 * `authInfo.extra.userId`, which surfaces to tool handlers via `extra.authInfo`.
 * On failure the middleware returns 401 with a WWW-Authenticate challenge that
 * points Claude at the OAuth flow.
 */
export const tokenVerifier: OAuthTokenVerifier = {
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const resolved = await resolveAccessToken(token);
    if (!resolved) {
      throw new InvalidTokenError("Invalid or expired access token");
    }
    return {
      token,
      clientId: resolved.clientId,
      scopes: resolved.scope ? resolved.scope.split(" ").filter(Boolean) : [],
      expiresAt: resolved.expiresAtSeconds,
      extra: { userId: resolved.userId },
    };
  },
};
