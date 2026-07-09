-- One-time setup: promote the MCP connector's agent to "trusted" so it can bill
-- each connected user's own credits via caller_user_id.
--
-- 1. Register the connector agent once. This returns a pck_live_ key — store it
--    as PRODUCTCLANK_TRUSTED_KEY on the MCP server (Railway env), NOT in git:
--
--      curl -X POST https://api.productclank.com/api/v1/agents/register \
--        -H 'Content-Type: application/json' \
--        -d '{"name":"Claude Connector","description":"ProductClank MCP server for Claude"}'
--
-- 2. Flip that agent to trusted and raise its daily campaign cap. The cap is
--    per-agent, and this single agent creates campaigns for ALL connected users,
--    so keep it high until per-user rate limiting lands (tracked as a follow-up).
--
-- Replace :agent_id with the "agent.id" returned by /agents/register.

update public."Agent"
set trusted = true,
    rate_limit_daily = 100000
where id = ':agent_id';

-- Verify:
-- select id, name, trusted, rate_limit_daily
-- from public."Agent"
-- where id = ':agent_id';
