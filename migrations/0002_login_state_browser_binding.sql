-- Bind each OAuth login state to the browser that started it.
-- /oauth/authorize sets a nonce cookie (scoped to /oauth/callback) and stores
-- its sha256 here; /oauth/callback accepts the state only when the same
-- browser presents the cookie. Closes a consent-bypass where a `state` copied
-- out of the authorize redirect could be completed from another browser.
-- Apply to the ProductClank database (dev + prod) BEFORE deploying the server
-- build that writes this column.

alter table public.mcp_login_states
  add column if not exists browser_nonce_hash text;

comment on column public.mcp_login_states.browser_nonce_hash is
  'sha256 of the pc_mcp_login browser cookie set at /oauth/authorize; the callback requires a match. Null only on pre-binding rows.';
