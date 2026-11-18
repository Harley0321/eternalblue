import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_PROJECT_REF = 'xahsyugciihrrnchufwo';
const SUPABASE_URL = (process.env.SUPABASE_URL || `https://${DEFAULT_PROJECT_REF}.supabase.co`).trim();
const SUPABASE_KEY = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  ''
).trim();

function extractProjectRef(url: string): string {
  const m = String(url || '').match(/^https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
  return m ? m[1] : DEFAULT_PROJECT_REF;
}

const PROJECT_REF = extractProjectRef(SUPABASE_URL);
const DASHBOARD_URL = `https://supabase.com/dashboard/project/${PROJECT_REF}/settings/general`;
const INTEGRATIONS_URL = `https://supabase.com/dashboard/project/${PROJECT_REF}/settings/integrations`;
const GITHUB_REPO = (process.env.GITHUB_REPO || 'Harley0321/eternalblue').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '') || 'Harley0321/eternalblue';
const GITHUB_BRANCH = (process.env.GITHUB_BRANCH || 'main').trim() || 'main';
const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO}`;

function getWorkspaceIntegrationState() {
  const configTomlPath = path.join(__dirname, 'supabase', 'config.toml');
  const migrationsDir = path.join(__dirname, 'supabase', 'migrations');
  const workflowPath = path.join(__dirname, '.github', 'workflows', 'supabase-sync.yml');

  const hasConfigToml = fs.existsSync(configTomlPath);
  const hasWorkflow = fs.existsSync(workflowPath);
  let migrations: string[] = [];
  try {
    if (fs.existsSync(migrationsDir)) {
      migrations = fs
        .readdirSync(migrationsDir)
        .filter((name) => name.endsWith('.sql'))
        .sort();
    }
  } catch {
    migrations = [];
  }

  return {
    repo: GITHUB_REPO,
    branch: GITHUB_BRANCH,
    repoUrl: GITHUB_REPO_URL,
    integrationsUrl: INTEGRATIONS_URL,
    hasConfigToml,
    hasWorkflow,
    migrations,
    ready: hasConfigToml && migrations.length > 0,
  };
}

let cachedClient: SupabaseClient | null = null;
function getSupabase(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  if (!cachedClient) {
    cachedClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return cachedClient;
}

function normalizeStoreId(raw: unknown): string {
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
  'lastSyncedAt',
  'lastBackup',
]);

function sanitizeSettings(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!STRIPPED_CREDENTIAL_KEYS.has(k)) clean[k] = v;
  }
  return clean;
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/sync/status', async (_req, res) => {
    const supabase = getSupabase();
    const githubIntegration = getWorkspaceIntegrationState();
    if (!supabase) {
      return res.json({
        configured: false,
        schemaReady: false,
        projectRef: PROJECT_REF,
        projectUrl: SUPABASE_URL,
        dashboardUrl: DASHBOARD_URL,
        githubIntegration,
      });
    }

    try {
      const { error } = await supabase
        .from('pos_stores')
        .select('store_id', { count: 'exact', head: true });
      if (error) {
        return res.json({
          configured: true,
          schemaReady: false,
          projectRef: PROJECT_REF,
          projectUrl: SUPABASE_URL,
          dashboardUrl: DASHBOARD_URL,
          githubIntegration,
          error: error.message,
        });
      }
      return res.json({
        configured: true,
        schemaReady: true,
        projectRef: PROJECT_REF,
        projectUrl: SUPABASE_URL,
        dashboardUrl: DASHBOARD_URL,
        githubIntegration,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to reach Supabase';
      return res.json({
        configured: true,
        schemaReady: false,
        projectRef: PROJECT_REF,
        projectUrl: SUPABASE_URL,
        dashboardUrl: DASHBOARD_URL,
        githubIntegration,
        error: msg,
      });
    }
  });

  app.get('/api/sync/github-check', async (_req, res) => {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'OmniMart-PH-POS',
    };
    const token = (process.env.GITHUB_TOKEN || '').trim();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const baseApi = `https://api.github.com/repos/${GITHUB_REPO}`;
    const refQuery = `?ref=${encodeURIComponent(GITHUB_BRANCH)}`;

    const fetchJson = async (url: string): Promise<{ status: number; data: unknown }> => {
      const r = await fetch(url, { headers });
      const data = await r.json().catch(() => null);
      return { status: r.status, data };
    };

    try {
      const [repoRes, cfgRes, migRes, wfRes, commitRes] = await Promise.all([
        fetchJson(baseApi),
        fetchJson(`${baseApi}/contents/supabase/config.toml${refQuery}`),
        fetchJson(`${baseApi}/contents/supabase/migrations${refQuery}`),
        fetchJson(`${baseApi}/contents/.github/workflows/supabase-sync.yml${refQuery}`),
        fetchJson(`${baseApi}/commits/${encodeURIComponent(GITHUB_BRANCH)}`),
      ]);

      if (repoRes.status === 404) {
        return res.json({
          reachable: false,
          repo: GITHUB_REPO,
          branch: GITHUB_BRANCH,
          repoUrl: GITHUB_REPO_URL,
          hasRemoteConfigToml: false,
          hasRemoteWorkflow: false,
          remoteMigrations: [],
          error: 'Repository not found or private (set GITHUB_TOKEN on the server if private).',
        });
      }

      if (repoRes.status === 403) {
        const msg =
          (repoRes.data as { message?: string } | null)?.message ||
          'GitHub API rate limit reached.';
        return res.json({
          reachable: false,
          repo: GITHUB_REPO,
          branch: GITHUB_BRANCH,
          repoUrl: GITHUB_REPO_URL,
          hasRemoteConfigToml: false,
          hasRemoteWorkflow: false,
          remoteMigrations: [],
          error: msg,
        });
      }

      const remoteMigrations = Array.isArray(migRes.data)
        ? (migRes.data as Array<{ name?: string }>)
            .map((item) => String(item.name || ''))
            .filter((name) => name.endsWith('.sql'))
            .sort()
        : [];

      const commitData = commitRes.data as {
        sha?: string;
        commit?: { message?: string; author?: { date?: string } };
      } | null;

      return res.json({
        reachable: repoRes.status >= 200 && repoRes.status < 300,
        repo: GITHUB_REPO,
        branch: GITHUB_BRANCH,
        repoUrl: GITHUB_REPO_URL,
        defaultBranch: (repoRes.data as { default_branch?: string } | null)?.default_branch || GITHUB_BRANCH,
        hasRemoteConfigToml: cfgRes.status === 200,
        hasRemoteWorkflow: wfRes.status === 200,
        remoteMigrations,
        latestCommitSha: commitData?.sha ? commitData.sha.slice(0, 7) : undefined,
        latestCommitMessage: commitData?.commit?.message?.split('\n')[0],
        latestCommitAt: commitData?.commit?.author?.date,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to reach GitHub API';
      return res.json({
        reachable: false,
        repo: GITHUB_REPO,
        branch: GITHUB_BRANCH,
        repoUrl: GITHUB_REPO_URL,
        hasRemoteConfigToml: false,
        hasRemoteWorkflow: false,
        remoteMigrations: [],
        error: msg,
      });
    }
  });

  app.get('/api/sync/pull', async (req, res) => {
    const supabase = getSupabase();
    if (!supabase) {
      return res.status(503).json({
        error: 'Supabase key is not configured on the server (set SUPABASE_SERVICE_ROLE_KEY).',
      });
    }

    const storeId = normalizeStoreId(req.query.storeId);

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
        return res.status(500).json({ error: firstErr.message });
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
        return res.json({ found: false, payload: null });
      }

      const deletedProducts: Record<string, string> = {};
      const products: ProductDto[] = [];
      for (const row of prodRows) {
        if (row.deleted) {
          deletedProducts[String(row.id)] = String(row.deleted_at || row.updated_at || new Date().toISOString());
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

      return res.json({
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
      return res.status(500).json({ error: msg });
    }
  });

  app.post('/api/sync/push', async (req, res) => {
    const supabase = getSupabase();
    if (!supabase) {
      return res.status(503).json({
        error: 'Supabase key is not configured on the server (set SUPABASE_SERVICE_ROLE_KEY).',
      });
    }

    const body = (req.body || {}) as {
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
      if (storeErr) return res.status(500).json({ error: storeErr.message });

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

      for (const chunk of chunkArray(productRows, 200)) {
        const { error } = await supabase
          .from('pos_products')
          .upsert(chunk, { onConflict: 'store_id,id' });
        if (error) return res.status(500).json({ error: error.message });
      }

      const sales = Array.isArray(body.sales) ? body.sales : [];
      const saleRows = sales.map((s) => ({
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
      }));

      for (const chunk of chunkArray(saleRows, 200)) {
        const { error } = await supabase
          .from('pos_sales')
          .upsert(chunk, { onConflict: 'store_id,receipt_no' });
        if (error) return res.status(500).json({ error: error.message });
      }

      // Sync held orders: upsert current orders and remove recalled/deleted ones
      const heldOrders = Array.isArray(body.heldOrders) ? body.heldOrders : [];
      if (heldOrders.length > 0) {
        const heldRows = heldOrders.map((h) => ({
          store_id: storeId,
          id: h.id,
          label: h.label || null,
          time: h.time || '',
          items: Array.isArray(h.items) ? h.items : [],
          total: Number(h.total) || 0,
          is_senior_pwd: Boolean(h.isSeniorPwd),
          price_mode: h.priceMode === 'wholesale' ? 'wholesale' : 'retail',
          updated_at: nowIso,
        }));
        const { error } = await supabase
          .from('pos_held_orders')
          .upsert(heldRows, { onConflict: 'store_id,id' });
        if (error) return res.status(500).json({ error: error.message });
      }
      const { data: existingHeld, error: existingHeldErr } = await supabase
        .from('pos_held_orders')
        .select('id')
        .eq('store_id', storeId);
      if (existingHeldErr) return res.status(500).json({ error: existingHeldErr.message });
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
        if (delHeldErr) return res.status(500).json({ error: delHeldErr.message });
      }

      const stockLog = Array.isArray(body.stockLog) ? body.stockLog.slice(0, 500) : [];
      const logRows = stockLog.map((l) => ({
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
      }));
      for (const chunk of chunkArray(logRows, 200)) {
        const { error } = await supabase
          .from('pos_stock_logs')
          .upsert(chunk, { onConflict: 'store_id,id' });
        if (error) return res.status(500).json({ error: error.message });
      }

      return res.json({ ok: true, syncedAt: nowIso });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to push to Supabase';
      return res.status(500).json({ error: msg });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  let viteServer: { close: () => Promise<void> } | null = null;
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: { server: httpServer },
        ws: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
        ...(process.env.DISABLE_HMR === 'true' ? { hmr: false } : {}),
      },
      appType: 'spa',
    });
    viteServer = vite;
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    Promise.resolve(viteServer?.close())
      .catch(() => {})
      .finally(() => {
        httpServer.close(() => {
          process.exit(0);
        });
        setTimeout(() => process.exit(0), 1500).unref();
      });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error('Port 3000 is already in use; waiting or exiting cleanly.');
      process.exit(1);
    }
    console.error('HTTP server error:', err);
    process.exit(1);
  });

  httpServer.listen(3000, '0.0.0.0', () => {
    console.log(`OmniMart PH POS server listening on http://0.0.0.0:3000 (Supabase: ${PROJECT_REF})`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
