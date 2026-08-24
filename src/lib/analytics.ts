/**
 * PostHog instrumentation for the connector.
 *
 * Adoption is the open question for the MCP surface, and the server is the only
 * place that can answer it: the webapp never sees a tool call. Three events —
 * `mcp_connected` (a user finished OAuth consent), `mcp_tool_called` (every
 * tool invocation, with `ok`), `mcp_tool_error` (failures, with the message) —
 * give the connect → first-call → repeat-use funnel, and the error stream
 * doubles as roadmap telemetry (what agents try and can't do).
 *
 * distinct_id is the user's Supabase auth id when we can resolve it, because
 * that is what the webapp identifies with (`auth.users.id`) — same person, one
 * timeline across web and MCP. Falls back to `pc-user-<User.id>`; either way
 * `productclank_user_id` rides along as a property.
 *
 * Capture is fire-and-forget: nothing here is ever awaited by a tool handler,
 * and every failure is swallowed. No-op when POSTHOG_API_KEY is unset (local
 * dev, forks).
 */

import { PostHog } from "posthog-node";
import { config, SERVER_VERSION } from "../config.js";
import { getServiceSupabase } from "./supabase.js";

export type AnalyticsEvent =
  | "mcp_connected"
  | "mcp_tool_called"
  | "mcp_tool_error";

// undefined = not yet initialized, null = disabled (no API key).
let client: PostHog | null | undefined;

function getClient(): PostHog | null {
  if (client === undefined) {
    if (config.posthog.apiKey) {
      client = new PostHog(config.posthog.apiKey, {
        host: config.posthog.host,
        flushAt: 20,
        flushInterval: 10_000,
      });
    } else {
      client = null;
      console.log("PostHog disabled (POSTHOG_API_KEY unset)");
    }
  }
  return client;
}

// User.id → distinct id. The mapping never changes for a given user, so one
// lookup per user per process is enough.
const distinctIds = new Map<string, string>();

const ANONYMOUS = "mcp-anonymous";

async function resolveDistinctId(userId: string | null): Promise<string> {
  if (!userId) return ANONYMOUS;
  const cached = distinctIds.get(userId);
  if (cached) return cached;

  let distinctId = `pc-user-${userId}`;
  try {
    const { data } = await getServiceSupabase()
      .from("User")
      .select("supabase_auth_id")
      .eq("id", userId)
      .maybeSingle();
    const authId = (data as { supabase_auth_id: string | null } | null)
      ?.supabase_auth_id;
    if (authId) distinctId = authId;
  } catch {
    // Keep the fallback id — telemetry must never break a tool call.
  }
  distinctIds.set(userId, distinctId);
  return distinctId;
}

/**
 * Record an event. Never throws, never blocks — call it and move on.
 */
export function track(
  event: AnalyticsEvent,
  userId: string | null,
  properties: Record<string, unknown> = {}
): void {
  const posthog = getClient();
  if (!posthog) return;
  void resolveDistinctId(userId)
    .then((distinctId) => {
      posthog.capture({
        distinctId,
        event,
        properties: {
          ...properties,
          surface: "mcp",
          server_version: SERVER_VERSION,
          ...(userId ? { productclank_user_id: userId } : {}),
        },
      });
    })
    .catch(() => {
      // Swallowed by design.
    });
}

/**
 * Flush pending events on shutdown so the last few tool calls aren't lost when
 * Railway restarts the container.
 */
export async function shutdownAnalytics(): Promise<void> {
  const posthog = getClient();
  if (!posthog) return;
  try {
    await posthog.shutdown();
  } catch {
    // Nothing useful to do while exiting.
  }
}
