/**
 * Scout domain — an approved ProductClank scout works their deals from the
 * assistant: founder posts the matcher picked for them, each with a drafted
 * opener that introduces @goldenberglior. The scout posts the reply from their
 * own X account; the assistant never posts.
 *
 * Claim rule: a matched deal waits 12h for its scout, then opens to every
 * scout. A claim holds it 72h, then it returns to the shared pool. Scouts earn
 * a commission on sales from their deals plus a monthly top-scouts pool.
 *
 * Applying (anyone, no approval gate): apply_as_scout → get_scout_application →
 * submit_scout_application, the same research + review as the web Scout tab.
 * An approved scout invites others with get_scout_invite_link; invitees are
 * reviewed like everyone else.
 *
 * Not in the creator (Meta) profile: scouting is BD outreach, not commissioned
 * original content.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as api from "../lib/api/index.js";
import { getUserId, textResult, errorResult, toolError, NOT_AUTHED, type ToolExtra } from "./_shared.js";

const dealId = z.string().uuid().describe("The deal id from get_scout_deals.");

/** Profile research runs in the background upstream (~30-150s); wait this long before handing back. */
const RESEARCH_WAIT_MS = 75_000;
const RESEARCH_POLL_MS = 5_000;

/** What the assistant needs to walk the user through a drafted profile. */
function applicationPayload(r: api.ScoutApplicationResult) {
  return {
    stage: r.stage,
    next_step: r.next_step,
    invited_by: r.invited_by,
    profile: r.profile,
    boundaries: r.boundaries,
    boundary_options: r.boundary_options,
    found: r.found,
    review: r.review,
    research_runs_left_today: r.research_runs_left_today,
    web_url: r.web_url,
  };
}

const profileEdits = z
  .object({
    headline: z.string().max(140).optional(),
    niches: z.array(z.string()).max(8).optional(),
    audience: z.string().max(400).optional(),
    companyTypes: z.array(z.string()).max(8).optional(),
    roles: z.array(z.string()).max(8).optional(),
    tone: z.string().max(200).optional(),
    neverPitch: z.array(z.string()).max(10).optional(),
  })
  .optional()
  .describe("Only the fields the user changed. Everything else keeps the drafted profile.");

export function registerScoutTools(server: McpServer): void {
  server.registerTool(
    "get_scout_deals",
    {
      title: "Get my scout deals",
      description:
        "For approved ProductClank scouts: the founder posts picked for you today, each with the post, why it fits, a drafted opener, its status and your signup/call links. Free, read-only. Use it when the user asks 'what deals do you have for me?'. Show each deal briefly (founder, post, the opener) and let the user pick. A deal matched to them is theirs alone for 12h, then open to every scout. If the user is not a scout (403 not_a_scout), offer to apply them right here with apply_as_scout; scout_not_approved = their application is still in review.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (_args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const r = await api.getScoutDeals(userId);
        return textResult({
          deals: r.deals,
          claim_rule: r.claimRule,
          next_step: r.deals.length
            ? "Let the user pick a deal, then claim_deal to hold it before they post."
            : "No open deals right now. New ones arrive daily.",
        });
      } catch (error) {
        return toolError(error, "Could not load scout deals");
      }
    }
  );

  server.registerTool(
    "claim_deal",
    {
      title: "Claim a scout deal",
      description:
        "Hold a deal for this scout for 72 hours so no other scout replies to the same founder. Free. Call it when the user decides to reply, BEFORE they post. Returns the post link, the drafted opener and the scout's links. The user posts the reply from their OWN X account (you never post), then you call report_deal_progress with stage 'sent' and the reply URL. Claiming again refreshes the hold. 409 claimed_by_another_scout = someone else holds it; pick another deal.",
      inputSchema: { dealId },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ dealId }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const r = await api.claimScoutDeal(userId, dealId);
        return textResult({
          deal_id: r.dealId,
          held_until: r.reservedUntil,
          post: r.post,
          opener: r.reply,
          links: r.links,
          user_note:
            "The deal is yours for 72 hours. Reply to the post from your own X account (edit the opener so it sounds like you), then send me the link to your reply.",
        });
      } catch (error) {
        return toolError(error, "Could not claim the deal");
      }
    }
  );

  server.registerTool(
    "release_deal",
    {
      title: "Release a scout deal",
      description:
        "Give a claimed deal back to the shared pool (the user will not reply to it). Free. Use it when the user skips a deal they claimed, so another scout can take it.",
      inputSchema: { dealId },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ dealId }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const r = await api.releaseScoutDeal(userId, dealId);
        return textResult({ deal_id: r.dealId, released: r.released });
      } catch (error) {
        return toolError(error, "Could not release the deal");
      }
    }
  );

  server.registerTool(
    "report_deal_progress",
    {
      title: "Report scout deal progress",
      description:
        "Move a deal forward. stage 'sent' + replyUrl (the URL of the reply the user posted on X) records the reply and awards Stars; it must be the user's own reply, not the founder's post. Later stages are private pipeline steps: 'replied' (the founder answered), 'call_booked', 'closed_won', 'lost'. Free. Only report what the user tells you happened.",
      inputSchema: {
        dealId,
        stage: z.enum(["sent", "replied", "call_booked", "closed_won", "lost"]),
        replyUrl: z.string().url().optional().describe("Required for 'sent': https://x.com/<user>/status/<id> of the user's reply."),
        note: z.string().max(1000).optional().describe("Optional private note on this step."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ dealId, stage, replyUrl, note }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      if (stage === "sent" && !replyUrl) return errorResult("For stage 'sent', pass replyUrl — the link to the reply the user posted on X.");
      try {
        const r = await api.reportScoutDealProgress(userId, dealId, { stage, replyUrl, note });
        return textResult({ deal_id: r.dealId, status: r.status, stars_awarded: r.starsAwarded, message: r.message });
      } catch (error) {
        return toolError(error, "Could not report progress");
      }
    }
  );

  server.registerTool(
    "rate_deal",
    {
      title: "Rate a scout deal",
      description:
        "Tell ProductClank whether this deal was a good pick: 'would_send' or 'would_not'. Free. It tunes which posts the matcher picks for this scout. Ask the user when they skip or finish a deal.",
      inputSchema: { dealId, rating: z.enum(["would_send", "would_not"]) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ dealId, rating }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const r = await api.rateScoutDeal(userId, dealId, rating);
        return textResult({ deal_id: r.dealId, rating: r.rating });
      } catch (error) {
        return toolError(error, "Could not save the rating");
      }
    }
  );

  server.registerTool(
    "get_scout_earnings",
    {
      title: "Get my scout earnings",
      description:
        "The scout's pipeline by stage, commissions earned from their deals, and their rank in this month's top-scouts pool. Free, read-only.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (_args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const { success: _ok, ...rest } = await api.getScoutEarnings(userId);
        return textResult(rest);
      } catch (error) {
        return toolError(error, "Could not load scout earnings");
      }
    }
  );

  server.registerTool(
    "apply_as_scout",
    {
      title: "Apply as a ProductClank scout",
      description:
        "Start a scout application for the signed-in user. Scouts are trusted people in a niche (growth people, marketers, fractional CMOs, founders) who earn when a founder they introduce becomes a client. Free; the user can be brand new. Ask for at least an X handle or a LinkedIn URL (a site and free-text references help). If they came from another scout's invite link or gave you an invite code (looks like ERAN-7K2Q), pass it as invite_code. This reads ONLY the public profiles they give and drafts an editable profile; it takes about 30-150 seconds and this tool waits up to ~75s. Then show the user the draft (headline, niches, audience, who they can reach, tone, never-pitch list) and what was found, take their edits, ask how they want to work (channels: public_replies / dms / intros; deals per day: 1 / 3 / 5), and call submit_scout_application. Nothing is used until they submit, and a person at ProductClank reviews every scout. Call get_scout_application FIRST if they may have applied before: a rebuild clears an earlier submit. Max 3 builds per day.",
      inputSchema: {
        x_handle: z.string().max(60).optional().describe("The user's X handle, with or without @."),
        linkedin_url: z.string().max(300).optional().describe("linkedin.com/in/<name>"),
        site_url: z.string().max(300).optional().describe("Personal site, portfolio or newsletter."),
        references: z.string().max(2000).optional().describe("Free text: past clients, communities, newsletters, portfolio links."),
        invite_code: z.string().max(20).optional().describe("Another scout's invite code, if the user has one."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      if (!args.x_handle && !args.linkedin_url) {
        return errorResult("Ask the user for their X handle or LinkedIn URL first: at least one is needed.");
      }
      try {
        const start = await api.startScoutApplication(userId, args);
        const deadline = Date.now() + RESEARCH_WAIT_MS;
        let app: api.ScoutApplicationResult | null = null;
        while (Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, RESEARCH_POLL_MS));
          app = await api.getScoutApplication(userId);
          if (app.stage !== "researching") break;
        }
        if (!app || app.stage === "researching") {
          return textResult({
            stage: "researching",
            invite_accepted: start.invite_accepted,
            next_step: "Still reading their profiles. Call get_scout_application in a minute to get the draft.",
            user_note: "I'm reading your public profiles and drafting your scout profile. This takes a minute or two.",
          });
        }
        if (app.stage === "none") {
          return errorResult(
            "The profile research did not finish. Check the handle / URL with the user and try apply_as_scout again (it counts toward the 3 builds a day)."
          );
        }
        return textResult({ ...applicationPayload(app), invite_accepted: start.invite_accepted });
      } catch (error) {
        return toolError(error, "Could not start the scout application");
      }
    }
  );

  server.registerTool(
    "get_scout_application",
    {
      title: "Get my scout application",
      description:
        "The signed-in user's scout application: stage (none / researching / draft / pending_review / approved / declined), the drafted profile, what the research found, who invited them, and the next step. Free, read-only. Use it to resume an application, or when the user asks 'where is my scout application?'.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (_args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        return textResult(applicationPayload(await api.getScoutApplication(userId)));
      } catch (error) {
        return toolError(error, "Could not load the scout application");
      }
    }
  );

  server.registerTool(
    "submit_scout_application",
    {
      title: "Submit my scout application",
      description:
        "Submit the drafted scout profile for ProductClank's review, with the user's edits. Free. Only call it after the user has seen the draft and said it is right. profile = only the fields they changed. boundaries = how they want to work: channels (public_replies, dms, intros) and dealsPerDay (1, 3 or 5); required the first time. After it, tell the user a person reviews every scout; on approval they join the ProductClank Scouts squad and their deals start.",
      inputSchema: {
        profile: profileEdits,
        boundaries: z
          .object({
            channels: z.array(z.enum(["public_replies", "dms", "intros"])).min(1),
            dealsPerDay: z.union([z.literal(1), z.literal(3), z.literal(5)]),
          })
          .optional()
          .describe("Required on the first submit."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const r = await api.submitScoutApplication(userId, { profile: args.profile, boundaries: args.boundaries });
        return textResult({
          ...applicationPayload(r),
          user_note:
            "Your scout profile is in. A person at ProductClank reviews every scout; your first deals arrive once you're approved.",
        });
      } catch (error) {
        return toolError(error, "Could not submit the scout application");
      }
    }
  );

  server.registerTool(
    "get_scout_invite_link",
    {
      title: "Get my scout invite link",
      description:
        "For approved scouts: their personal link to invite other scouts (https://www.productclank.com/scouts?invite=<code>) and share_message, a ready-to-paste invite (the link, plus how to apply from Claude with their code). When the user wants to invite someone, give them share_message verbatim so they can paste it into a chat. Also returns who joined through it and where each one is (building / pending / approved / declined; active = approved and has sent a deal reply). Free, read-only. Invited scouts are reviewed like everyone else. Someone they invite can also apply from their own assistant with apply_as_scout and the invite code.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (_args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const { success: _ok, ...rest } = await api.getScoutInvites(userId);
        return textResult(rest);
      } catch (error) {
        return toolError(error, "Could not load the invite link");
      }
    }
  );
}
