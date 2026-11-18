-- OmniMart PH POS — Initial Supabase Cloud Sync Schema Migration
-- Linked Project: xahsyugciihrrnchufwo
-- Linked GitHub Repo: Harley0321/eternalblue

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
alter table public.pos_stock_logs enable row level security;
