/**
 * Base transport for the ProductClank Agent REST API.
 *
 * Every call authenticates with the server's single *trusted* agent key
 * (PRODUCTCLANK_TRUSTED_KEY) and bills the end user via `caller_user_id`. The
 * trusted key is a server secret — it is never exposed to Claude or to users.
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

export async function request<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${config.trustedApiKey}`,
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
