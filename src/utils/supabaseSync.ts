import type {
  ConfigSnapshot,
  HeldOrder,
  Product,
  SaleRecord,
  StockLogEntry,
  StoreSettings,
} from '../types';
import { PIN_SETTING_KEYS } from './pinSecurity';
import { DEFAULT_SETTINGS } from './posMath';

import {
  CLOUDFLARE_DEV_VARS_EXAMPLE,
  GITHUB_CLOUDFLARE_WORKFLOW_YML,
  GITHUB_SUPABASE_WORKFLOW_YML,
  SUPABASE_CONFIG_TOML,
  SUPABASE_MIGRATION_FILENAME,
  SUPABASE_SCHEMA_SQL,
  SUPABASE_SEED_SQL,
  WRANGLER_JSONC,
} from './supabaseSchemaSql';

export interface GithubIntegrationStatus {
  repo: string;
  branch: string;
  repoUrl: string;
  integrationsUrl: string;
  hasConfigToml: boolean;
  hasWorkflow: boolean;
  migrations: string[];
  ready: boolean;
}

export interface CloudflareWorkerStatus {
  serviceName: string;
  accountId: string;
  dashboardUrl: string;
  runtime: 'node' | 'cloudflare-worker';
  hasWranglerConfig: boolean;
  hasWorkerEntry: boolean;
  hasCloudflareWorkflow: boolean;
  ready: boolean;
}

export interface GithubRemoteCheckResponse {
  reachable: boolean;
  repo: string;
  branch: string;
  repoUrl: string;
  defaultBranch?: string;
  hasRemoteConfigToml: boolean;
  hasRemoteWorkflow: boolean;
  remoteMigrations: string[];
  hasRemoteWranglerConfig?: boolean;
  hasRemoteWorkerEntry?: boolean;
  hasRemoteCloudflareWorkflow?: boolean;
  latestCommitSha?: string;
  latestCommitMessage?: string;
  latestCommitAt?: string;
  error?: string;
}

export interface SyncStatusResponse {
  configured: boolean;
  schemaReady: boolean;
  keyRole?: 'service' | 'anon' | 'unknown' | 'none';
  projectRef: string;
  projectUrl: string;
  dashboardUrl: string;
  githubIntegration?: GithubIntegrationStatus;
  cloudflareWorker?: CloudflareWorkerStatus;
  error?: string;
}

export interface CloudStorePayload {
  storeId: string;
  products: Product[];
  deletedProducts?: Record<string, string>;
  sales: SaleRecord[];
  heldOrders: HeldOrder[];
  stockLog: StockLogEntry[];
  settings?: Partial<StoreSettings>;
  configHistory?: ConfigSnapshot[];
  updatedAt?: string;
}

export interface ReconcileInput {
  local: {
    products: Product[];
    deletedProducts: Record<string, string>;
    sales: SaleRecord[];
    heldOrders: HeldOrder[];
    stockLog: StockLogEntry[];
    settings: StoreSettings;
    configHistory: ConfigSnapshot[];
  };
  cloud: CloudStorePayload;
  mode: 'merge' | 'pull';
}

export interface ReconcileResult {
  products: Product[];
  deletedProducts: Record<string, string>;
  sales: SaleRecord[];
  heldOrders: HeldOrder[];
  stockLog: StockLogEntry[];
  settings: StoreSettings;
  configHistory: ConfigSnapshot[];
  stats: {
    productsCount: number;
    salesCount: number;
    heldCount: number;
    stockLogCount: number;
  };
}

const LOCAL_ONLY_SETTINGS_KEYS = new Set<string>([
  ...PIN_SETTING_KEYS,
  'syncStoreId',
  'syncStoreIdCustomized',
  'syncEnabled',
  'lastSyncedAt',
  'lastBackup',
]);

export function normalizeSyncStoreId(raw: string | undefined): string {
  const cleaned = (raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'main-store';
}

export function extractProjectRefFromUrl(url: string): string {
  const m = String(url || '').match(/^https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
  return m ? m[1] : '';
}

export function sanitizeSettingsForSync(settings: StoreSettings): Partial<StoreSettings> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(settings)) {
    if (LOCAL_ONLY_SETTINGS_KEYS.has(key)) continue;
    out[key] = val;
  }
  return out as Partial<StoreSettings>;
}

export function mergeSettingsFromCloud(
  localSettings: StoreSettings,
  cloudSettings?: Partial<StoreSettings>,
  mode: 'merge' | 'pull' = 'merge',
): StoreSettings {
  if (!cloudSettings || Object.keys(cloudSettings).length === 0) {
    return localSettings;
  }
  const cleanCloud = sanitizeSettingsForSync({ ...DEFAULT_SETTINGS, ...cloudSettings } as StoreSettings);
  const base =
    mode === 'pull'
      ? { ...DEFAULT_SETTINGS, ...cleanCloud }
      : { ...DEFAULT_SETTINGS, ...cleanCloud, ...sanitizeSettingsForSync(localSettings) };

  // Always preserve device-local credentials, passkeys, and local backup/sync timestamps
  const preservedLocal: Record<string, unknown> = {};
  for (const key of LOCAL_ONLY_SETTINGS_KEYS) {
    if (localSettings[key] !== undefined) {
      preservedLocal[key] = localSettings[key];
    }
  }
  return {
    ...base,
    ...preservedLocal,
    syncStoreId: localSettings.syncStoreId
      ? normalizeSyncStoreId(localSettings.syncStoreId)
      : normalizeSyncStoreId(cleanCloud.syncStoreId as string | undefined),
    syncEnabled: typeof localSettings.syncEnabled === 'boolean' ? localSettings.syncEnabled : false,
  } as StoreSettings;
}

function parseTs(iso?: string): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

export function reconcileProducts(
  localProducts: Product[],
  localDeleted: Record<string, string>,
  cloudProducts: Product[],
  cloudDeleted: Record<string, string> = {},
  mode: 'merge' | 'pull' = 'merge',
): { products: Product[]; deletedProducts: Record<string, string> } {
  if (mode === 'pull') {
    const nextDeleted: Record<string, string> = { ...cloudDeleted };
    const filtered = cloudProducts.filter((p) => {
      const delTs = parseTs(nextDeleted[p.id]);
      const prodTs = parseTs(p.updatedAt);
      return !(delTs > 0 && delTs >= prodTs);
    });
    return { products: filtered, deletedProducts: nextDeleted };
  }

  const deletedProducts: Record<string, string> = { ...localDeleted };
  for (const [id, ts] of Object.entries(cloudDeleted)) {
    if (!deletedProducts[id] || parseTs(ts) > parseTs(deletedProducts[id])) {
      deletedProducts[id] = ts;
    }
  }

  const byId = new Map<string, Product>();
  for (const p of localProducts) {
    byId.set(p.id, p);
  }
  for (const cp of cloudProducts) {
    const lp = byId.get(cp.id);
    if (!lp) {
      byId.set(cp.id, cp);
      continue;
    }
    const lTs = parseTs(lp.updatedAt);
    const cTs = parseTs(cp.updatedAt);
    // Prefer newer timestamp; if equal/missing, prefer local so active edits aren't lost
    byId.set(cp.id, cTs > lTs ? cp : lp);
  }

  const merged: Product[] = [];
  for (const prod of byId.values()) {
    const delTs = parseTs(deletedProducts[prod.id]);
    const prodTs = parseTs(prod.updatedAt);
    if (delTs > 0 && delTs >= prodTs) {
      continue;
    }
    if (delTs > 0 && prodTs > delTs) {
      delete deletedProducts[prod.id];
    }
    merged.push(prod);
  }

  return { products: merged, deletedProducts };
}

export function reconcileSales(
  localSales: SaleRecord[],
  cloudSales: SaleRecord[],
  mode: 'merge' | 'pull' = 'merge',
): SaleRecord[] {
  if (mode === 'pull') {
    return [...cloudSales].sort((a, b) => a.dateIso.localeCompare(b.dateIso));
  }
  const byReceipt = new Map<string, SaleRecord>();
  for (const s of localSales) {
    byReceipt.set(s.receiptNo, s);
  }
  for (const cs of cloudSales) {
    const ls = byReceipt.get(cs.receiptNo);
    if (!ls) {
      byReceipt.set(cs.receiptNo, cs);
      continue;
    }
    // Void state must propagate across terminals regardless of order
    if (cs.voided && !ls.voided) {
      byReceipt.set(cs.receiptNo, cs);
    } else if (ls.voided && !cs.voided) {
      byReceipt.set(cs.receiptNo, ls);
    }
  }
  return Array.from(byReceipt.values()).sort((a, b) => a.dateIso.localeCompare(b.dateIso));
}

export function reconcileHeldOrders(
  localHeld: HeldOrder[],
  cloudHeld: HeldOrder[],
  mode: 'merge' | 'pull' = 'merge',
): HeldOrder[] {
  if (mode === 'pull') return [...cloudHeld];
  const byId = new Map<string, HeldOrder>();
  for (const h of cloudHeld) byId.set(h.id, h);
  for (const h of localHeld) byId.set(h.id, h);
  return Array.from(byId.values());
}

export function reconcileStockLog(
  localLogs: StockLogEntry[],
  cloudLogs: StockLogEntry[],
  mode: 'merge' | 'pull' = 'merge',
): StockLogEntry[] {
  const source = mode === 'pull' ? cloudLogs : [...localLogs, ...cloudLogs];
  const seen = new Map<string, StockLogEntry>();
  for (const entry of source) {
    if (!seen.has(entry.id)) seen.set(entry.id, entry);
  }
  return Array.from(seen.values())
    .sort((a, b) => b.dateIso.localeCompare(a.dateIso))
    .slice(0, 500);
}

export function reconcileConfigHistory(
  localHistory: ConfigSnapshot[],
  cloudHistory: ConfigSnapshot[],
  mode: 'merge' | 'pull' = 'merge',
): ConfigSnapshot[] {
  const source = mode === 'pull' && cloudHistory.length > 0 ? cloudHistory : [...localHistory, ...cloudHistory];
  const seen = new Map<string, ConfigSnapshot>();
  for (const item of source) {
    if (!seen.has(item.id)) seen.set(item.id, item);
  }
  return Array.from(seen.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30);
}

export function reconcileStoreData(input: ReconcileInput): ReconcileResult {
  const { local, cloud, mode } = input;
  const prodRes = reconcileProducts(
    local.products,
    local.deletedProducts,
    cloud.products || [],
    cloud.deletedProducts || {},
    mode,
  );
  const sales = reconcileSales(local.sales, cloud.sales || [], mode);
  const heldOrders = reconcileHeldOrders(local.heldOrders, cloud.heldOrders || [], mode);
  const stockLog = reconcileStockLog(local.stockLog, cloud.stockLog || [], mode);
  const configHistory = reconcileConfigHistory(local.configHistory, cloud.configHistory || [], mode);
  const settings = mergeSettingsFromCloud(local.settings, cloud.settings, mode);

  return {
    products: prodRes.products,
    deletedProducts: prodRes.deletedProducts,
    sales,
    heldOrders,
    stockLog,
    settings,
    configHistory,
    stats: {
      productsCount: prodRes.products.length,
      salesCount: sales.length,
      heldCount: heldOrders.length,
      stockLogCount: stockLog.length,
    },
  };
}

export async function fetchSyncStatus(): Promise<SyncStatusResponse> {
  const res = await fetch('/api/sync/status', {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Sync status check failed (${res.status})`);
  }
  return (await res.json()) as SyncStatusResponse;
}

export async function pullStoreFromSupabase(storeId: string): Promise<{
  found: boolean;
  payload: CloudStorePayload | null;
}> {
  const normalized = normalizeSyncStoreId(storeId);
  const res = await fetch(`/api/sync/pull?storeId=${encodeURIComponent(normalized)}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  const data = (await res.json().catch(() => ({}))) as {
    found?: boolean;
    payload?: CloudStorePayload | null;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || `Supabase pull failed (${res.status})`);
  }
  return {
    found: Boolean(data.found),
    payload: data.payload ?? null,
  };
}

export async function pushStoreToSupabase(
  payload: CloudStorePayload,
): Promise<{ syncedAt: string }> {
  const res = await fetch('/api/sync/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      ...payload,
      storeId: normalizeSyncStoreId(payload.storeId),
      settings: payload.settings ? sanitizeSettingsForSync(payload.settings as StoreSettings) : undefined,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    syncedAt?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || `Supabase push failed (${res.status})`);
  }
  return { syncedAt: data.syncedAt || new Date().toISOString() };
}

export async function fetchGithubIntegrationCheck(): Promise<GithubRemoteCheckResponse> {
  const res = await fetch('/api/sync/github-check', {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`GitHub repository check failed (${res.status})`);
  }
  return (await res.json()) as GithubRemoteCheckResponse;
}

export function buildGithubIntegrationBundleFiles(): Array<{ path: string; content: string }> {
  return [
    {
      path: 'wrangler.jsonc',
      content: WRANGLER_JSONC,
    },
    {
      path: '.dev.vars.example',
      content: CLOUDFLARE_DEV_VARS_EXAMPLE,
    },
    {
      path: 'supabase/config.toml',
      content: SUPABASE_CONFIG_TOML,
    },
    {
      path: `supabase/migrations/${SUPABASE_MIGRATION_FILENAME}`,
      content: SUPABASE_SCHEMA_SQL,
    },
    {
      path: 'supabase/seed.sql',
      content: SUPABASE_SEED_SQL,
    },
    {
      path: 'supabase/schema.sql',
      content: SUPABASE_SCHEMA_SQL,
    },
    {
      path: '.github/workflows/supabase-sync.yml',
      content: GITHUB_SUPABASE_WORKFLOW_YML,
    },
    {
      path: '.github/workflows/cloudflare-deploy.yml',
      content: GITHUB_CLOUDFLARE_WORKFLOW_YML,
    },
  ];
}

