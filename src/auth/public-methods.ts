/**
 * Which MCP JSON-RPC messages may skip bearer auth.
 *
 * Discovery / handshake methods carry no user identity and do nothing on the
 * user's behalf. Allowing them unauthenticated lets any client — including
 * automated directory health checks (e.g. glama.ai) and agent-readiness
 * audits — introspect the server without completing the OAuth flow. Every
 * method that acts on a user's data (tools/call, …) still requires a valid
 * access token, and each tool also defends itself via getUserId(...) →
 * NOT_AUTHED, so this only exposes the public catalog, never any account or
 * credit action.
 *
 * It is also exactly why the creator profile is a separate URL rather than a
 * per-OAuth-client filter: a reviewer can reach tools/list before any client
 * identity exists, so only the URL can decide what they see.
 */

/** The connector's tool roster + costs. Static per endpoint profile — no user data. */
export const CAPABILITIES_RESOURCE_URI = "productclank://capabilities";

const PUBLIC_MCP_METHODS = new Set([
  "initialize",
  "ping",
  "tools/list",
  "prompts/list",
  "resources/list",
  "resources/templates/list",
]);

/**
 * Resources `resources/read` may return without a token. resources/list
 * advertises them publicly, so a client that lists them must be able to read
 * them too — otherwise every listed resource is broken for an unauthenticated
 * reader. Only static content belongs here; a resource that reads user data
 * must stay behind auth.
 */
export const PUBLIC_RESOURCE_URIS: ReadonlySet<string> = new Set([CAPABILITIES_RESOURCE_URI]);

export function isPublicMcpMessage(msg: unknown): boolean {
  if (!msg || typeof msg !== "object") return false;
  const { method, params } = msg as { method?: unknown; params?: unknown };
  if (typeof method !== "string") return false;
  if (method.startsWith("notifications/") || PUBLIC_MCP_METHODS.has(method)) return true;
  if (method === "resources/read") {
    const uri = params && typeof params === "object" ? (params as { uri?: unknown }).uri : undefined;
    return typeof uri === "string" && PUBLIC_RESOURCE_URIS.has(uri);
  }
  return false;
}

/**
 * True when a request body may skip auth. Fails closed: only when it is
 * non-empty and *every* JSON-RPC message in it (single or batch) is public —
 * so a batch that smuggles a tools/call alongside an initialize is still gated.
 */
export function isPublicMcpRequest(body: unknown): boolean {
  const messages = Array.isArray(body) ? body : [body];
  return messages.length > 0 && messages.every(isPublicMcpMessage);
}
