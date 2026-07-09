/**
 * Environment configuration for the ProductClank MCP server.
 *
 * Runtime-critical secrets (Supabase, trusted key, grant secret) are validated
 * lazily via assertRuntimeConfig() at server startup, so tooling (tsc, lint) can
 * import this module without a fully-populated environment.
 */

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

const issuer = optional(
  "OAUTH_ISSUER",
  optional("MCP_SERVER_URL", "http://localhost:3100")
);

export const config = {
  port: parseInt(process.env.PORT || "3100", 10),
  mcpServerUrl: optional("MCP_SERVER_URL", "http://localhost:3100"),
  webappUrl: optional("PRODUCTCLANK_WEBAPP_URL", "https://www.productclank.com"),
  productclankApiUrl: optional(
    "PRODUCTCLANK_API_URL",
    "https://api.productclank.com/api/v1"
  ),

  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  trustedApiKey: process.env.PRODUCTCLANK_TRUSTED_KEY ?? "",
  grantSecret: process.env.MCP_GRANT_SECRET ?? "",

  oauth: {
    issuer,
    scopesSupported: ["boost:write", "products:read", "credits:read"] as const,
    accessTokenTtlSeconds: parseInt(
      optional("ACCESS_TOKEN_TTL_SECONDS", "3600"),
      10
    ),
    refreshTokenTtlSeconds: parseInt(
      optional("REFRESH_TOKEN_TTL_SECONDS", String(60 * 60 * 24 * 30)),
      10
    ),
    authCodeTtlSeconds: parseInt(optional("AUTH_CODE_TTL_SECONDS", "300"), 10),
    loginStateTtlSeconds: parseInt(
      optional("LOGIN_STATE_TTL_SECONDS", "900"),
      10
    ),
  },
};

/**
 * Fail fast at startup if a required secret is missing.
 */
export function assertRuntimeConfig(): void {
  const missing: string[] = [];
  if (!config.supabaseUrl) missing.push("SUPABASE_URL");
  if (!config.supabaseServiceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!config.trustedApiKey) missing.push("PRODUCTCLANK_TRUSTED_KEY");
  if (!config.grantSecret) missing.push("MCP_GRANT_SECRET");
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. See .env.example.`
    );
  }
}
