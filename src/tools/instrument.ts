/**
 * Telemetry wrapper around McpServer.registerTool.
 *
 * Every tool module registers through this proxy, so adding a tool
 * automatically adds it to the funnel — there is no per-tool tracking call to
 * forget. The proxy only intercepts `registerTool`; prompts, resources and
 * everything else pass straight through to the real server (bound to it, so
 * the SDK's own `this` never sees the proxy).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { track } from "../lib/analytics.js";
import { getUserId, type ToolExtra } from "./_shared.js";

type AnyFn = (...args: unknown[]) => unknown;

/** Best-effort error text out of a tool result, for the error event. */
function errorText(result: unknown): string | undefined {
  const content = (result as { content?: unknown })?.content;
  if (!Array.isArray(content)) return undefined;
  const first = content.find(
    (c): c is { type: string; text: string } =>
      typeof (c as { text?: unknown })?.text === "string"
  );
  return first?.text.slice(0, 300);
}

function wrapHandler(toolName: string, handler: AnyFn): AnyFn {
  return async (...args: unknown[]) => {
    const startedAt = Date.now();
    // The tool callback's last argument is always the request `extra`, which
    // carries the OAuth-resolved user id.
    const userId = getUserId(args[args.length - 1] as ToolExtra);
    try {
      const result = await handler(...args);
      const failed = (result as { isError?: boolean })?.isError === true;
      track("mcp_tool_called", userId, {
        tool: toolName,
        ok: !failed,
        duration_ms: Date.now() - startedAt,
      });
      if (failed) {
        track("mcp_tool_error", userId, {
          tool: toolName,
          duration_ms: Date.now() - startedAt,
          error_message: errorText(result),
        });
      }
      return result;
    } catch (error) {
      track("mcp_tool_called", userId, {
        tool: toolName,
        ok: false,
        duration_ms: Date.now() - startedAt,
      });
      track("mcp_tool_error", userId, {
        tool: toolName,
        duration_ms: Date.now() - startedAt,
        threw: true,
        error_message:
          error instanceof Error ? error.message.slice(0, 300) : "unknown error",
      });
      throw error;
    }
  };
}

export function instrumentTools(server: McpServer): McpServer {
  return new Proxy(server, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      const method = value as AnyFn;
      if (prop !== "registerTool") return method.bind(target);
      return (...args: unknown[]) => {
        const lastIndex = args.length - 1;
        const handler = args[lastIndex];
        if (typeof handler !== "function") return method.apply(target, args);
        const wrapped = wrapHandler(String(args[0]), handler as AnyFn);
        return method.apply(target, [...args.slice(0, lastIndex), wrapped]);
      };
    },
  }) as McpServer;
}
