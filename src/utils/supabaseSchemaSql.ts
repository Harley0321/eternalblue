export const SUPABASE_PROJECT_REF = 'xahsyugciihrrnchufwo';
export const SUPABASE_PROJECT_URL = `https://${SUPABASE_PROJECT_REF}.supabase.co`;
export const SUPABASE_DASHBOARD_URL = `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/settings/general`;
export const SUPABASE_INTEGRATIONS_URL = `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/settings/integrations`;
export const GITHUB_REPO = 'Harley0321/eternalblue';
export const GITHUB_BRANCH = 'main';
export const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO}`;
export const CLOUDFLARE_ACCOUNT_ID = '30cccc3f125f4e676291be3956855ece';
export const CLOUDFLARE_WORKER_NAME = 'eternalblue';
export const CLOUDFLARE_DASHBOARD_URL = `https://dash.cloudflare.com/${CLOUDFLARE_ACCOUNT_ID}/workers/services/view/${CLOUDFLARE_WORKER_NAME}/production/deployments`;
export const CLOUDFLARE_VARIABLES_URL = `https://dash.cloudflare.com/${CLOUDFLARE_ACCOUNT_ID}/workers/services/view/${CLOUDFLARE_WORKER_NAME}/settings/variables`;
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
  "http://localhost:8787",
  "https://*.workers.dev",
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

export const WRANGLER_JSONC = `{
  "name": "${CLOUDFLARE_WORKER_NAME}",
  "main": "worker.ts",
  "compatibility_date": "2025-11-01",
  "observability": {
    "enabled": true
  },
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": [
      "/api/*"
    ]
  },
  "vars": {
    "SUPABASE_URL": "${SUPABASE_PROJECT_URL}",
    "GITHUB_REPO": "${GITHUB_REPO}",
    "GITHUB_BRANCH": "${GITHUB_BRANCH}",
    "CLOUDFLARE_ACCOUNT_ID": "${CLOUDFLARE_ACCOUNT_ID}",
    "CLOUDFLARE_WORKER_NAME": "${CLOUDFLARE_WORKER_NAME}"
  }
}
`;

export const CLOUDFLARE_DEV_VARS_EXAMPLE = `# Local Cloudflare Wrangler secrets template (\`cp .dev.vars.example .dev.vars\`)
# In production, set these as Encrypted Secrets in:
# Cloudflare Dashboard -> Workers & Pages -> ${CLOUDFLARE_WORKER_NAME} -> Settings -> Variables and Secrets

SUPABASE_SERVICE_ROLE_KEY=
# Optional fallback if service role key is not set (requires permissive RLS policies):
SUPABASE_ANON_KEY=
# Optional GitHub token if ${GITHUB_REPO} is private:
GITHUB_TOKEN=
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
    name: Validate & Sync Supabase (${SUPABASE_PROJECT_REF})
    runs-on: ubuntu-latest
    steps:
      - name: Checkout ${GITHUB_REPO}
        uses: actions/checkout@v4

      - name: Validate Supabase config & migration SQL
        run: |
          test -f supabase/config.toml
          ls -1 supabase/migrations/*.sql >/dev/null
          grep -q 'project_id = "${SUPABASE_PROJECT_REF}"' supabase/config.toml

      - name: Check optional CLI push secrets
        id: check-secrets
        env:
          SUPABASE_ACCESS_TOKEN: \${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_DB_PASSWORD: \${{ secrets.SUPABASE_DB_PASSWORD }}
        run: |
          if [ -n "$SUPABASE_ACCESS_TOKEN" ] && [ -n "$SUPABASE_DB_PASSWORD" ]; then
            echo "has_secrets=true" >> "$GITHUB_OUTPUT"
          else
            echo "has_secrets=false" >> "$GITHUB_OUTPUT"
            echo "Supabase CLI Action secrets omitted — using native Supabase Dashboard GitHub Integration."
          fi

      - name: Setup Supabase CLI
        if: steps.check-secrets.outputs.has_secrets == 'true'
        uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Link Supabase Project
        if: steps.check-secrets.outputs.has_secrets == 'true'
        env:
          SUPABASE_ACCESS_TOKEN: \${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_DB_PASSWORD: \${{ secrets.SUPABASE_DB_PASSWORD }}
        run: supabase link --project-ref "${SUPABASE_PROJECT_REF}"

      - name: Push SQL Migrations
        if: steps.check-secrets.outputs.has_secrets == 'true'
        env:
          SUPABASE_ACCESS_TOKEN: \${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_DB_PASSWORD: \${{ secrets.SUPABASE_DB_PASSWORD }}
        run: supabase db push
`;

export const GITHUB_CLOUDFLARE_WORKFLOW_YML = `name: Cloudflare Worker CI & Deploy

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
  workflow_dispatch:

jobs:
  build-and-verify:
    name: Build, Test & Verify (${CLOUDFLARE_WORKER_NAME})
    runs-on: ubuntu-latest
    steps:
      - name: Checkout ${GITHUB_REPO}
        uses: actions/checkout@v4

      - name: Setup Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: TypeScript check
        run: npm run lint

      - name: Run unit tests
        run: npx tsx --test src/utils/posMath.test.ts src/utils/supabaseSync.test.ts

      - name: Build production Vite bundle
        run: npm run build

      - name: Validate Wrangler Worker config
        run: node -e "const fs=require('fs'); const cfg=JSON.parse(fs.readFileSync('wrangler.jsonc','utf8')); if(cfg.name!=='${CLOUDFLARE_WORKER_NAME}') throw new Error('Unexpected worker name'); if(!fs.existsSync(cfg.main)) throw new Error('Missing worker entrypoint');"

      - name: Check optional Cloudflare API Token secret
        id: cf-auth
        env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}
        run: |
          if [ -n "$CLOUDFLARE_API_TOKEN" ] && [ "\${{ github.event_name }}" != "pull_request" ] && [ "\${{ github.ref_name }}" = "main" ]; then
            echo "deploy=true" >> "$GITHUB_OUTPUT"
          else
            echo "deploy=false" >> "$GITHUB_OUTPUT"
            echo "Skipping GitHub Action deploy — Cloudflare Workers Builds Git Integration deploys from main automatically."
          fi

      - name: Deploy Worker via Wrangler (when CLOUDFLARE_API_TOKEN is set)
        if: steps.cf-auth.outputs.deploy == 'true'
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${CLOUDFLARE_ACCOUNT_ID}
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
