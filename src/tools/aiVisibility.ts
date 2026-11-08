/**
 * AI-visibility domain — the owner side. Real people ask ChatGPT / Claude the
 * product's buying questions from their own accounts (fresh chat) and submit
 * the shared chat link or a screenshot; once the check ends the owner gets a
 * report: how often the product comes up, who gets named instead, the exact
 * words. The agent cannot answer a check — a person must ask the model.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as api from "../lib/api/index.js";
import { getUserId, textResult, errorResult, toolError, NOT_AUTHED, type ToolExtra } from "./_shared.js";

const MODELS = ["ChatGPT", "Claude", "Gemini", "Perplexity", "Grok"] as const;

export function registerAiVisibilityTools(server: McpServer): void {
  server.registerTool(
    "create_ai_visibility_check",
    {
      title: "Check what ChatGPT and Claude say about a product",
      description:
        "Find out what AI assistants tell buyers about the product: real people ask ChatGPT / Claude (and optionally Gemini, Perplexity, Grok) the product's buying questions from their OWN accounts in a fresh chat, and send back the shared chat link or a screenshot. Once the check ends (default 4 days) the owner generates a report: how often the product comes up, who gets named instead, and the exact words — nothing is probed through an API, and nobody on the panel is paid more when the product's name shows up. COST: one flat launch fee of 1,000 credits at create, whatever the panel size; the panel earns ProductClank points; the report is free. Call with dry_run:true first — it returns the brief and the price and creates nothing — show it to the user, then call again with dry_run:false once they say yes. Give it the buying questions the user cares about (or omit questions to let people ask in their own words). Nothing is posted anywhere.",
      inputSchema: {
        product_id: z.string().describe("Product UUID (from search_products or create_product)."),
        questions: z
          .array(z.string().min(1).max(200))
          .max(30)
          .optional()
          .describe("Optional 1–30 buying questions the panel picks from, e.g. 'best analytics tool for solo founders'. Omit to let people ask in their own words."),
        models: z.array(z.enum(MODELS)).optional().describe("Assistants to ask. Default ChatGPT + Claude."),
        days: z.number().int().min(1).max(14).optional().describe("How long the panel has to ask (default 4)."),
        max_participants: z.number().int().min(1).max(200).optional().describe("Panel size: people who may submit an answer (default 40)."),
        dry_run: z.boolean().optional().describe("true = return the brief and the price, create nothing, charge nothing. Do this first."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ product_id, questions, models, days, max_participants, dry_run }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const r = await api.createAiVisibilityCheck(userId, {
          product_id,
          ...(questions?.length ? { questions } : {}),
          ...(models?.length ? { models } : {}),
          ...(days !== undefined ? { days } : {}),
          ...(max_participants !== undefined ? { max_participants } : {}),
          ...(dry_run !== undefined ? { dry_run } : {}),
        });
        if (r.dry_run) {
          return textResult({
            dry_run: true,
            proposal: r.proposal,
            credits_required: r.credits.credits_required,
            credits_available: r.credits.credits_available,
            user_note: "Nothing was created. One flat fee of 1,000 credits launches it; the people who ask earn points; the report is free.",
            next_step: r.next_step,
          });
        }
        return textResult({
          check_id: r.campaign?.id,
          check_url: r.campaign?.public_url,
          admin_url: r.campaign?.admin_url,
          ends_at: r.campaign?.ends_at,
          models: r.check?.models,
          question_count: r.check?.question_count,
          max_participants: r.check?.max_participants,
          report_url: r.check?.report_url,
          credits_used: r.credits.credits_used,
          credits_available: r.credits.credits_available,
          next_step: "Share check_url so people ask. Follow progress with get_ai_visibility_results; once ends_at has passed, run generate_ai_visibility_report.",
        });
      } catch (error) {
        return toolError(error, "Could not create the AI-visibility check");
      }
    }
  );

  server.registerTool(
    "get_ai_visibility_results",
    {
      title: "Get AI-visibility check results",
      description:
        "Results of one of the user's AI-visibility checks (made here or in the web app): state (active / ended), how many people submitted (shared chat links vs screenshots, approved vs pending) and — once generated — the report itself with its private URL. Free, read-only. If the check has ended with submissions and there is no report yet, offer generate_ai_visibility_report.",
      inputSchema: {
        check_id: z.string().uuid().describe("The check id from create_ai_visibility_check."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ check_id }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const r = await api.getAiVisibilityResults(userId, check_id);
        return textResult({
          check: r.campaign,
          submissions: r.submissions,
          report: r.report,
          report_generated_at: r.report_generated_at,
          report_url: r.report_url,
          next_step: r.next_step,
        });
      } catch (error) {
        return toolError(error, "Could not load the check results");
      }
    }
  );

  server.registerTool(
    "generate_ai_visibility_report",
    {
      title: "Generate the AI-visibility report",
      description:
        "Generate (or regenerate) the report for an AI-visibility check from everything the panel submitted: the verdict, how the models describe the product, strengths, risks with how often they came up, verbatim quotes, findings and ranked recommendations. Free. It waits for the check to end so the report covers the whole panel; pass allow_partial:true to report on what is in so far (you can regenerate later). Relay the verdict, risks and recommendations to the user and give them report_url (private: the owner and their delegates).",
      inputSchema: {
        check_id: z.string().uuid().describe("The check id."),
        allow_partial: z.boolean().optional().describe("Generate before the check has ended, from the submissions in so far."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ check_id, allow_partial }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const r = await api.generateAiVisibilityReport(userId, check_id, allow_partial === true);
        return textResult({
          report: r.report,
          report_url: r.report_url,
          partial: r.partial,
          next_step: r.next_step,
        });
      } catch (error) {
        return toolError(error, "Could not generate the report");
      }
    }
  );
}
