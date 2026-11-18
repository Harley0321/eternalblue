import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_DASHBOARD_URL,
  CLOUDFLARE_WORKER_NAME,
  GITHUB_BRANCH as DEFAULT_GITHUB_BRANCH,
  GITHUB_REPO as DEFAULT_GITHUB_REPO,
  SUPABASE_PROJECT_REF as DEFAULT_PROJECT_REF,
} from './supabaseSchemaSql.ts';

export interface SyncRuntimeEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_SERVICE_KEY?: string;
  SUPABASE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  GITHUB_REPO?: string;
  GITHUB_BRANCH?: string;
  GITHUB_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_WORKER_NAME?: string;
}

export interface WorkspaceIntegrationOverrides {
  runtime?: 'node' | 'cloudflare-worker';
  hasConfigToml?: boolean;
  hasWorkflow?: boolean;
  hasCloudflareWorkflow?: boolean;
  hasWranglerConfig?: boolean;
  hasWorkerEntry?: boolean;
  migrations?: string[];
}

interface ProductDto {
  id: string;
  barcode: string;
  name: string;
  category: string;
  unit: string;
  capital?: number;
  retailPrice: number;
  wholesalePrice: number;
  wholesaleMinQty: number;
  stock: number;
  expiry?: string;
  scEligible?: boolean;
  icon?: string;
  iconColor?: string;
  updatedAt?: string;
}

interface SaleRecordDto {
  receiptNo: string;
  dateIso: string;
  dateFormatted: string;
  items: unknown[];
  retailSubtotal: number;
  wholesaleSavings: number;
  seniorDiscount: number;
  grandTotal: number;
  paymentMethod: string;
  tendered: number;
  change: number;
  refNo?: string;
  splitDetails?: unknown;
  seniorId?: string;
  seniorBase?: number;
  seniorCapped?: boolean;
  voided?: boolean;
  voidedAt?: string;
  voidReason?: string;
}

interface HeldOrderDto {
  id: string;
  label?: string;
  time: string;
  items: unknown[];
  total: number;
  isSeniorPwd?: boolean;
  priceMode?: string;
}

interface StockLogDto {
  id: string;
  dateIso: string;
  productId: string;
  productName: string;
  delta: number;
  prevStock: number;
  newStock: number;
  reason: string;
  note?: string;
}

const STRIPPED_CREDENTIAL_KEYS = new Set([
  'adminPin',
  'adminPinHash',
  'adminPinSalt',
  'adminPinIter',
  'adminPinAlgo',
  'adminPinWeak',
  'passkeyCredId',
  'passkeyPubKeySpki',
  'passkeyLabel',
  'passkeyRegisteredAt',
  'syncStoreId',
  'syncStoreIdCustomized',
  'syncEnabled',
  'lastSyncedAt',
  'lastBackup',
]);

function extractProjectRef(url: string): string {
  const dashMatch = String(url || '').match(/supabase\.com\/dashboard\/project\/([a-z0-9-]+)/i);
  if (dashMatch) return dashMatch[1];
  const m = String(url || '').match(/^https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
  return m ? m[1] : DEFAULT_PROJECT_REF;
}

function normalizeSupabaseUrl(raw?: string): string {
  const unquoted = String(raw || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .trim()
    .replace(/\/+$/, '');

  if (!unquoted) {
    return `https://${DEFAULT_PROJECT_REF}.supabase.co`;
  }

  // Handle pasted Supabase Dashboard URLs gracefully
  const dashMatch = unquoted.match(/supabase\.com\/dashboard\/project\/([a-z0-9-]+)/i);
  if (dashMatch) {
    return `https://${dashMatch[1]}.supabase.co`;
  }

  // Handle bare project ref (e.g. "xahsyugciihrrnchufwo")
  if (/^[a-z0-9-]+$/i.test(unquoted)) {
    return `https://${unquoted}.supabase.co`;
  }

  // Handle missing protocol (e.g. "xahsyugciihrrnchufwo.supabase.co")
  const candidate = /^https?:\/\//i.test(unquoted) ? unquoted : `https://${unquoted}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return `${parsed.protocol}//${parsed.host}`;
    }
  } catch {
    // fallback below
  }
  return `https://${DEFAULT_PROJECT_REF}.supabase.co`;
}

function normalizeGithubRepo(raw?: string): string {
  const cleaned = String(raw || DEFAULT_GITHUB_REPO)
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
  return cleaned || DEFAULT_GITHUB_REPO;
}

export function normalizeStoreId(raw: unknown): string {
  const cleaned = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'main-store';
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function sanitizeSettings(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!STRIPPED_CREDENTIAL_KEYS.has(k)) clean[k] = v;
  }
  return clean;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function decodeJwtRole(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = atob(padded);
    const parsed = JSON.parse(json) as { role?: unknown };
    return typeof parsed.role === 'string' ? parsed.role : null;
  } catch {
    return null;
  }
}

export function detectSupabaseKeyRole(key: string): 'service' | 'anon' | 'unknown' | 'none' {
  const trimmed = key.trim();
  if (!trimmed) return 'none';
  if (trimmed.startsWith('sb_publishable_')) return 'anon';
  if (trimmed.startsWith('sb_secret_')) return 'service';
  const jwtRole = decodeJwtRole(trimmed);
  if (jwtRole === 'anon' || jwtRole === 'authenticated') return 'anon';
  if (jwtRole === 'service_role') return 'service';
  return 'unknown';
}

function dedupeByKey<T>(rows: T[], getKey: (row: T) => string): T[] {
  const map = new Map<string, T>();
  for (const row of rows) {
    map.set(getKey(row), row);
  }
  return Array.from(map.values());
}

function formatSupabaseDbError(message: string): string {
  if (/row-level security|42501/i.test(message)) {
    return `${message} — Ensure SUPABASE_SERVICE_ROLE_KEY (service_role or sb_secret_...), not the public/anon key, is set on the server/Worker.`;
  }
  return message;
}

function resolveEnvConfig(env: SyncRuntimeEnv) {
  const supabaseUrl = normalizeSupabaseUrl(env.SUPABASE_URL);
  const rawKey =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.SUPABASE_SECRET_KEY ||
    env.SUPABASE_SERVICE_KEY ||
    env.SUPABASE_KEY ||
    env.SUPABASE_ANON_KEY ||
    env.SUPABASE_PUBLISHABLE_KEY ||
    '';
  const supabaseKey = rawKey
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .trim();
  const keyRole = detectSupabaseKeyRole(supabaseKey);
  const projectRef = extractProjectRef(supabaseUrl);
  const dashboardUrl = `https://supabase.com/dashboard/project/${projectRef}/settings/general`;
  const integrationsUrl = `https://supabase.com/dashboard/project/${projectRef}/settings/integrations`;
  const githubRepo = normalizeGithubRepo(env.GITHUB_REPO);
  const githubBranch = (env.GITHUB_BRANCH || DEFAULT_GITHUB_BRANCH).trim() || DEFAULT_GITHUB_BRANCH;
  const githubRepoUrl = `https://github.com/${githubRepo}`;
  const workerName = (env.CLOUDFLARE_WORKER_NAME || CLOUDFLARE_WORKER_NAME).trim() || CLOUDFLARE_WORKER_NAME;
  const accountId = (env.CLOUDFLARE_ACCOUNT_ID || CLOUDFLARE_ACCOUNT_ID).trim() || CLOUDFLARE_ACCOUNT_ID;
  const cfDashboardUrl =
    accountId === CLOUDFLARE_ACCOUNT_ID && workerName === CLOUDFLARE_WORKER_NAME
      ? CLOUDFLARE_DASHBOARD_URL
      : `https://dash.cloudflare.com/${accountId}/workers/services/view/${workerName}/production/deployments`;

  return {
    supabaseUrl,
    supabaseKey,
    keyRole,
    projectRef,
    dashboardUrl,
    integrationsUrl,
    githubRepo,
    githubBranch,
    githubRepoUrl,
    githubToken: (env.GITHUB_TOKEN || '').trim(),
    workerName,
    accountId,
    cfDashboardUrl,
  };
}

function createSupabaseClientForRequest(
  supabaseUrl: string,
  supabaseKey: string,
  customFetch?: typeof fetch,
): SupabaseClient | null {
  if (!supabaseUrl || !supabaseKey) return null;
  try {
    return createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      ...(customFetch ? { global: { fetch: customFetch } } : {}),
    });
  } catch {
    return null;
  }
}

function buildIntegrationStatuses(
  cfg: ReturnType<typeof resolveEnvConfig>,
  overrides: WorkspaceIntegrationOverrides = {},
) {
  const hasConfigToml = overrides.hasConfigToml ?? true;
  const hasWorkflow = overrides.hasWorkflow ?? true;
  const migrations = overrides.migrations ?? ['20261118000001_omnimart_pos_schema.sql'];
  const hasWranglerConfig = overrides.hasWranglerConfig ?? true;
  const hasWorkerEntry = overrides.hasWorkerEntry ?? true;
  const hasCloudflareWorkflow = overrides.hasCloudflareWorkflow ?? true;

  return {
    githubIntegration: {
      repo: cfg.githubRepo,
      branch: cfg.githubBranch,
      repoUrl: cfg.githubRepoUrl,
      integrationsUrl: cfg.integrationsUrl,
      hasConfigToml,
      hasWorkflow,
      migrations,
      ready: hasConfigToml && migrations.length > 0,
    },
    cloudflareWorker: {
      serviceName: cfg.workerName,
      accountId: cfg.accountId,
      dashboardUrl: cfg.cfDashboardUrl,
      runtime: overrides.runtime ?? 'node',
      hasWranglerConfig,
      hasWorkerEntry,
      hasCloudflareWorkflow,
      ready: hasWranglerConfig && hasWorkerEntry,
    },
  };
}

export async function handleSyncApiRequest(
  request: Request,
  env: SyncRuntimeEnv,
  overrides: WorkspaceIntegrationOverrides = {},
  customFetch?: typeof fetch,
): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const cfg = resolveEnvConfig(env);
  const integration = buildIntegrationStatuses(cfg, overrides);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  // GET /api/sync/status
  if (pathname === '/api/sync/status' && request.method === 'GET') {
    const supabase = createSupabaseClientForRequest(cfg.supabaseUrl, cfg.supabaseKey, customFetch);
    if (!supabase) {
      return jsonResponse({
        configured: false,
        schemaReady: false,
        keyRole: 'none',
        projectRef: cfg.projectRef,
        projectUrl: cfg.supabaseUrl,
        dashboardUrl: cfg.dashboardUrl,
        ...integration,
      });
    }

    try {
      const checks = await Promise.all([
        supabase.from('pos_stores').select('store_id').limit(1),
        supabase.from('pos_products').select('id').limit(1),
        supabase.from('pos_sales').select('receipt_no').limit(1),
        supabase.from('pos_held_orders').select('id').limit(1),
        supabase.from('pos_stock_logs').select('id').limit(1),
      ]);
      const firstErr = checks.find((r) => r.error)?.error;
      if (firstErr) {
        return jsonResponse({
          configured: true,
          schemaReady: false,
          keyRole: cfg.keyRole,
          projectRef: cfg.projectRef,
          projectUrl: cfg.supabaseUrl,
          dashboardUrl: cfg.dashboardUrl,
          ...integration,
          error: formatSupabaseDbError(firstErr.message),
        });
      }
      if (cfg.keyRole === 'anon') {
        return jsonResponse({
          configured: true,
          schemaReady: false,
          keyRole: cfg.keyRole,
          projectRef: cfg.projectRef,
          projectUrl: cfg.supabaseUrl,
          dashboardUrl: cfg.dashboardUrl,
          ...integration,
          error:
            'Configured Supabase key is a public/anon key, which is blocked by Row Level Security on writes. Set SUPABASE_SERVICE_ROLE_KEY (service_role or sb_secret_...) on the server/Worker.',
        });
      }
      return jsonResponse({
        configured: true,
        schemaReady: true,
        keyRole: cfg.keyRole,
        projectRef: cfg.projectRef,
        projectUrl: cfg.supabaseUrl,
        dashboardUrl: cfg.dashboardUrl,
        ...integration,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to reach Supabase';
      return jsonResponse({
        configured: true,
        schemaReady: false,
        keyRole: cfg.keyRole,
        projectRef: cfg.projectRef,
        projectUrl: cfg.supabaseUrl,
        dashboardUrl: cfg.dashboardUrl,
        ...integration,
        error: msg,
      });
    }
  }

  // GET /api/sync/github-check
  if (pathname === '/api/sync/github-check' && request.method === 'GET') {
    const fetchImpl = customFetch ?? fetch;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'OmniMart-PH-POS',
    };
    if (cfg.githubToken) {
      headers.Authorization = `Bearer ${cfg.githubToken}`;
    }

    const baseApi = `https://api.github.com/repos/${cfg.githubRepo}`;
    const fetchJson = async (target: string): Promise<{ status: number; data: unknown }> => {
      const r = await fetchImpl(target, { headers });
      const data = await r.json().catch(() => null);
      return { status: r.status, data };
    };

    try {
      // Uses only 3 GitHub API calls instead of per-file requests to avoid unauthenticated rate limits
      const [repoRes, treeRes, commitRes] = await Promise.all([
        fetchJson(baseApi),
        fetchJson(`${baseApi}/git/trees/${encodeURIComponent(cfg.githubBranch)}?recursive=1`),
        fetchJson(`${baseApi}/commits/${encodeURIComponent(cfg.githubBranch)}`),
      ]);

      if (repoRes.status === 404) {
        return jsonResponse({
          reachable: false,
          repo: cfg.githubRepo,
          branch: cfg.githubBranch,
          repoUrl: cfg.githubRepoUrl,
          hasRemoteConfigToml: false,
          hasRemoteWorkflow: false,
          remoteMigrations: [],
          hasRemoteWranglerConfig: false,
          hasRemoteWorkerEntry: false,
          hasRemoteCloudflareWorkflow: false,
          error: 'Repository not found or private (set GITHUB_TOKEN on the server/Worker if private).',
        });
      }

      if (repoRes.status === 403) {
        const msg =
          (repoRes.data as { message?: string } | null)?.message ||
          'GitHub API rate limit reached.';
        return jsonResponse({
          reachable: false,
          repo: cfg.githubRepo,
          branch: cfg.githubBranch,
          repoUrl: cfg.githubRepoUrl,
          hasRemoteConfigToml: false,
          hasRemoteWorkflow: false,
          remoteMigrations: [],
          hasRemoteWranglerConfig: false,
          hasRemoteWorkerEntry: false,
          hasRemoteCloudflareWorkflow: false,
          error: msg,
        });
      }

      const treeItems = ((treeRes.data as { tree?: Array<{ path?: string; type?: string }> } | null)?.tree || []);
      const filePaths = new Set(
        treeItems
          .filter((item) => item.type === 'blob' && typeof item.path === 'string')
          .map((item) => String(item.path)),
      );

      const remoteMigrations = Array.from(filePaths)
        .filter((p) => p.startsWith('supabase/migrations/') && p.endsWith('.sql'))
        .map((p) => p.slice('supabase/migrations/'.length))
        .sort();

      const commitData = commitRes.data as {
        sha?: string;
        commit?: { message?: string; author?: { date?: string } };
      } | null;

      return jsonResponse({
        reachable: repoRes.status >= 200 && repoRes.status < 300,
        repo: cfg.githubRepo,
        branch: cfg.githubBranch,
        repoUrl: cfg.githubRepoUrl,
        defaultBranch: (repoRes.data as { default_branch?: string } | null)?.default_branch || cfg.githubBranch,
        hasRemoteConfigToml: filePaths.has('supabase/config.toml'),
        hasRemoteWorkflow: filePaths.has('.github/workflows/supabase-sync.yml'),
        remoteMigrations,
        hasRemoteWranglerConfig: filePaths.has('wrangler.jsonc') || filePaths.has('wrangler.toml'),
        hasRemoteWorkerEntry: filePaths.has('worker.ts') || filePaths.has('src/worker.ts'),
        hasRemoteCloudflareWorkflow: filePaths.has('.github/workflows/cloudflare-deploy.yml'),
        latestCommitSha: commitData?.sha ? commitData.sha.slice(0, 7) : undefined,
        latestCommitMessage: commitData?.commit?.message?.split('\n')[0],
        latestCommitAt: commitData?.commit?.author?.date,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to reach GitHub API';
      return jsonResponse({
        reachable: false,
        repo: cfg.githubRepo,
        branch: cfg.githubBranch,
        repoUrl: cfg.githubRepoUrl,
        hasRemoteConfigToml: false,
        hasRemoteWorkflow: false,
        remoteMigrations: [],
        hasRemoteWranglerConfig: false,
        hasRemoteWorkerEntry: false,
        hasRemoteCloudflareWorkflow: false,
        error: msg,
      });
    }
  }

  // GET /api/sync/pull
  if (pathname === '/api/sync/pull' && request.method === 'GET') {
    const supabase = createSupabaseClientForRequest(cfg.supabaseUrl, cfg.supabaseKey, customFetch);
    if (!supabase) {
      return jsonResponse(
        { error: 'Supabase key is not configured on the server (set SUPABASE_SERVICE_ROLE_KEY).' },
        503,
      );
    }

    const storeId = normalizeStoreId(url.searchParams.get('storeId'));

    try {
      const [storeRes, prodRes, salesRes, heldRes, logsRes] = await Promise.all([
        supabase.from('pos_stores').select('*').eq('store_id', storeId).maybeSingle(),
        supabase.from('pos_products').select('*').eq('store_id', storeId),
        supabase
          .from('pos_sales')
          .select('*')
          .eq('store_id', storeId)
          .order('date_iso', { ascending: true }),
        supabase.from('pos_held_orders').select('*').eq('store_id', storeId),
        supabase
          .from('pos_stock_logs')
          .select('*')
          .eq('store_id', storeId)
          .order('date_iso', { ascending: false })
          .limit(500),
      ]);

      const firstErr =
        storeRes.error || prodRes.error || salesRes.error || heldRes.error || logsRes.error;
      if (firstErr) {
        return jsonResponse({ error: firstErr.message }, 500);
      }

      const storeRow = storeRes.data;
      const prodRows = prodRes.data || [];
      const salesRows = salesRes.data || [];
      const heldRows = heldRes.data || [];
      const logRows = logsRes.data || [];

      const hasAnyData =
        Boolean(storeRow) ||
        prodRows.length > 0 ||
        salesRows.length > 0 ||
        heldRows.length > 0 ||
        logRows.length > 0;

      if (!hasAnyData) {
        return jsonResponse({ found: false, payload: null });
      }

      const deletedProducts: Record<string, string> = {};
      const products: ProductDto[] = [];
      for (const row of prodRows) {
        if (row.deleted) {
          deletedProducts[String(row.id)] = String(
            row.deleted_at || row.updated_at || new Date().toISOString(),
          );
          continue;
        }
        products.push({
          id: String(row.id),
          barcode: String(row.barcode || ''),
          name: String(row.name),
          category: String(row.category || 'Uncategorized'),
          unit: String(row.unit || 'pc'),
          capital: row.capital !== null && row.capital !== undefined ? Number(row.capital) : undefined,
          retailPrice: Number(row.retail_price ?? 0),
          wholesalePrice: Number(row.wholesale_price ?? 0),
          wholesaleMinQty: Number(row.wholesale_min_qty ?? 10),
          stock: Number(row.stock ?? 0),
          expiry: row.expiry ? String(row.expiry) : undefined,
          scEligible: typeof row.sc_eligible === 'boolean' ? row.sc_eligible : undefined,
          icon: row.icon ? String(row.icon) : undefined,
          iconColor: row.icon_color ? String(row.icon_color) : undefined,
          updatedAt: row.updated_at ? String(row.updated_at) : undefined,
        });
      }

      const sales: SaleRecordDto[] = salesRows.map((row) => ({
        receiptNo: String(row.receipt_no),
        dateIso: String(row.date_iso),
        dateFormatted: String(row.date_formatted || ''),
        items: Array.isArray(row.items) ? row.items : [],
        retailSubtotal: Number(row.retail_subtotal ?? 0),
        wholesaleSavings: Number(row.wholesale_savings ?? 0),
        seniorDiscount: Number(row.senior_discount ?? 0),
        grandTotal: Number(row.grand_total ?? 0),
        paymentMethod: String(row.payment_method || 'Cash'),
        tendered: Number(row.tendered ?? 0),
        change: Number(row.change ?? 0),
        refNo: row.ref_no ? String(row.ref_no) : undefined,
        splitDetails: row.split_details || undefined,
        seniorId: row.senior_id ? String(row.senior_id) : undefined,
        seniorBase:
          row.senior_base !== null && row.senior_base !== undefined
            ? Number(row.senior_base)
            : undefined,
        seniorCapped: typeof row.senior_capped === 'boolean' ? row.senior_capped : undefined,
        voided: Boolean(row.voided),
        voidedAt: row.voided_at ? String(row.voided_at) : undefined,
        voidReason: row.void_reason ? String(row.void_reason) : undefined,
      }));

      const heldOrders: HeldOrderDto[] = heldRows.map((row) => ({
        id: String(row.id),
        label: row.label ? String(row.label) : undefined,
        time: String(row.time || ''),
        items: Array.isArray(row.items) ? row.items : [],
        total: Number(row.total ?? 0),
        isSeniorPwd: Boolean(row.is_senior_pwd),
        priceMode: row.price_mode === 'wholesale' ? 'wholesale' : 'retail',
      }));

      const stockLog: StockLogDto[] = logRows.map((row) => ({
        id: String(row.id),
        dateIso: String(row.date_iso),
        productId: String(row.product_id),
        productName: String(row.product_name),
        delta: Number(row.delta ?? 0),
        prevStock: Number(row.prev_stock ?? 0),
        newStock: Number(row.new_stock ?? 0),
        reason: String(row.reason || 'Other'),
        note: row.note ? String(row.note) : undefined,
      }));

      return jsonResponse({
        found: true,
        payload: {
          storeId,
          products,
          deletedProducts,
          sales,
          heldOrders,
          stockLog,
          settings: storeRow?.settings ? sanitizeSettings(storeRow.settings) : undefined,
          configHistory: Array.isArray(storeRow?.config_history) ? storeRow.config_history : [],
          updatedAt: storeRow?.updated_at ? String(storeRow.updated_at) : undefined,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to pull from Supabase';
      return jsonResponse({ error: msg }, 500);
    }
  }

  // POST /api/sync/push
  if (pathname === '/api/sync/push' && request.method === 'POST') {
    const supabase = createSupabaseClientForRequest(cfg.supabaseUrl, cfg.supabaseKey, customFetch);
    if (!supabase) {
      return jsonResponse(
        { error: 'Supabase key is not configured on the server (set SUPABASE_SERVICE_ROLE_KEY).' },
        503,
      );
    }

    const parsedBody = await request.json().catch(() => null);
    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
      return jsonResponse({ error: 'Invalid JSON sync payload.' }, 400);
    }

    const body = parsedBody as {
      storeId?: string;
      products?: ProductDto[];
      deletedProducts?: Record<string, string>;
      sales?: SaleRecordDto[];
      heldOrders?: HeldOrderDto[];
      stockLog?: StockLogDto[];
      settings?: Record<string, unknown>;
      configHistory?: unknown[];
    };

    const storeId = normalizeStoreId(body.storeId);
    const nowIso = new Date().toISOString();
    const cleanSettings = sanitizeSettings(body.settings);
    const storeName = String(cleanSettings.storeName || 'OmniMart PH Supermarket');

    try {
      const { error: storeErr } = await supabase.from('pos_stores').upsert(
        {
          store_id: storeId,
          store_name: storeName,
          settings: cleanSettings,
          config_history: Array.isArray(body.configHistory) ? body.configHistory.slice(0, 30) : [],
          updated_at: nowIso,
        },
        { onConflict: 'store_id' },
      );
      if (storeErr) return jsonResponse({ error: formatSupabaseDbError(storeErr.message) }, 500);

      const activeProducts = Array.isArray(body.products) ? body.products : [];
      const activeIds = new Set(activeProducts.map((p) => p.id));
      const deletedMap = body.deletedProducts || {};

      const productRows: Array<{
        store_id: string;
        id: string;
        barcode: string;
        name: string;
        category: string;
        unit: string;
        capital: number | null;
        retail_price: number;
        wholesale_price: number;
        wholesale_min_qty: number;
        stock: number;
        expiry: string | null;
        sc_eligible: boolean | null;
        icon: string | null;
        icon_color: string | null;
        deleted: boolean;
        deleted_at: string | null;
        updated_at: string;
      }> = activeProducts.map((p) => ({
        store_id: storeId,
        id: p.id,
        barcode: p.barcode || '',
        name: p.name,
        category: p.category || 'Uncategorized',
        unit: p.unit || 'pc',
        capital: p.capital !== undefined && p.capital !== null ? Number(p.capital) : null,
        retail_price: Number(p.retailPrice) || 0,
        wholesale_price: Number(p.wholesalePrice) || 0,
        wholesale_min_qty: Number(p.wholesaleMinQty) || 10,
        stock: Number(p.stock) || 0,
        expiry: p.expiry || null,
        sc_eligible: typeof p.scEligible === 'boolean' ? p.scEligible : null,
        icon: p.icon || null,
        icon_color: p.iconColor || null,
        deleted: false,
        deleted_at: null,
        updated_at: p.updatedAt || nowIso,
      }));

      for (const [delId, delAt] of Object.entries(deletedMap)) {
        if (activeIds.has(delId)) continue;
        productRows.push({
          store_id: storeId,
          id: delId,
          barcode: '',
          name: 'Deleted SKU',
          category: 'Archived',
          unit: 'pc',
          capital: null,
          retail_price: 0,
          wholesale_price: 0,
          wholesale_min_qty: 10,
          stock: 0,
          expiry: null,
          sc_eligible: null,
          icon: null,
          icon_color: null,
          deleted: true,
          deleted_at: delAt || nowIso,
          updated_at: delAt || nowIso,
        });
      }

      const dedupedProductRows = dedupeByKey(productRows, (r) => r.id);
      for (const chunk of chunkArray(dedupedProductRows, 200)) {
        const { error } = await supabase
          .from('pos_products')
          .upsert(chunk, { onConflict: 'store_id,id' });
        if (error) return jsonResponse({ error: formatSupabaseDbError(error.message) }, 500);
      }

      const sales = Array.isArray(body.sales) ? body.sales : [];
      const saleRows = dedupeByKey(
        sales.map((s) => ({
          store_id: storeId,
          receipt_no: s.receiptNo,
          date_iso: s.dateIso,
          date_formatted: s.dateFormatted || '',
          items: Array.isArray(s.items) ? s.items : [],
          retail_subtotal: Number(s.retailSubtotal) || 0,
          wholesale_savings: Number(s.wholesaleSavings) || 0,
          senior_discount: Number(s.seniorDiscount) || 0,
          grand_total: Number(s.grandTotal) || 0,
          payment_method: s.paymentMethod || 'Cash',
          tendered: Number(s.tendered) || 0,
          change: Number(s.change) || 0,
          ref_no: s.refNo || null,
          split_details: s.splitDetails || null,
          senior_id: s.seniorId || null,
          senior_base:
            s.seniorBase !== undefined && s.seniorBase !== null ? Number(s.seniorBase) : null,
          senior_capped: typeof s.seniorCapped === 'boolean' ? s.seniorCapped : null,
          voided: Boolean(s.voided),
          voided_at: s.voidedAt || null,
          void_reason: s.voidReason || null,
          updated_at: s.voidedAt || s.dateIso || nowIso,
        })),
        (r) => r.receipt_no,
      );

      for (const chunk of chunkArray(saleRows, 200)) {
        const { error } = await supabase
          .from('pos_sales')
          .upsert(chunk, { onConflict: 'store_id,receipt_no' });
        if (error) return jsonResponse({ error: formatSupabaseDbError(error.message) }, 500);
      }

      const heldOrders = Array.isArray(body.heldOrders) ? body.heldOrders : [];
      if (heldOrders.length > 0) {
        const heldRows = dedupeByKey(
          heldOrders.map((h) => ({
            store_id: storeId,
            id: h.id,
            label: h.label || null,
            time: h.time || '',
            items: Array.isArray(h.items) ? h.items : [],
            total: Number(h.total) || 0,
            is_senior_pwd: Boolean(h.isSeniorPwd),
            price_mode: h.priceMode === 'wholesale' ? 'wholesale' : 'retail',
            updated_at: nowIso,
          })),
          (r) => r.id,
        );
        const { error } = await supabase
          .from('pos_held_orders')
          .upsert(heldRows, { onConflict: 'store_id,id' });
        if (error) return jsonResponse({ error: formatSupabaseDbError(error.message) }, 500);
      }
      const { data: existingHeld, error: existingHeldErr } = await supabase
        .from('pos_held_orders')
        .select('id')
        .eq('store_id', storeId);
      if (existingHeldErr) return jsonResponse({ error: formatSupabaseDbError(existingHeldErr.message) }, 500);

      const activeHeldIds = new Set(heldOrders.map((h) => h.id));
      const staleHeldIds = (existingHeld || [])
        .map((r) => String(r.id))
        .filter((id) => !activeHeldIds.has(id));
      if (staleHeldIds.length > 0) {
        const { error: delHeldErr } = await supabase
          .from('pos_held_orders')
          .delete()
          .eq('store_id', storeId)
          .in('id', staleHeldIds);
        if (delHeldErr) return jsonResponse({ error: formatSupabaseDbError(delHeldErr.message) }, 500);
      }

      const stockLog = Array.isArray(body.stockLog) ? body.stockLog.slice(0, 500) : [];
      const logRows = dedupeByKey(
        stockLog.map((l) => ({
          store_id: storeId,
          id: l.id,
          date_iso: l.dateIso,
          product_id: l.productId,
          product_name: l.productName,
          delta: Number(l.delta) || 0,
          prev_stock: Number(l.prevStock) || 0,
          new_stock: Number(l.newStock) || 0,
          reason: l.reason || 'Other',
          note: l.note || null,
        })),
        (r) => r.id,
      );
      for (const chunk of chunkArray(logRows, 200)) {
        const { error } = await supabase
          .from('pos_stock_logs')
          .upsert(chunk, { onConflict: 'store_id,id' });
        if (error) return jsonResponse({ error: formatSupabaseDbError(error.message) }, 500);
      }

      return jsonResponse({ ok: true, syncedAt: nowIso });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to push to Supabase';
      return jsonResponse({ error: msg }, 500);
    }
  }

  return jsonResponse({ error: `Method or path not allowed: ${request.method} ${pathname}` }, 404);
}
