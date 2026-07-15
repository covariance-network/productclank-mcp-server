/**
 * Shared helpers for MCP tool modules.
 *
 * The connected user's ProductClank id is resolved from the OAuth access token
 * by the requireBearerAuth middleware and surfaces at
 * `extra.authInfo.extra.userId`. Every write bills that user's own credits via
 * the trusted-agent `caller_user_id` path.
 */

export interface ToolExtra {
  authInfo?: { extra?: Record<string, unknown> };
}

export function getUserId(extra: ToolExtra): string | null {
  const id = extra.authInfo?.extra?.userId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export function textResult(payload: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(payload, null, 2) },
    ],
  };
}

export function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

export const NOT_AUTHED =
  "Not connected to a ProductClank account. Ask the user to connect the ProductClank connector.";
