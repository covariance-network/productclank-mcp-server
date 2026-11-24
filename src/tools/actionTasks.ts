/**
 * Action campaigns — a list of concrete tasks, each ONE action in ONE place
 * ("post our launch in the FraCMO Slack #intros", "list us on this directory").
 * Members claim a task, do it from their OWN account, send proof; the owner
 * approves; the reward is paid (points, or USDC from a pool the user deposits).
 *
 * Owner tools: create_action_campaign (dry run → confirmed), publish_action_tasks,
 * update_action_tasks, get_action_campaign_results, review_submissions.
 * Participant tools: claim_task, release_task, upload_proof_screenshot (proof
 * itself goes through submit_campaign_work with task_id).
 * Planning guidelines: the resource productclank://guides/action-campaign.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as api from "../lib/api/index.js";
import { getUserId, textResult, errorResult, toolError, NOT_AUTHED, type ToolExtra } from "./_shared.js";

export const ACTION_GUIDE_URI = "productclank://guides/action-campaign";

const ACTION_GUIDE = `# Planning an action campaign

An action campaign is a list of tasks. Each task is ONE action in ONE place, done by a member from their own account. You plan the list WITH the user; ProductClank checks it, runs it, and pays for approved work. ProductClank never posts for anyone.

## 1. Pick destinations
- Places where the product's buyers already gather: Slack / Discord communities, subreddits, newsletters that take submissions, directories, review sites, repos.
- READ EACH PLACE'S RULES on self-promotion. If the rules forbid it, do NOT create the task. If it allows it only in one channel or on one day ("self-promo Friday"), say so in \`instructions\` and set \`claim_ttl_hours\` up to 168 so the member can wait for that day.
- One live task per destination. A destination where any ProductClank campaign posted in the last 14 days is blocked (the dry run flags it).
- Do NOT create a task when: there is no way to join, placement is paid only, the rules forbid it, or nobody in the network is likely to be a member.

## 2. Write a draft per destination
- Native to that place: its tone, its length, its format. Value first (what the reader gets), the product second.
- A link only where the place allows links: write {{TRACKED_LINK}} there and the member gets the draft with their own tracked link in its place.
- The draft is a starting point. The member is told to rewrite it in their own words; never ask them to paste it as is.

## 3. Exclusive or open
- **exclusive** (default): one member does it. Right for any community, group chat or forum — one post per place.
- **open** (max_completions): many members may do it. ONLY for actions that are naturally many-per-person: reviews, stars, sign-ups. Open in a community = the same post many times = spam and bans.

## 4. Rewards
- An amount per task, never a percentage: points, or dollars (\`reward_kind: "usdc"\`). Harder or gated places pay more ($10–$50 is a normal range).
- Cash tasks need a deposit: Σ reward × completions + a 10% fee, paid by the USER at fund_url (card or USDC). Points-only campaigns need no deposit.
- Publishing costs credits per task (see check_balance). Start with a test of ~5 tasks, read the results, then add more.

## 5. Eligibility and proof
- Membership by default: the claimer confirms they are already a member and gives a profile link. Add \`extra_requirements\` for high-value places.
- \`proof_type\`: \`link\` where the post has a URL, \`screenshot\` for closed groups, \`either\` when unsure.

## 6. After launch
- get_action_campaign_results: task states, holders, proofs, clicks, sign-ups. Claims trickle in over days; check back, don't poll.
- Show each proof to the user before review_submissions — approving pays.
`;

const taskSchema = z.object({
  destination_name: z.string().min(1).max(200).describe('Where, e.g. "FraCMO Slack"'),
  destination_url: z.string().url().optional().describe("Invite, channel or listing URL — identifies the place for the one-task-per-place rule"),
  destination_kind: z.enum(["community", "newsletter", "directory", "review_site", "social", "repo", "other"]).optional(),
  title: z.string().min(1).max(200).describe('The action, e.g. "Post in #intros"'),
  instructions: z.string().max(4000).optional().describe("Where exactly, when, the place's rules"),
  draft_text: z.string().max(4000).optional().describe("A starting draft written for that place. Members rewrite it."),
  requires_membership: z.boolean().optional().describe("Default true"),
  extra_requirements: z.string().max(1000).optional(),
  proof_type: z.enum(["link", "screenshot", "either"]).optional(),
  reward_kind: z.enum(["points", "usdc"]).optional().describe("Default points"),
  reward_amount: z.number().positive().describe("Points, or dollars for usdc — an amount, never a percent"),
  mode: z.enum(["exclusive", "open"]).optional().describe("Default exclusive. open ONLY for reviews / stars / sign-ups"),
  max_completions: z.number().int().min(1).max(500).optional().describe("open tasks only"),
  claim_ttl_hours: z.number().int().min(1).max(168).optional(),
});

export function registerActionTaskTools(server: McpServer): void {
  // ─── guidelines resource ──────────────────────────────────────────────────
  server.registerResource(
    "action-campaign-guide",
    ACTION_GUIDE_URI,
    {
      title: "How to plan an action campaign",
      description: "Read BEFORE create_action_campaign: picking destinations, drafts, exclusive vs open, rewards, when a task should not exist.",
      mimeType: "text/markdown",
    },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: ACTION_GUIDE }] })
  );

  // ─── create_action_campaign ───────────────────────────────────────────────
  server.registerTool(
    "create_action_campaign",
    {
      title: "Create an action campaign (tasks: one action in one place)",
      description:
        `A list of concrete tasks, each ONE action in ONE place done by a community member from their own account: "post our launch in the FraCMO Slack #intros", "list us on this directory", "submit us to this newsletter". Use it when the user's buyers gather in specific communities, newsletters or directories, and a member posting there beats an ad. NOT for several people replying to, quoting or reposting ONE social post — that is boost_post (it takes space_id too); here every task needs its own place. Read ${ACTION_GUIDE_URI} first and plan the list WITH the user. TWO STEPS: (1) call without confirmed — a FREE dry run: every task is checked (duplicate places, places in the 14-day cooldown, open tasks in communities), and you get the publish price (credits per task) and the cash deposit for usdc tasks. Show the user the list, the warnings and the price. (2) On a yes, call again with confirmed:true: the campaign is created HELD (tasks are drafts, nothing is live, nothing charged). Then: usdc tasks → give the user fund_url to deposit; then publish_action_tasks (charges credits per task).`,
      inputSchema: {
        title: z.string().min(1).max(120),
        brief: z.string().max(4000).optional().describe("What the campaign is for, shown to participants"),
        product_id: z.string().optional().describe("From search_products / create_product"),
        space_id: z.string().optional().describe("Run inside one of the user's spaces (id from list_spaces; members only, Stars). Omit for the public network."),
        target_url: z.string().url().optional().describe("Where each task's tracked link sends people (the product / a landing page). Default: the product's website."),
        tasks: z.array(taskSchema).min(1).max(50),
        claim_ttl_hours: z.number().int().min(1).max(168).optional().describe("Default hold for exclusive tasks (24)"),
        duration_days: z.number().int().min(1).max(90).optional().describe("Default 30"),
        confirmed: z.boolean().optional().describe("Leave unset for the free dry run. true ONLY after the user agreed to the list and the price."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const r = await api.createActionCampaign({
          callerUserId: userId,
          title: args.title,
          brief: args.brief,
          productId: args.product_id,
          spaceId: args.space_id,
          targetUrl: args.target_url,
          tasks: args.tasks,
          claimTtlHours: args.claim_ttl_hours,
          durationDays: args.duration_days,
          confirmed: args.confirmed === true,
        });
        return textResult({
          ...r,
          guide: ACTION_GUIDE_URI,
          user_note:
            args.confirmed === true
              ? "Created and held: nothing is live and nothing is charged yet."
              : "Dry run: nothing created, nothing charged.",
        });
      } catch (error) {
        return toolError(error, "Could not create the action campaign");
      }
    }
  );

  // ─── publish_action_tasks ─────────────────────────────────────────────────
  server.registerTool(
    "publish_action_tasks",
    {
      title: "Publish action-campaign tasks (make them live)",
      description:
        "Draft tasks → open: members can now see, claim and do them. Charges credits PER TASK opened (see the dry run's pricing; confirm with the user first). A cash campaign must be funded first (the error returns fund_url). Tasks whose place is in the 14-day cooldown stay draft, are listed in `blocked`, and cost nothing. Omit task_ids to publish every draft.",
      inputSchema: {
        campaign_id: z.string(),
        task_ids: z.array(z.string()).optional().describe("Publish only these"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ campaign_id, task_ids }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        return textResult(await api.publishActionTasks({ callerUserId: userId, campaignId: campaign_id, taskIds: task_ids }));
      } catch (error) {
        return toolError(error, "Could not publish the tasks");
      }
    }
  );

  // ─── update_action_tasks ──────────────────────────────────────────────────
  server.registerTool(
    "update_action_tasks",
    {
      title: "Add, edit or close action-campaign tasks",
      description:
        "Free (tasks are charged when published). add: new tasks (they start as drafts — publish them). edit: [{task_id, …fields}] — the place, reward, cap and mode are locked while someone holds the task or after an approval. close: task ids; a held task can't be closed until the hold ends. A funded cash pool never changes, so cash tasks can be added or re-priced only before funding; the new deposit is returned.",
      inputSchema: {
        campaign_id: z.string(),
        add: z.array(taskSchema).optional(),
        edit: z.array(taskSchema.partial().extend({ task_id: z.string() })).optional(),
        close: z.array(z.string()).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ campaign_id, add, edit, close }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        return textResult(await api.updateActionTasks({ callerUserId: userId, campaignId: campaign_id, add, edit, close }));
      } catch (error) {
        return toolError(error, "Could not change the tasks");
      }
    }
  );

  // ─── get_action_campaign_results ──────────────────────────────────────────
  server.registerTool(
    "get_action_campaign_results",
    {
      title: "Action campaign results",
      description:
        "Free, read-only. Every task's state (draft / available / held / in_review / done / closed), who holds it, clicks and sign-ups through its tracked link, and every proof (pending first) with its submission_id — show proofs to the user, then review_submissions. Also the cash pool and whether it is funded. Claims trickle in over days: check back later, don't poll.",
      inputSchema: { campaign_id: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ campaign_id }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        return textResult({
          ...(await api.getActionCampaignResults({ callerUserId: userId, campaignId: campaign_id })),
          reading_guide:
            "Report approved tasks as delivered; pending proofs are unreviewed work, not results. Clicks exclude link-preview bots; sign-ups count new ProductClank accounts only.",
        });
      } catch (error) {
        return toolError(error, "Could not load the results");
      }
    }
  );

  // ─── review_submissions ───────────────────────────────────────────────────
  server.registerTool(
    "review_submissions",
    {
      title: "Approve or reject action-campaign proofs",
      description:
        "The owner's decision on proofs, free. approve PAYS the task's reward (points at once, or USDC from the funded pool via ProductClank's payout run) — show the user each proof (proof_url / screenshot_url, the member's profile_url) and get their decision first; never approve on your own judgment. reject reopens an exclusive task for others; that member can't redo it. Up to 20 decisions per call, each applied on its own.",
      inputSchema: {
        campaign_id: z.string(),
        decisions: z
          .array(
            z.object({
              submission_id: z.string(),
              decision: z.enum(["approve", "reject"]),
              note: z.string().max(1000).optional().describe("Shown to the member; say why on a reject"),
            })
          )
          .min(1)
          .max(20),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ campaign_id, decisions }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      const results: Record<string, unknown>[] = [];
      for (const d of decisions) {
        try {
          const r = await api.reviewSubmission({
            callerUserId: userId,
            campaignId: campaign_id,
            submissionId: d.submission_id,
            decision: d.decision,
            note: d.note,
          });
          results.push({ submission_id: d.submission_id, ok: true, ...r });
        } catch (error) {
          results.push({ submission_id: d.submission_id, ok: false, error: error instanceof Error ? error.message : "failed" });
        }
      }
      return textResult({ results });
    }
  );

  // ─── participant: claim_task / release_task / upload_proof_screenshot ─────
  server.registerTool(
    "claim_task",
    {
      title: "Claim an action-campaign task for the user",
      description:
        "Hold an exclusive task for the user (default 24h) and get its draft, tracked link and proof rule. Pick tasks in places the user is ALREADY a member of — ask them. Membership tasks need attest_member:true (the USER confirms; never assume) and profile_url. Then: help the user rewrite draft_text in their own voice and post it THEMSELVES; then submit_campaign_work with task_id. If they can't, release_task. Open tasks need no claim. Free.",
      inputSchema: {
        campaign_id: z.string(),
        task_id: z.string().describe("From get_campaign_brief's tasks"),
        attest_member: z.boolean().optional().describe("The USER confirmed they are already a member there"),
        profile_url: z.string().url().optional().describe("The user's profile in that place, or a public profile"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ campaign_id, task_id, attest_member, profile_url }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        return textResult(
          await api.claimTask({ callerUserId: userId, campaignId: campaign_id, taskId: task_id, attestMember: attest_member, profileUrl: profile_url })
        );
      } catch (error) {
        return toolError(error, "Could not claim the task");
      }
    }
  );

  server.registerTool(
    "release_task",
    {
      title: "Release a held task",
      description: "Drop the user's hold so someone else can take the task. Not possible once their proof is in review. Free.",
      inputSchema: { campaign_id: z.string(), task_id: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ campaign_id, task_id }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        return textResult(await api.releaseTask({ callerUserId: userId, campaignId: campaign_id, taskId: task_id }));
      } catch (error) {
        return toolError(error, "Could not release the task");
      }
    }
  );

  server.registerTool(
    "upload_proof_screenshot",
    {
      title: "Upload a proof screenshot",
      description:
        "Store a screenshot the user gave you as proof (for tasks whose proof is a screenshot, e.g. a closed Slack). Returns screenshot_url → pass it to submit_campaign_work with task_id. PNG / JPG / WebP / GIF, 5 MB max; a blank image is refused. Free.",
      inputSchema: {
        campaign_id: z.string(),
        image_base64: z.string().min(1).describe("The image as base64 (a data: URL also works)"),
        content_type: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
        file_name: z.string().max(200).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ campaign_id, image_base64, content_type, file_name }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        return textResult(
          await api.uploadProofScreenshot({ callerUserId: userId, campaignId: campaign_id, imageBase64: image_base64, contentType: content_type, fileName: file_name })
        );
      } catch (error) {
        return toolError(error, "Upload failed");
      }
    }
  );
}
