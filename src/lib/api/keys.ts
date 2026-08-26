/**
 * Per-user agent key resolution for the ProductClank MCP connector.
 *
 * Since the per-user-agents migration (app repo:
 * docs/plans/mcp-per-user-agents.md) this server holds NO standing upstream
 * credential. Each connected user is backed by their own non-trusted Agent row,
 * and the raw key is fetched on demand from the webapp's provisioning route,
 * authenticated with MCP_PROVISION_SECRET — a secret that can ONLY provision
 * connector agents, not act as one.
 *
 * Keys are cached in memory only (never persisted here): TTL'd, invalidated on
 * an upstream 401, re-fetched on miss. Restarts start cold and warm lazily.
 *
 * Two provisioning modes, matching the route's contract:
 * - "consent" (OAuth callback, a human just approved) may create, reactivate a
 *   user-revoked agent, and rotate its key.
 * - "fetch" (cache miss) may create a missing agent — the live OAuth token
 *   behind the request proves a past consent — but NEVER reactivates a revoked
 *   one: a routine cache miss must not undo a Connected Apps revoke. Revoked →
 *   the route 403s `authorization_revoked` and the user has to reconnect.
 */

import { config } from "../../config.js";
import { ApiError } from "./client.js";

interface CachedKey {
  apiKey: string;
  fetchedAt: number;
}

/** Re-fetch keys at least daily even without a 401 (bounds staleness). */
const KEY_TTL_MS = 24 * 60 * 60 * 1000;

const cache = new Map<string, CachedKey>();
/** De-dupes concurrent fetches for the same user (avoids racing provisions). */
const inFlight = new Map<string, Promise<string>>();

interface ProvisionResponse {
  success: boolean;
  agent_id?: string;
  api_key?: string;
  error?: string;
  message?: string;
}

async function callProvision(
  userId: string,
  mode: "consent" | "fetch"
): Promise<ProvisionResponse> {
  const res = await fetch(
    `${config.productclankApiUrl}/agents/connector/provision`,
    {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: {
        Authorization: `Bearer ${config.provisionSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: userId, mode }),
    }
  );
  const body = (await res.json().catch(() => null)) as ProvisionResponse | null;
  if (!res.ok || !body?.success || !body.api_key) {
    const message =
      body?.error === "authorization_revoked"
        ? "Access to this ProductClank account was revoked. Ask the user to reconnect the ProductClank connector to re-authorize."
        : (body?.message ?? `Provisioning failed (${res.status})`);
    throw new ApiError(message, res.status, body);
  }
  return body;
}

/**
 * Consent-time provisioning — call ONLY from the OAuth callback, where a human
 * has just approved the connection. Warms the key cache.
 */
export async function provisionUserAgent(userId: string): Promise<void> {
  const body = await callProvision(userId, "consent");
  cache.set(userId, { apiKey: body.api_key!, fetchedAt: Date.now() });
}

/**
 * Resolve the acting user's agent API key: memory cache first, then a
 * fetch-mode provision call.
 */
export async function resolveUserApiKey(userId: string): Promise<string> {
  const cached = cache.get(userId);
  if (cached && Date.now() - cached.fetchedAt < KEY_TTL_MS) {
    return cached.apiKey;
  }

  const pending = inFlight.get(userId);
  if (pending) return pending;

  const fetchPromise = (async () => {
    try {
      const body = await callProvision(userId, "fetch");
      cache.set(userId, { apiKey: body.api_key!, fetchedAt: Date.now() });
      return body.api_key!;
    } finally {
      inFlight.delete(userId);
    }
  })();
  inFlight.set(userId, fetchPromise);
  return fetchPromise;
}

/** Drop a cached key (after an upstream 401 — e.g. key rotated server-side). */
export function invalidateUserApiKey(userId: string): void {
  cache.delete(userId);
}
