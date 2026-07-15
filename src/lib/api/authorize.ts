/**
 * Authorization — trusted agent → per-user billing consent.
 *
 * Called server-side by the OAuth /callback when a user connects, so the
 * trusted agent may bill that user via `caller_user_id`. Not a user-facing tool.
 */

import { request } from "./client.js";

export function authorizeUser(
  userId: string
): Promise<{ success: boolean; authorized: boolean }> {
  return request("/agents/authorize", {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });
}
