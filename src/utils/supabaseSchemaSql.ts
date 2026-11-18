export const SUPABASE_PROJECT_REF = 'xahsyugciihrrnchufwo';
export const SUPABASE_PROJECT_URL = `https://${SUPABASE_PROJECT_REF}.supabase.co`;
export const SUPABASE_DASHBOARD_URL = `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/settings/general`;
export const SUPABASE_INTEGRATIONS_URL = `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/settings/integrations`;
export const GITHUB_REPO = 'Harley0321/eternalblue';
export const GITHUB_BRANCH = 'main';
export const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO}`;
export const SUPABASE_MIGRATION_FILENAME = '20261118000001_omnimart_pos_schema.sql';

export const SUPABASE_CONFIG_TOML = `# Supabase CLI & GitHub Integration configuration
# Project: ${SUPABASE_DASHBOARD_URL}
# Linked GitHub repository: ${GITHUB_REPO_URL}

project_id = "${SUPABASE_PROJECT_REF}"

[api]
enabled = true
port = 54321
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[db]
port = 54322
shadow_port = 54320
major_version = 15

[db.seed]
enabled = true
sql_paths = ["./seed.sql"]

[studio]
enabled = true
port = 54323
api_url = "http://127.0.0.1"

[auth]
enabled = true
site_url = "http://localhost:3000"
additional_redirect_urls = [
  "https://ais-dev-skjoiwxfowfscywb3bccw2-888641477712.asia-northeast1.run.app",
  "https://ais-pre-skjoiwxfowfscywb3bccw2-888641477712.asia-northeast1.run.app"
]
jwt_expiry = 3600
enable_signup = true

[analytics]
enabled = false
`;

export const SUPABASE_SEED_SQL = `-- Seed placeholder for Supabase GitHub Branching / \`supabase db reset\`.
-- POS store catalog and transactions are seeded/synced directly per store_id.
`;

export const GITHUB_SUPABASE_WORKFLOW_YML = `name: Supabase Schema Sync

on:
  push:
    branches:
      - main
    paths:
      - 'supabase/migrations/**'
      - 'supabase/config.toml'
      - 'supabase/seed.sql'
      - '.github/workflows/supabase-sync.yml'
  workflow_dispatch:

jobs:
  push-migrations:
    name: Push Migrations to Supabase (${SUPABASE_PROJECT_REF})
    runs-on: ubuntu-latest
    env:
      SUPABASE_ACCESS_TOKEN: \${{ secrets.SUPABASE_ACCESS_TOKEN }}
      SUPABASE_DB_PASSWORD: \${{ secrets.SUPABASE_DB_PASSWORD }}
      SUPABASE_PROJECT_ID: ${SUPABASE_PROJECT_REF}
    steps:
      - name: Checkout ${GITHUB_REPO}
        uses: actions/checkout@v4

      - name: Verify Supabase secrets are configured
        run: |
          if [ -z "$SUPABASE_ACCESS_TOKEN" ] || [ -z "$SUPABASE_DB_PASSWORD" ]; then
            echo "Missing SUPABASE_ACCESS_TOKEN or SUPABASE_DB_PASSWORD repository secrets."
            echo "Add both in GitHub Repo Settings -> Secrets and variables -> Actions, or use Supabase Dashboard -> Integrations -> GitHub."
            exit 1
          fi

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Link Supabase Project
        run: supabase link --project-ref "$SUPABASE_PROJECT_ID"

      - name: Push SQL Migrations
        run: supabase db push
`;

export const SUPABASE_SCHEMA_SQL = `-- OmniMart PH POS — Supabase Cloud Sync Schema
-- Project: ${SUPABASE_DASHBOARD_URL}
-- Run this script once in your Supabase SQL Editor.

create table if not exists public.pos_stores (
  store_id text primary key,
  store_name text not null default 'OmniMart PH Supermarket',
  settings jsonb not null default '{}'::jsonb,
  config_history jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.pos_products (
  store_id text not null,
  id text not null,
  barcode text not null default '',
  name text not null,
  category text not null default 'Uncategorized',
  unit text not null default 'pc',
  capital numeric,
  retail_price numeric not null default 0,
  wholesale_price numeric not null default 0,
  wholesale_min_qty numeric not null default 10,
  stock numeric not null default 0,
  expiry text,
  sc_eligible boolean,
  icon text,
  icon_color text,
  deleted boolean not null default false,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (store_id, id)
);

create index if not exists idx_pos_products_store_updated
  on public.pos_products (store_id, updated_at desc);

create table if not exists public.pos_sales (
  store_id text not null,
  receipt_no text not null,
  date_iso timestamptz not null,
  date_formatted text not null default '',
  items jsonb not null default '[]'::jsonb,
  retail_subtotal numeric not null default 0,
  wholesale_savings numeric not null default 0,
  senior_discount numeric not null default 0,
  grand_total numeric not null default 0,
  payment_method text not null default 'Cash',
  tendered numeric not null default 0,
  change numeric not null default 0,
  ref_no text,
  split_details jsonb,
  senior_id text,
  senior_base numeric,
  senior_capped boolean,
  voided boolean not null default false,
  voided_at timestamptz,
  void_reason text,
  updated_at timestamptz not null default now(),
  primary key (store_id, receipt_no)
);

create index if not exists idx_pos_sales_store_date
  on public.pos_sales (store_id, date_iso desc);

create table if not exists public.pos_held_orders (
  store_id text not null,
  id text not null,
  label text,
  time text not null default '',
  items jsonb not null default '[]'::jsonb,
  total numeric not null default 0,
  is_senior_pwd boolean not null default false,
  price_mode text not null default 'retail',
  updated_at timestamptz not null default now(),
  primary key (store_id, id)
);

create table if not exists public.pos_stock_logs (
  store_id text not null,
  id text not null,
  date_iso timestamptz not null,
  product_id text not null,
  product_name text not null,
  delta numeric not null default 0,
  prev_stock numeric not null default 0,
  new_stock numeric not null default 0,
  reason text not null default 'Other',
  note text,
  primary key (store_id, id)
);

create index if not exists idx_pos_stock_logs_store_date
  on public.pos_stock_logs (store_id, date_iso desc);

-- Keep Row Level Security enabled; server.ts uses SUPABASE_SERVICE_ROLE_KEY.
alter table public.pos_stores enable row level security;
alter table public.pos_products enable row level security;
alter table public.pos_sales enable row level security;
alter table public.pos_held_orders enable row level security;
alter table public.pos_stock_logs enable row level security;`;
