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
 * - get_content_queue        → GET  /agents/content/queue       (drafts + reviewer scores; filters)
 * - get_content_draft        → GET  /agents/content/drafts      (one draft: breakdown + versions)
 * - revise_content_draft     → PATCH /agents/content/drafts     (approve / chips / edit / plan / restore)
 * - teach_content_voice      → POST /agents/content/feedback    (reaction → standing KB rule)
 * - attach_content_image     → POST/DELETE /agents/content/media (image by URL or base64)
 * - publish_content_draft    → GET/POST/DELETE /agents/content/publish (channels / post now or
 *                              schedule, incl. X quote posts / cancel)
 *
 * Drafting, setup, topics, the queue, edit, plan, restore and images are FREE; rewrites / reviews
 * cost 2, a KB rule 1, a pasted brand doc 5, a post on a Post for Me account 1. Publishing
 * goes out only through publish_content_draft, after a preview the user said yes to.
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
  tags: z
    .array(z.string())
    .optional()
    .describe("Labels for this one post, added to the call-level tags."),
  image_url: z
    .string()
    .optional()
    .describe("Still image: any public https image URL (ProductClank copies it into its own storage; up to 3 external images per call). For bytes, attach afterwards with attach_content_image."),
  video_url: z.string().optional().describe("Short .mp4 clip. Must be an https public URL in ProductClank's Supabase storage (…/storage/v1/object/public/…)."),
  hls_url: z.string().optional().describe("HLS (.m3u8) transcode of the clip, for inline Farcaster video; same storage rule."),
});

const TAG_GUIDANCE =
  "Tags are the user's labels in the web Queue's tag filter (e.g. a series or campaign week). Read tags_in_use from get_content_queue first and REUSE an existing tag when the posts belong to it; only make a new one for a genuinely new series, and use one clear, human name for it (e.g. \"Communities week\", not \"communities-week-2026-series\"). Spelling is matched case-insensitively to the existing tag.";

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
        "Draft one or more posts into a ProductClank content space. FREE. Call get_content_workspace FIRST and write in that brand's voice, post types and topics — the drafts are scored against exactly that voice by the reviewer a moment after they land, and the scores show in get_content_queue. `platform` must be one of the space's platforms (omit it to use the first). Candidates land in the user's 'All Content' queue for approval; nothing is auto-published. Up to 25 per call. This drafts into the user's OWN content pipeline — it is NOT a community content campaign (use create_content_campaign for that). When the posts form a series, pass the series name in `tags` so every post carries it. " + TAG_GUIDANCE,
      inputSchema: {
        space_id: z.string().describe("Target content space UUID from list_content_spaces."),
        candidates: z
          .array(candidateSchema)
          .min(1)
          .max(MAX_CANDIDATES)
          .describe(`1–${MAX_CANDIDATES} draft candidates to write.`),
        tags: z
          .array(z.string())
          .max(20)
          .optional()
          .describe("Labels stamped on EVERY candidate in this call — e.g. the series name. Max 20, 40 chars each."),
        source: z
          .enum(["agent", "skill"])
          .optional()
          .describe("Who drafted it. Default agent; use skill when an operator's own Claude skill (e.g. /content, /clip) wrote the batch."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ space_id, candidates, tags, source }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const result = await api.writeContentCandidates({
          callerUserId: userId,
          spaceId: space_id,
          candidates,
          tags,
          source,
        });
        return textResult({
          created: result.created,
          ...(tags?.length ? { tags } : {}),
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
            ? `Content is on for ${r.workspace?.brand_name || r.space_name}. The user can see and edit everything at ${r.review_url}. Offer to draft the first posts now with write_content_candidates — in this voice, on these topics.${r.created_space ? ` Any discovery campaign for this brand: pass space_id "${r.space_id}" to create_campaign so it shows under this space.` : ""}`
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
        "The space's drafts as the user sees them: text, platform, status, tags, planned date, media (image/video), the post it quotes, schedule state, and the reviewer's score / verdict / one-line fix. FREE. Use it to present drafts one by one, to read back how drafts scored, and to pull a slice of the content plan: filter by tag (e.g. a campaign week), platform, or planned date window (planned_from / planned_to, YYYY-MM-DD; orders by planned date). status: active (default — pending + reviewed + staged), pending, reviewed, staged (approved, awaiting publish), scheduled (already in the user's scheduler — read-only), discarded, all (everything but discarded). counts are space-wide totals. tags_in_use lists every tag the space uses (most-used first) — check it before tagging a series. Call get_content_draft for one draft's per-axis score and earlier versions.",
      inputSchema: {
        space_id: z.string(),
        status: z.enum(["active", "pending", "reviewed", "staged", "scheduled", "discarded", "all"]).optional(),
        tag: z.string().optional().describe("Only drafts with this tag (case-insensitive), e.g. \"Communities week\"."),
        platform: z.string().optional().describe("Only this platform label (exact), e.g. \"Lior X\"."),
        planned_from: z.string().optional().describe("Planned on or after this date (YYYY-MM-DD) or ISO time."),
        planned_to: z.string().optional().describe("Planned on or before this date (whole day) or ISO time."),
        limit: z.number().int().min(1).max(100).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ space_id, status, tag, platform, planned_from, planned_to, limit }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const r = await api.getContentQueue(userId, space_id, {
          status,
          limit,
          tag,
          platform,
          plannedFrom: planned_from,
          plannedTo: planned_to,
        });
        return textResult({
          space_id: r.space_id,
          status: r.status,
          filters: r.filters,
          review_threshold: r.review_threshold,
          counts: r.counts,
          tags_in_use: r.tags_in_use ?? [],
          drafts: r.drafts,
          review_url: r.review_url,
          note: r.note,
        });
      } catch (error) {
        return toolError(error, "Failed to read the content queue");
      }
    }
  );

  // ─── get_content_draft (read) ─────────────────────────────────────────────
  server.registerTool(
    "get_content_draft",
    {
      title: "Read one draft in full",
      description:
        "One draft with everything needed to iterate on it: text, media, the post it quotes, schedule state, the reviewer's per-axis breakdown, the score before the last rewrite, and its earlier versions (newest first). FREE. Each version has a version_id — pass it to revise_content_draft action:\"restore\" to bring that text back (e.g. \"the first hook was better\"). locked:true means it is already scheduled or live: do not try to change it; tell the user where to change it (locked_reason).",
      inputSchema: {
        space_id: z.string(),
        draft_id: z.string().describe("From get_content_queue."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ space_id, draft_id }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const r = await api.getContentDraft(userId, space_id, draft_id);
        return textResult({
          draft: r.draft,
          locked: r.locked,
          ...(r.locked_reason ? { locked_reason: r.locked_reason } : {}),
          review_url: r.review_url,
        });
      } catch (error) {
        return toolError(error, "Failed to read the draft");
      }
    }
  );

  // ─── revise_content_draft (approve / chips / edit / plan / restore) ───────
  server.registerTool(
    "revise_content_draft",
    {
      title: "Approve, revise, plan, tag, restore, or discard a draft",
      description:
        "Act on one draft in the user's queue. `stage` = the user approved it (mark ready to publish; to actually post it use publish_content_draft). `discard` drops it. `revise` rewrites it in the brand voice per a one-click preset — shorter, longer, punchier, deeper, simpler, more_specific, less_salesy, more_casual, more_formal — and/or a typed instruction (2 credits). `fix` makes the surgical change the reviewer's notes asked for (2). `humanize` strips the AI feel and keeps everything else (2). `review` scores it against the brand voice (2). `edit` replaces the text with what you or the user wrote (free) — when you can write the better version yourself, prefer edit over revise. `plan` puts it on the calendar for planned_at (YYYY-MM-DD or ISO time; null unplans; free; a plan, not a schedule). `restore` brings back an earlier version by version_id from get_content_draft (free; its old score returns when the filing is unchanged). Every text change saves the previous text as a version, so any step can be undone with restore. Any text change clears the old score. `tag` sets the draft's labels (free): `tags` replaces the list ([] clears), or `add_tags` / `remove_tags` change it in place — use add_tags to put existing posts into a series without dropping their other tags. " + TAG_GUIDANCE + " A scheduled or live draft cannot be changed except for tags (error draft_locked) — tell the user to change it in their scheduler. Stage and discard are the USER's decisions — act on their say-so, never on your own judgment. If the user's reaction should apply to every future draft (not just this one), use teach_content_voice instead.",
      inputSchema: {
        space_id: z.string(),
        draft_id: z.string().describe("From get_content_queue or a write_content_candidates result."),
        action: z.enum(["stage", "discard", "revise", "fix", "humanize", "review", "edit", "plan", "restore", "tag"]),
        preset: z.enum(api.REVISE_PRESETS).optional().describe("revise: the calibration chip the user clicked."),
        instruction: z.string().optional().describe("revise / fix / humanize: the user's note in their words."),
        text: z.string().optional().describe("edit: the replacement text."),
        planned_at: z
          .string()
          .nullable()
          .optional()
          .describe("plan: the day (YYYY-MM-DD) or ISO time to plan it for; null removes it from the calendar."),
        version_id: z.string().optional().describe("restore: a version_id from get_content_draft."),
        tags: z.array(z.string()).optional().describe("tag: the full tag list (replaces; [] clears)."),
        add_tags: z.array(z.string()).optional().describe("tag: tags to add, keeping the others."),
        remove_tags: z.array(z.string()).optional().describe("tag: tags to remove."),
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
      if (args.action === "plan" && args.planned_at === undefined) {
        return errorResult("plan needs `planned_at` (YYYY-MM-DD, an ISO time, or null to unplan).");
      }
      if (args.action === "tag" && !args.tags && !args.add_tags && !args.remove_tags) {
        return errorResult("tag needs `tags` (replaces the list) or `add_tags` / `remove_tags`.");
      }
      if (args.action === "restore" && !args.version_id) {
        return errorResult("restore needs `version_id` — read the versions with get_content_draft.");
      }
      try {
        const r = await api.actOnContentDraft(userId, {
          spaceId: args.space_id,
          draftId: args.draft_id,
          action: args.action,
          preset: args.preset,
          instruction: args.instruction,
          text: args.text,
          plannedAt: args.action === "plan" ? (args.planned_at ?? null) : undefined,
          versionId: args.version_id,
          ...(args.action === "tag"
            ? { tags: args.tags, addTags: args.add_tags, removeTags: args.remove_tags }
            : {}),
        });
        return textResult({
          action: r.action,
          credits_charged: r.credits_charged,
          draft: r.draft,
          review_url: r.review_url,
          ...(r.previous_version_saved !== undefined ? { previous_version_saved: r.previous_version_saved } : {}),
          note: r.note,
          user_note:
            r.action === "stage"
              ? "Approved. It is staged in the content tool. To post it, use publish_content_draft (it shows a preview first)."
              : r.action === "revise" || r.action === "fix" || r.action === "humanize" || r.action === "edit"
                ? "Show the user the new text and ask: keep it, nudge again, go back (restore), or approve?"
                : undefined,
        });
      } catch (error) {
        return toolError(error, "Failed to update the draft");
      }
    }
  );

  // ─── attach_content_image (image by URL or base64) ─────────────────────────
  server.registerTool(
    "attach_content_image",
    {
      title: "Attach an image to a draft",
      description:
        "Attach a photo to one draft (replaces its current image), so it goes out with the post. Pass EXACTLY one of image_url (a public https link to a JPEG / PNG / WebP / GIF — ProductClank downloads it and keeps its own copy) or image_base64 (the image bytes, base64 or a data: URL; keep it under ~3MB). Max 15MB by URL. FREE. remove:true detaches the image instead (kind:'video' detaches a video — a draft with a video posts the video, not the image). A scheduled or live draft can't be changed (draft_locked). Then publish it with publish_content_draft.",
      inputSchema: {
        space_id: z.string(),
        draft_id: z.string().describe("From get_content_queue or a write_content_candidates result."),
        image_url: z.string().url().optional().describe("Public https image URL."),
        image_base64: z.string().optional().describe("The image bytes, base64 (or a data:image/...;base64, URL)."),
        remove: z.boolean().optional().describe("true = detach instead of attach."),
        kind: z.enum(["image", "video"]).optional().describe("With remove: which attachment (default image)."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        if (args.remove) {
          const r = await api.removeContentMedia(userId, {
            spaceId: args.space_id,
            draftId: args.draft_id,
            kind: args.kind ?? "image",
          });
          return textResult({ removed: r.removed, draft: r.draft });
        }
        if (Boolean(args.image_url) === Boolean(args.image_base64)) {
          return errorResult("Pass exactly one of image_url (public https) or image_base64.");
        }
        const r = await api.attachContentImage(userId, {
          spaceId: args.space_id,
          draftId: args.draft_id,
          imageUrl: args.image_url,
          imageBase64: args.image_base64,
        });
        return textResult({
          image_url: r.image_url,
          draft: r.draft,
          note: r.note,
          next_step: "Show the user the draft with its image. To post it, call publish_content_draft (it previews first).",
        });
      } catch (error) {
        return toolError(error, "Failed to attach the image");
      }
    }
  );

  // ─── publish_content_draft (post now / schedule / quote / cancel) ──────────
  server.registerTool(
    "publish_content_draft",
    {
      title: "Publish a draft now or schedule it",
      description:
        "Post one draft (its text + attached image or video) to one of the social accounts connected to the content space — immediately (publish_at 'now', the default) or at a future ISO time. quote_url (an X post link) posts it as a quote of that post. Steps: (1) call WITHOUT account_id to list the space's accounts (channels: account_id, network, handle, provider, cost_credits); (2) call with account_id and WITHOUT confirmed → a free preview, nothing is posted; show the user exactly what will go out, where and when, and the cost; (3) only after the user says yes, call again with confirmed:true. Cost: 1 credit per post on a Post for Me account (provider postforme), free on the space's own Typefully. This posts PUBLICLY from the user's own account — never post without their explicit yes to that preview. Post now usually returns the live link within ~20s (status live); otherwise status publishing and the link appears on the draft (get_content_draft) a few minutes later. A post the platform rejects goes back to Approved and the credit is refunded. cancel:true cancels a SCHEDULED post (free). No accounts? The user connects one in the content tool (Venues → Scheduling).",
      inputSchema: {
        space_id: z.string(),
        draft_id: z.string().optional().describe("The draft to post. Not needed to list accounts."),
        account_id: z.string().optional().describe("From the channels list. Omit to list the space's accounts."),
        publish_at: z.string().optional().describe("'now' (default) or a future ISO datetime, e.g. 2026-12-01T09:00:00Z."),
        quote_url: z.string().url().optional().describe("X post URL to quote (makes this a quote post)."),
        confirmed: z.boolean().optional().describe("true ONLY after the user approved the preview. Omit for a free preview."),
        cancel: z.boolean().optional().describe("true = cancel this draft's scheduled post."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        if (args.cancel) {
          if (!args.draft_id) return errorResult("cancel needs draft_id.");
          const r = await api.cancelScheduledContentPost(userId, { spaceId: args.space_id, draftId: args.draft_id });
          return textResult({
            cancelled: true,
            draft: r.draft,
            ...(r.also_unscheduled.length ? { also_unscheduled: r.also_unscheduled } : {}),
            user_note: "Cancelled. The draft is back in Approved.",
          });
        }
        if (!args.account_id) {
          const r = await api.listPublishChannels(userId, args.space_id);
          return textResult({
            channels: r.channels,
            ...(r.needs_reconnect.length ? { needs_reconnect: r.needs_reconnect } : {}),
            next_step: r.channels.length
              ? "Ask the user which account to post from (if more than one), then call again with account_id and draft_id for a preview."
              : (r.next_step ?? "No connected accounts. The user connects one in the content tool: Venues → Scheduling."),
          });
        }
        if (!args.draft_id) return errorResult("Publishing needs draft_id.");
        const r = await api.publishContentDraft(userId, {
          spaceId: args.space_id,
          draftId: args.draft_id,
          accountId: args.account_id,
          publishAt: args.publish_at,
          quoteUrl: args.quote_url,
          confirm: args.confirmed === true,
        });
        return textResult({
          status: r.status,
          account: r.account,
          live_url: r.live_url,
          scheduled_at: r.scheduled_at,
          credits_charged: r.credits_charged,
          draft: r.draft,
          note: r.note,
          user_note:
            r.status === "live"
              ? `Posted to ${r.account}: ${r.live_url}`
              : r.status === "failed"
                ? r.note
                : r.status === "scheduled"
                  ? `Scheduled on ${r.account} for ${r.scheduled_at}.`
                  : `Sent to ${r.account}. The link will show on the draft in a few minutes.`,
        });
      } catch (error) {
        // The preview is a DECISION, not a failure: show it and ask.
        if (
          error instanceof api.ApiError &&
          error.status === 400 &&
          typeof error.body === "object" &&
          error.body !== null &&
          (error.body as { error?: unknown }).error === "confirmation_required"
        ) {
          const preview = (error.body as { preview?: api.PublishPreview }).preview;
          return textResult({
            status: "confirmation_required",
            nothing_posted: true,
            preview,
            user_note: preview
              ? `Nothing has been posted yet. This would post ${preview.publish_at === "now" ? "right now" : `at ${preview.publish_at}`} to ${preview.account}${preview.quote_url ? `, quoting ${preview.quote_url}` : ""}${preview.image_url ? ", with the attached image" : preview.video_url ? ", with the attached video" : ""}, for ${preview.cost_credits ? `${preview.cost_credits} credit` : "free"}. Show the user the exact text and ask for a yes; then call again with confirmed:true.`
              : "Nothing has been posted yet. Ask the user to confirm, then call again with confirmed:true.",
          });
        }
        return toolError(error, "Failed to publish the draft");
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
