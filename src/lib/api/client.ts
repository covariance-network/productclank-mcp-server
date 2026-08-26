/**
 * Base transport for the ProductClank Agent REST API.
 *
 * Every call authenticates as the ACTING USER's own per-user agent — a
 * non-trusted Agent row bound to that user, whose key is resolved via
 * ./keys.ts (in-memory cache → provisioning route). There is no shared
 * upstream credential anymore, and no `caller_user_id` field: identity comes
 * entirely from the per-user key (the backend 403s a non-trusted agent that
 * sends caller_user_id). See app repo docs/plans/mcp-per-user-agents.md.
 *
 * Per-domain request functions live alongside this file (products.ts, boost.ts,
 * content.ts, …) and are re-exported from ./index.ts. To add an endpoint: add a
 * typed function to the matching domain file (or a new one), then surface it as
 * a tool under ../../tools/. See ../../tools/README.md.
 */

import { config } from "../../config.js";

const BASE = config.productclankApiUrl;

/**
 * Upstream requests must not hang forever. The slowest agent routes cap at 300s
 * of Vercel function time, so a call still running past that will never return
 * anything useful — better to surface a timeout the assistant can relay than to
 * leave the user watching a spinner with no way to tell stuck from slow.
 */
const REQUEST_TIMEOUT_MS = parseInt(
  process.env.PRODUCTCLANK_API_TIMEOUT_MS || String(320_000),
  10
);

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function doFetch(
  apiKey: string,
  path: string,
  init: RequestInit
): Promise<Response> {
  try {
    return await fetch(`${BASE}${path}`, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new ApiError(
        `ProductClank API did not respond within ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s. Long operations like post discovery can take minutes — check the campaign in the workbench before retrying, since the work may have completed server-side.`,
        504,
        null
      );
    }
    throw error;
  }
}

/**
 * Perform an upstream request as `userId`.
 *
 * A 401 usually means the cached key went stale (rotated on consent-after-
 * revoke, or re-minted server-side), so the key is dropped and re-fetched
 * once; a second 401 is surfaced. A revoked user surfaces as a 403 from the
 * key fetch itself, with a reconnect hint the assistant can relay.
 */
export async function request<T>(
  userId: string,
  path: string,
  init: RequestInit
): Promise<T> {
  // Dynamic import breaks the module cycle (keys.ts imports ApiError from
  // this file); Node caches it after the first call, so the cost is one-time.
  const { resolveUserApiKey, invalidateUserApiKey } = await import("./keys.js");

  let apiKey = await resolveUserApiKey(userId);
  let res = await doFetch(apiKey, path, init);

  if (res.status === 401) {
    invalidateUserApiKey(userId);
    apiKey = await resolveUserApiKey(userId);
    res = await doFetch(apiKey, path, init);
  }

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const message =
      body && typeof body === "object" && "message" in body
        ? String((body as { message?: unknown }).message)
        : `ProductClank API error ${res.status}`;
    throw new ApiError(message, res.status, body);
  }
  return body as T;
}
