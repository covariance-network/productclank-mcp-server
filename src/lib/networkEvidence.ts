import { getServiceSupabase } from "./supabase.js";

/**
 * Live proof that the distribution network is real.
 *
 * The community-posts-them option in the distribution offer claims that
 * network members will post the drafts from their own accounts. A new user has
 * no reason to believe that, and the one thing that can't be faked is the
 * network itself — so the offer carries live numbers computed from the same
 * tables the earn feed writes, plus a few recent posted-reply URLs anyone can
 * open. Numbers are computed, never hardcoded: a stale brag is worse than none.
 *
 * Deliberately NOT shown: the open unclaimed queue. Drafts drain within
 * minutes, so it reads 0 — which looks like a dead network when it is the
 * opposite.
 */
export interface DistributionEvidence {
  /** Replies posted by community members with a live proof URL, last 30 days. */
  replies_posted_last_30_days: number;
  /** Distinct community members who posted at least once, last 7 days. */
  distinct_posters_last_7_days: number;
  /** Recent posted replies, verified and still up — open them to see real posts. */
  live_examples: string[];
  as_of: string;
}

interface Cached {
  /** null = computed fine but below the evidence floor; cached like any result. */
  evidence: DistributionEvidence | null;
  fetchedAt: number;
}

const CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * Same reasoning as hiding the unclaimed queue: evidence that reads as a dead
 * network is worse than no evidence. Below this 30-day floor the offer simply
 * makes its claim unproven rather than proving the opposite. (Prod runs ~2.5k;
 * this only bites on dev databases or a genuine collapse.)
 */
const EVIDENCE_FLOOR_30D = 50;

let cached: Cached | null = null;
let inFlight: Promise<DistributionEvidence | null> | null = null;

const DAY_MS = 24 * 60 * 60 * 1000;

async function compute(): Promise<DistributionEvidence> {
  const supabase = getServiceSupabase();
  const since30d = new Date(Date.now() - 30 * DAY_MS).toISOString();
  const since7d = new Date(Date.now() - 7 * DAY_MS).toISOString();

  const [posted30d, posters7d, samples] = await Promise.all([
    supabase
      .from("CommuniplyReply")
      .select("id", { count: "exact", head: true })
      .eq("is_claimed", true)
      .not("reply_url", "is", null)
      .gte("selected_at", since30d),
    supabase
      .from("CommuniplyReply")
      .select("selected_by")
      .eq("is_claimed", true)
      .not("selected_by", "is", null)
      .gte("selected_at", since7d),
    // Live examples must be links a stranger can open and see a real reply:
    // URL-verified, not judged fraudulent, not known-removed — and an actual
    // platform URL, never a screenshot proof (those live on supabase storage).
    supabase
      .from("CommuniplyReply")
      .select("reply_url, selected_by")
      .eq("is_claimed", true)
      .eq("url_verified", true)
      .not("reply_url", "is", null)
      .ilike("reply_url", "http%")
      .not("reply_url", "ilike", "%supabase.co%")
      .or("proof_review_decision.is.null,proof_review_decision.not.in.(rejected,reject)")
      .or("survival_status.is.null,survival_status.eq.alive")
      .order("selected_at", { ascending: false })
      .limit(24),
  ]);

  if (posted30d.error) throw posted30d.error;
  if (posters7d.error) throw posters7d.error;
  if (samples.error) throw samples.error;

  const posters = new Set(
    (posters7d.data ?? []).map((r) => r.selected_by as string)
  );

  // One example per poster — three links from one account prove much less.
  const seenPosters = new Set<string>();
  const examples: string[] = [];
  for (const row of samples.data ?? []) {
    const poster = (row.selected_by as string | null) ?? row.reply_url;
    if (seenPosters.has(poster)) continue;
    seenPosters.add(poster);
    examples.push(row.reply_url as string);
    if (examples.length >= 3) break;
  }

  return {
    replies_posted_last_30_days: posted30d.count ?? 0,
    distinct_posters_last_7_days: posters.size,
    live_examples: examples,
    as_of: new Date().toISOString(),
  };
}

/**
 * Cached network evidence. Never throws and never blocks a tool result on a
 * slow query for long: evidence is supporting material, and a create_campaign
 * that fails because a stats query hiccuped would be absurd. On error, serves
 * the last good value however old, else null (callers omit the field).
 */
export async function getNetworkEvidence(): Promise<DistributionEvidence | null> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.evidence;
  }
  if (!inFlight) {
    inFlight = compute()
      .then((evidence) => {
        const usable =
          evidence.replies_posted_last_30_days >= EVIDENCE_FLOOR_30D
            ? evidence
            : null;
        cached = { evidence: usable, fetchedAt: Date.now() };
        return usable;
      })
      .catch((error: unknown) => {
        console.error("[networkEvidence] stats query failed:", error);
        return cached?.evidence ?? null;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}
