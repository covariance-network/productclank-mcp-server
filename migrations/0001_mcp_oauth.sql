-- MCP OAuth authorization-server persistence.
-- Apply to the ProductClank database (shared with the webapp).
-- The MCP server accesses these tables exclusively via the service-role key.

create table if not exists public.mcp_oauth_clients (
  client_id text primary key,
  client_secret text,
  client_name text,
  redirect_uris text[] not null default '{}',
  token_endpoint_auth_method text not null default 'none',
  created_at timestamptz not null default now()
);

create table if not exists public.mcp_login_states (
  state text primary key,
  client_id text not null,
  redirect_uri text not null,
  code_challenge text not null,
  code_challenge_method text not null default 'S256',
  scope text not null default '',
  client_state text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.mcp_auth_codes (
  code text primary key,
  client_id text not null,
  user_id uuid not null,
  redirect_uri text not null,
  code_challenge text not null,
  code_challenge_method text not null default 'S256',
  scope text not null default '',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  access_token text not null unique,
  refresh_token text not null unique,
  client_id text not null,
  user_id uuid not null,
  scope text not null default '',
  access_token_expires_at timestamptz not null,
  refresh_token_expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mcp_tokens_refresh_idx on public.mcp_tokens (refresh_token);
create index if not exists mcp_tokens_user_idx on public.mcp_tokens (user_id);
create index if not exists mcp_login_states_expires_idx on public.mcp_login_states (expires_at);
create index if not exists mcp_auth_codes_expires_idx on public.mcp_auth_codes (expires_at);

-- These tables hold OAuth secrets and are read/written only by the MCP server's
-- service-role client. Enable RLS with NO policies so anon/authenticated roles
-- cannot read them; the service role bypasses RLS.
alter table public.mcp_oauth_clients enable row level security;
alter table public.mcp_login_states enable row level security;
alter table public.mcp_auth_codes enable row level security;
alter table public.mcp_tokens enable row level security;
