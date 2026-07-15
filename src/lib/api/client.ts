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
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.trustedApiKey}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });

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
