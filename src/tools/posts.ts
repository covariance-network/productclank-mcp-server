/**
 * Posts domain — read public conversations. `get_post_replies`: pass a post
 * link, get its replies back with author, text and engagement. X only for now.
 * Billed per page of up to 100 replies actually read (1 credit each).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as api from "../lib/api/index.js";
import { getUserId, textResult, errorResult, toolError, NOT_AUTHED, type ToolExtra } from "./_shared.js";

export function registerPostTools(server: McpServer): void {
  server.registerTool(
    "get_post_replies",
    {
      title: "Read the replies under a post",
      description:
        "The public replies under one post, each with its author (username, name, avatar), text, time and engagement (likes, replies, reposts, views). X posts only for now (x.com / twitter.com status links). Use it to see how people reacted to a launch or announcement, find people worth answering, check sentiment, or pick replies to engage with. Creates nothing and posts nothing. Cost: 1 credit per page of up to 100 replies actually read (an empty page still counts), so the default limit of 100 costs at most 1 credit and the maximum of 500 at most 5 — tell the user the worst case before a call above 100. More replies? Call again with cursor = next_cursor (valid ~15 minutes).",
      inputSchema: {
        url: z.string().url().describe("Link to the post, e.g. https://x.com/user/status/1234567890"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe("How many replies to read (default 100). Billed 1 credit per started 100."),
        cursor: z.string().optional().describe("next_cursor from the previous call, to read the next page(s)."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const r = await api.getPostReplies(userId, {
          url: args.url,
          limit: args.limit,
          cursor: args.cursor,
        });
        return textResult({
          platform: r.platform,
          post: r.post,
          count: r.count,
          replies: r.replies,
          has_more: r.has_more,
          next_cursor: r.next_cursor,
          credits: r.credits,
          ...(r.has_more
            ? { next_step: "More replies exist. Call get_post_replies again with the same url and cursor = next_cursor to read the next page." }
            : {}),
          user_note: `Read ${r.count} ${r.count === 1 ? "reply" : "replies"} for ${r.credits.credits_used} ${r.credits.credits_used === 1 ? "credit" : "credits"}.`,
        });
      } catch (error) {
        return toolError(error, "Could not read the replies");
      }
    }
  );
}
