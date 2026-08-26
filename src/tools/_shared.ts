/**
 * Shared helpers for MCP tool modules.
 *
 * The connected user's ProductClank id is resolved from the OAuth access token
 * by the requireBearerAuth middleware and surfaces at
 * `extra.authInfo.extra.userId`. Every call authenticates upstream as that
 * user's own per-user agent (lib/api/keys.ts), so billing and access scope
 * come from the key itself.
 */

export interface ToolExtra {
  authInfo?: { extra?: Record<string, unknown> };
}

export function getUserId(extra: ToolExtra): string | null {
  const id = extra.authInfo?.extra?.userId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * Communication contract
 * ----------------------
 * A tool result is read by an assistant, not by the person paying for the
 * credits. Anything the user must KNOW or DECIDE has to be in the payload or it
 * never reaches them — the field test showed drafts being posted by the network
 * while the owner had no idea that was even a mode. Two optional fields carry
 * it, and both are for relaying, not for acting on:
 *
 * - `user_note` — one or two plain sentences to tell the user, in their words.
 * - `decision_offer` — a real choice, with what each option costs and does.
 *   Present it; never pick for them.
 */
export interface DecisionOption {
  /** What the user would say yes to. */
  choice: string;
  /** The consequence, concretely. */
  what_happens: string;
  /** Credit cost of choosing this, in plain language. */
  cost: string;
}

export interface DecisionOffer {
  question: string;
  options: DecisionOption[];
  /** The option already in effect if the user says nothing. */
  current: string;
  /** How the choice gets applied once the user picks. */
  how_to_apply: string;
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
