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

export const NOT_AUTHED =
  "Not connected to a ProductClank account. Ask the user to connect the ProductClank connector.";

/**
 * Outcome classification — why "isError" was not enough.
 * ------------------------------------------------------
 * The telemetry proxy only ever sees the MCP result shape (`{content, isError}`),
 * so it cannot tell a guard doing its job from the server falling over. Both
 * looked identical, which meant every guard that fired correctly — a rejected
 * cross-platform field, a locked platform, the spend-confirmation gate — landed
 * in the error metric. The better the guards worked, the worse the numbers read.
 *
 * So the tool classifies at the point where the information still exists (the
 * `ApiError` with its status and body), and hands the verdict to the proxy on a
 * Symbol key. A Symbol survives the proxy's read but is invisible to JSON, so
 * the SDK and the transport never see it.
 */
export type ToolOutcome = "ok" | "needs_confirmation" | "refused" | "failed";

export interface OutcomeMeta {
  outcome: ToolOutcome;
  /** The backend's machine code, e.g. "platform_locked". Product signal. */
  reason_code?: string;
}

export const OUTCOME: unique symbol = Symbol("productclank.outcome");

/**
 * Statuses our own API uses to say "no, and here is why" rather than "I broke".
 * Everything else — 5xx, the client's 504 timeout, an unexpected throw — is a
 * genuine failure and is the only thing that should ever page anyone.
 */
const REFUSAL_STATUSES = new Set([400, 401, 402, 403, 404, 409, 422, 429]);

/** Not a refusal: step one of a deliberate two-step flow. Measured separately
 *  so the spend gate's conversion rate is visible instead of buried. */
const CONFIRMATION_CODE = "confirmation_required";

function readApiError(error: unknown): { status?: number; code?: string } {
  if (typeof error !== "object" || error === null) return {};
  const status = (error as { status?: unknown }).status;
  const body = (error as { body?: unknown }).body;
  const code =
    typeof body === "object" && body !== null
      ? (body as { error?: unknown }).error
      : undefined;
  return {
    status: typeof status === "number" ? status : undefined,
    code: typeof code === "string" ? code : undefined,
  };
}

export function classifyError(error: unknown): OutcomeMeta {
  const { status, code } = readApiError(error);
  if (code === CONFIRMATION_CODE) {
    return { outcome: "needs_confirmation", reason_code: code };
  }
  if (status !== undefined && REFUSAL_STATUSES.has(status)) {
    return { outcome: "refused", reason_code: code ?? `http_${status}` };
  }
  if (status !== undefined) {
    return { outcome: "failed", reason_code: code ?? `http_${status}` };
  }
  return { outcome: "failed" };
}

function attach<T extends object>(result: T, meta: OutcomeMeta): T {
  Object.defineProperty(result, OUTCOME, {
    value: meta,
    enumerable: false,
    configurable: true,
  });
  return result;
}

/**
 * An error result. Pass `meta` when the caller already knows the verdict;
 * otherwise a bare string is treated as a refusal — a hand-written message in a
 * tool is the tool declining, not the server breaking. NOT_AUTHED is tagged so
 * "never connected" is distinguishable from "connected and refused".
 */
export function errorResult(message: string, meta?: OutcomeMeta) {
  const result = {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
  return attach(
    result,
    meta ??
      (message === NOT_AUTHED
        ? { outcome: "refused", reason_code: "not_connected" }
        : { outcome: "refused", reason_code: "tool_precondition" })
  );
}

/**
 * The catch-block form: classify from the thrown error, fall back to `fallback`
 * when it carries no message of its own.
 */
export function toolError(error: unknown, fallback: string) {
  const message = error instanceof Error && error.message ? error.message : fallback;
  return errorResult(message, classifyError(error));
}

