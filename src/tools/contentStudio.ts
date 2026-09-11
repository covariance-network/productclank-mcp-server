/**
 * Content Studio domain — draft posts into the user's OWN content pipeline.
 *
 * Distinct from the content-*campaign* tools (content.ts): those rally the
 * community to make content FOR a product; these let the agent DRAFT content INTO
 * the user's ProductClank content engine, where a human reviews/edits/schedules it.
 *
 * Tools over the Content engine's agent endpoints:
 * - list_content_spaces      → GET  /agents/content/spaces
 * - get_content_workspace    → GET  /agents/content/workspace   (the brand's voice + topics)
 * - setup_content_space      → POST /agents/content/workspace   (onboarding: turn content on)
 * - manage_content_topics    → GET/POST/PATCH/DELETE /agents/content/topics (+ /suggest)
 * - write_content_candidates → POST /agents/content/candidates  (draft IN the voice)
 * - get_content_queue        → GET  /agents/content/queue       (drafts + reviewer scores)
 * - revise_content_draft     → PATCH /agents/content/drafts     (approve / chips / teach-by-edit)
 * - teach_content_voice      → POST /agents/content/feedback    (reaction → standing KB rule)
 *
 * Drafting, setup, topics and the queue are FREE; rewrites / reviews cost 2, a KB
 * rule 1, a pasted brand doc 5. Nothing is ever published from here — the user
 * stages drafts in the web tool; publishing is their step.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as api from "../lib/api/index.js";
import { getUserId, textResult, errorResult, toolError, NOT_AUTHED, type ToolExtra } from "./_shared.js";

const MAX_CANDIDATES = 25;

const candidateSchema = z.object({
  text: z.string().describe("The post body / draft text (required)."),
  title: z.string().optional().describe("Short internal label / topic for the draft."),
  platform: z
    .string()
    .optional()
    .describe('Target platform label, e.g. "ProductClank X", "LinkedIn", "Farcaster".'),
  template: z
    .string()
    .optional()
    .describe(
      'Content template, e.g. "Build-in-Public" or "Proof Point". Defaults to Build-in-Public.'
    ),
});

const topicInputSchema = z.object({
  label: z.string().describe("The theme, e.g. 'Why distribution beats building'."),
  keywords: z
    .array(z.string())
    .optional()
    .describe("2–4 broad, short search terms. Omit and the engine proposes them."),
  search_context: z.string().optional().describe("The angle or audience for this theme."),
});

/** Strip the long-form fields an assistant does not need to relay verbatim. */
function summarizeWorkspace(r: api.ContentWorkspaceResult) {
  return {
    space_id: r.space_id,
    space_name: r.space_name,
    enabled: r.enabled,
    workspace: r.workspace,
    topics: r.topics.map((t) => ({ id: t.id, label: t.label, keywords: t.keywords, is_active: t.is_active })),
    style_guides: r.style_guides.map((g) => ({
      channel: g.channel,
      voice_summary: g.voice_summary,
      tone_attributes: g.tone_attributes,
      dos: g.dos,
      donts: g.donts,
      structure: g.structure,
      lexicon: g.lexicon,
    })),
    review_url: r.review_url,
    ...(r.setup_hint ? { setup_hint: r.setup_hint } : {}),
  };
}

export function registerContentStudioTools(server: McpServer): void {
  // ─── list_content_spaces (read) ───────────────────────────────────────────
  server.registerTool(
    "list_content_spaces",
    {
      title: "List content spaces",
      description:
        "List the ProductClank content spaces you can draft into — spaces the user owns, delegates for, or manages that have their content engine turned on. Returns { space_id, name }. Call this first to resolve the space_id for write_content_candidates, and confirm the target space with the user.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (_args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const result = await api.listContentSpaces(userId);
        const spaces = result.spaces ?? [];
        return textResult({
          spaces,
          note:
            spaces.length === 0
              ? "No content-enabled spaces yet. Offer to set one up right here: run the setup_content_space interview (brand, audience, tone, platforms, post types, topics) — it is free and takes a few questions. The web alternative is https://app.productclank.com/content."
              : "Pick the space_id the user wants. Before drafting, call get_content_workspace so you write in the brand's own voice and topics.",
        });
      } catch (error) {
        return toolError(error, "Failed to list content spaces");
      }
    }
  );

  // ─── write_content_candidates (free write, human-reviewed) ────────────────
  server.registerTool(
    "write_content_candidates",
    {
      title: "Draft content candidates",
      description:
        "Draft one or more posts into a ProductClank content space. FREE. Call get_content_workspace FIRST and write in that brand's voice, post types and topics — the drafts are scored against exactly that voice by the reviewer a moment after they land, and the scores show in get_content_queue. `platform` must be one of the space's platforms (omit it to use the first). Candidates land in the user's 'All Content' queue for approval; nothing is auto-published. Up to 25 per call. This drafts into the user's OWN content pipeline — it is NOT a community content campaign (use create_content_campaign for that).",
      inputSchema: {
        space_id: z.string().describe("Target content space UUID from list_content_spaces."),
        candidates: z
          .array(candidateSchema)
          .min(1)
          .max(MAX_CANDIDATES)
          .describe(`1–${MAX_CANDIDATES} draft candidates to write.`),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ space_id, candidates }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const result = await api.writeContentCandidates({
          callerUserId: userId,
          spaceId: space_id,
          candidates,
        });
        return textResult({
          created: result.created,
          draft_ids: result.draft_ids,
          space_id: result.space_id,
          review_url: result.review_url,
          note: "Drafted into the queue; the reviewer is scoring them against the brand voice in the background. Call get_content_queue in a moment to show the user each draft with its score and the reviewer's one-line fix, then approve (stage), revise, or discard with revise_content_draft.",
        });
      } catch (error) {
        // Surface actionable API errors (403 not your space, 404 content not enabled) verbatim.
        return toolError(error, "Failed to write content candidates");
      }
    }
  );

  // ─── get_content_workspace (read) ─────────────────────────────────────────
  server.registerTool(
    "get_content_workspace",
    {
      title: "Read a brand's content calibration",
      description:
        "The brand's voice, platforms, post types, platform playbook, review threshold, topic inventory and any per-channel style guides for one content space. FREE. Read this BEFORE writing any draft so you write in the brand's own voice, and at the start of any content conversation to know what is already set up. `enabled:false` means the space has no content engine yet — offer setup_content_space.",
      inputSchema: {
        space_id: z.string().describe("The space (from list_content_spaces, or any Amplify space the user owns)."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ space_id }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const r = await api.getContentWorkspace(userId, space_id);
        return textResult({
          ...summarizeWorkspace(r),
          user_note: r.enabled
            ? undefined
            : "Content is not set up on this space yet. Offer to set it up in this chat (free) — the setup_content_space prompt walks through brand, audience, tone, platforms, post types and topics.",
        });
      } catch (error) {
        return toolError(error, "Failed to read the content workspace");
      }
    }
  );

  // ─── setup_content_space (free write — creates / updates the workspace) ───
  server.registerTool(
    "setup_content_space",
    {
      title: "Set up (or update) a brand's content space",
      description:
        "Turn the content engine on for a brand from an onboarding conversation, or update its settings later. FREE with structured fields. Collect the answers FIRST (use the setup_content_space prompt: brand & site → audience → tone with the archetype options → platforms → post types → 3–8 topics → example posts), read them back to the user for a yes, THEN call this once. Target an existing space with space_id, or create a fresh solo space for the brand with new_space:{name}. First-time setup needs at least `voice` and `platforms`. Topics are appended (≤12 per call; keywords proposed when omitted). Pass `brand_doc` only when the user hands over a written brand template (it costs 5 credits to structure); answers you collected go in the fields for free. Nothing is published by this tool.",
      inputSchema: {
        space_id: z.string().optional().describe("Existing space to enable/update (one of space_id / new_space is required)."),
        new_space: z
          .object({
            name: z.string().describe("Brand or product name — becomes the space name."),
            description: z.string().optional(),
          })
          .optional()
          .describe("Create a solo Amplify space for this brand (idempotent on name)."),
        brand_name: z.string().optional().describe("Defaults to the space name."),
        platforms: z
          .array(z.string())
          .optional()
          .describe('Where the brand posts, e.g. ["X", "LinkedIn"]. One draft per platform is written per topic.'),
        voice: z
          .string()
          .optional()
          .describe(
            "Voice & style as a tight paragraph: tone in 3–5 words, do's and don'ts, typical length, emoji / hashtag / link policy, words to use and avoid, and the feel of any example posts the user shared."
          ),
        post_types: z
          .string()
          .optional()
          .describe("The kinds of posts they want (how-tos, build-in-public notes, hot takes, customer wins, thesis drops…)."),
        platform_playbook: z
          .string()
          .optional()
          .describe('Per-platform notes, e.g. "X: short and punchy. LinkedIn: longer, more reflective."'),
        topics: z.array(topicInputSchema).max(12).optional().describe("The inventory of themes to post about (3–8 to start)."),
        review_threshold: z.number().int().min(0).max(100).optional().describe("Reviewer pass bar (default 75)."),
        trending_source_handles: z
          .array(z.string())
          .max(20)
          .optional()
          .describe("X accounts to pin for 'Trending on X' (news outlets, analysts, competitors)."),
        brand_doc: z.string().optional().describe("A filled brand template the user pasted — costs 5 credits to structure."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      if (!args.space_id && !args.new_space) {
        return errorResult("Pass space_id (an existing space) or new_space:{name} to create one for the brand.");
      }
      try {
        const r = await api.setupContentWorkspace(userId, {
          spaceId: args.space_id,
          newSpace: args.new_space,
          brandName: args.brand_name,
          platforms: args.platforms,
          voice: args.voice,
          postTypes: args.post_types,
          platformPlaybook: args.platform_playbook,
          topics: args.topics,
          reviewThreshold: args.review_threshold,
          trendingSourceHandles: args.trending_source_handles,
          brandDoc: args.brand_doc,
        });
        return textResult({
          created_space: r.created_space ?? false,
          created_workspace: r.created_workspace ?? false,
          topics_created: r.topics_created ?? 0,
          ...summarizeWorkspace(r),
          user_note: r.created_workspace
            ? `Content is on for ${r.workspace?.brand_name || r.space_name}. The user can see and edit everything at ${r.review_url}. Offer to draft the first posts now with write_content_candidates — in this voice, on these topics.`
            : "Settings updated; future drafts and reviews use them.",
        });
      } catch (error) {
        return toolError(error, "Failed to set up the content space");
      }
    }
  );

  // ─── manage_content_topics (inventory of aspects) ─────────────────────────
  server.registerTool(
    "manage_content_topics",
    {
      title: "Manage the topic inventory",
      description:
        "The inventory of aspects a brand talks about. FREE. action 'list' reads it; 'add' appends topics (≤12; keywords proposed when omitted); 'update' edits or pauses one (is_active:false keeps it but stops using it); 'remove' deletes one; 'suggest' brainstorms new KB-grounded ideas that differ from the existing topics — put them to the user, then 'add' the keepers.",
      inputSchema: {
        space_id: z.string(),
        action: z.enum(["list", "add", "update", "remove", "suggest"]),
        topics: z.array(topicInputSchema).max(12).optional().describe("add: the topics to append."),
        topic_id: z.string().optional().describe("update / remove: which topic."),
        label: z.string().optional().describe("update: new label."),
        keywords: z.array(z.string()).optional().describe("update: replacement keywords."),
        search_context: z.string().optional().describe("update: new angle."),
        is_active: z.boolean().optional().describe("update: false pauses the topic."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async (args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        switch (args.action) {
          case "list": {
            const r = await api.listContentTopics(userId, args.space_id);
            return textResult({ space_id: r.space_id, topics: r.topics });
          }
          case "add": {
            if (!args.topics?.length) return errorResult("add needs a non-empty `topics` array.");
            const r = await api.addContentTopics(userId, args.space_id, args.topics);
            return textResult({ created: r.created ?? r.topics.length, topics: r.topics });
          }
          case "update": {
            if (!args.topic_id) return errorResult("update needs `topic_id`.");
            const r = await api.updateContentTopic(userId, args.space_id, args.topic_id, {
              label: args.label,
              keywords: args.keywords,
              search_context: args.search_context,
              is_active: args.is_active,
            });
            return textResult({ topic: r.topic });
          }
          case "remove": {
            if (!args.topic_id) return errorResult("remove needs `topic_id`.");
            const r = await api.removeContentTopic(userId, args.space_id, args.topic_id);
            return textResult({ deleted: r.deleted });
          }
          case "suggest": {
            const r = await api.suggestContentTopics(userId, args.space_id);
            return textResult({
              suggestions: r.suggestions,
              user_note: "Offer these to the user; add the ones they pick with action 'add'.",
            });
          }
        }
      } catch (error) {
        return toolError(error, "Failed to manage topics");
      }
    }
  );

  // ─── get_content_queue (read) ─────────────────────────────────────────────
  server.registerTool(
    "get_content_queue",
    {
      title: "Read the content queue with scores",
      description:
        "The space's drafts as the user sees them in 'All Content': text, platform, status, and the reviewer's score / verdict / one-line fix. FREE. Use it to present drafts for approval one by one (show the text, the score against review_threshold, and the reviewer's summary), and after write_content_candidates to read back how your drafts scored. status: active (default — pending + reviewed + staged), pending, reviewed, staged (approved by the user, awaiting publish), discarded.",
      inputSchema: {
        space_id: z.string(),
        status: z.enum(["active", "pending", "reviewed", "staged", "discarded"]).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ space_id, status, limit }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const r = await api.getContentQueue(userId, space_id, status, limit);
        return textResult({
          space_id: r.space_id,
          status: r.status,
          review_threshold: r.review_threshold,
          counts: r.counts,
          drafts: r.drafts,
          review_url: r.review_url,
          note: r.note,
        });
      } catch (error) {
        return toolError(error, "Failed to read the content queue");
      }
    }
  );

  // ─── revise_content_draft (approve / chips / edit / discard) ──────────────
  server.registerTool(
    "revise_content_draft",
    {
      title: "Approve, revise, or discard a draft",
      description:
        "Act on one draft in the user's queue. `stage` = the user approved it (mark ready to publish; publishing itself happens in the web tool). `discard` drops it. `revise` rewrites it in the brand voice per a one-click preset — shorter, longer, punchier, deeper, simpler, more_specific, less_salesy, more_casual, more_formal — and/or a typed instruction (2 credits). `fix` makes the surgical change the reviewer's notes asked for (2). `humanize` strips the AI feel and keeps everything else (2). `review` scores it against the brand voice (2). `edit` replaces the text with what the user wrote (free). Any text change clears the old score. Stage and discard are the USER's decisions — act on their say-so, never on your own judgment. If the user's reaction should apply to every future draft (not just this one), use teach_content_voice instead.",
      inputSchema: {
        space_id: z.string(),
        draft_id: z.string().describe("From get_content_queue or a write_content_candidates result."),
        action: z.enum(["stage", "discard", "revise", "fix", "humanize", "review", "edit"]),
        preset: z.enum(api.REVISE_PRESETS).optional().describe("revise: the calibration chip the user clicked."),
        instruction: z.string().optional().describe("revise / fix / humanize: the user's note in their words."),
        text: z.string().optional().describe("edit: the replacement text."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async (args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      if (args.action === "revise" && !args.preset && !args.instruction) {
        return errorResult(`revise needs a preset (${api.REVISE_PRESETS.join(", ")}) or an instruction.`);
      }
      if (args.action === "edit" && !args.text) return errorResult("edit needs `text`.");
      try {
        const r = await api.actOnContentDraft(userId, {
          spaceId: args.space_id,
          draftId: args.draft_id,
          action: args.action,
          preset: args.preset,
          instruction: args.instruction,
          text: args.text,
        });
        return textResult({
          action: r.action,
          credits_charged: r.credits_charged,
          draft: r.draft,
          review_url: r.review_url,
          note: r.note,
          user_note:
            r.action === "stage"
              ? "Approved. It is staged in the content tool; the user publishes from there (publishing from the connector is coming later)."
              : r.action === "revise" || r.action === "fix" || r.action === "humanize"
                ? "Show the user the new text and ask: keep it, nudge again, or approve?"
                : undefined,
        });
      } catch (error) {
        return toolError(error, "Failed to update the draft");
      }
    }
  );

  // ─── teach_content_voice (learning loop) ───────────────────────────────────
  server.registerTool(
    "teach_content_voice",
    {
      title: "Turn feedback into a standing rule",
      description:
        "Teach the engine. The user's reaction — 'too long', 'punchier hooks', 'never say leverage', 'more first-person on LinkedIn' — becomes a durable rule in the brand's voice KB, so every future draft and review honors it. 1 credit. Use it when feedback should STICK; use revise_content_draft when it is about one draft only. Pass draft_id when the reaction was to a specific draft so the rule is grounded in an example. The rule is applied immediately by default (the user owns the space); apply:false leaves it pending in the web Settings instead. Tell the user in one line what was learned.",
      inputSchema: {
        space_id: z.string(),
        feedback: z.string().describe("The user's reaction, in their words."),
        draft_id: z.string().optional().describe("The draft it was about, if any."),
        apply: z.boolean().optional().describe("Default true. false → leave pending for the user to approve in Settings."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ space_id, feedback, draft_id, apply }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const r = await api.teachContentVoice(userId, { spaceId: space_id, feedback, draftId: draft_id, apply });
        return textResult({
          applied: r.applied,
          rule: r.rule,
          user_note: r.applied
            ? `Learned: ${r.rule.markdown.replace(/\s+/g, " ").trim()} (added to ${r.rule.section}).`
            : "Rule proposed and left pending — the user approves it under Settings in the content tool.",
        });
      } catch (error) {
        return toolError(error, "Failed to record the feedback");
      }
    }
  );
}
