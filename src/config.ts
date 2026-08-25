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

/**
 * Server version — reported over MCP (`initialize`), on /health, and as a
 * property on every analytics event. Keep in sync with package.json.
 */
export const SERVER_VERSION = "0.6.3";

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

  posthog: {
    // Adoption telemetry (see lib/analytics.ts). Unset = instrumentation off.
    // Use the same project key as the webapp so MCP activity and webapp
    // activity land on one person timeline.
    apiKey: process.env.POSTHOG_API_KEY ?? "",
    host: optional("POSTHOG_HOST", "https://us.i.posthog.com"),
  },

  session: {
    // Close an MCP transport that hasn't seen a request in this long. Discovery
    // clients (health checks, glama.ai) open a session via initialize and
    // usually never send a DELETE to close it, so without a sweep those
    // transports would accumulate in memory until the next restart.
    //
    // An hour, not ten minutes: this is a CHAT connector, and people routinely
    // leave a conversation for longer than that before asking the next thing.
    // A swept session makes the next call 404 "Session not found", which the
    // client has to notice and recover from. Sessions in flight are never
    // swept regardless (see index.ts), so the only cost of a longer TTL is a
    // handful of idle McpServer instances.
    idleTtlMs: parseInt(
      optional("MCP_SESSION_IDLE_TTL_MS", String(60 * 60 * 1000)),
      10
    ),
    sweepIntervalMs: parseInt(
      optional("MCP_SESSION_SWEEP_MS", String(60 * 1000)),
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
