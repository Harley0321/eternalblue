import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleSyncApiRequest, type WorkspaceIntegrationOverrides } from './src/utils/syncApiHandler.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_PROJECT_REF = 'xahsyugciihrrnchufwo';
const SUPABASE_URL = (process.env.SUPABASE_URL || `https://${DEFAULT_PROJECT_REF}.supabase.co`).trim();
const PROJECT_REF = (() => {
  const m = SUPABASE_URL.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
  return m ? m[1] : DEFAULT_PROJECT_REF;
})();

function getWorkspaceIntegrationState(): WorkspaceIntegrationOverrides {
  const configTomlPath = path.join(__dirname, 'supabase', 'config.toml');
  const migrationsDir = path.join(__dirname, 'supabase', 'migrations');
  const workflowPath = path.join(__dirname, '.github', 'workflows', 'supabase-sync.yml');
  const cfWorkflowPath = path.join(__dirname, '.github', 'workflows', 'cloudflare-deploy.yml');
  const wranglerPath = path.join(__dirname, 'wrangler.jsonc');
  const workerPath = path.join(__dirname, 'worker.ts');

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
    runtime: 'node',
    hasConfigToml: fs.existsSync(configTomlPath),
    hasWorkflow: fs.existsSync(workflowPath),
    hasCloudflareWorkflow: fs.existsSync(cfWorkflowPath),
    hasWranglerConfig: fs.existsSync(wranglerPath),
    hasWorkerEntry: fs.existsSync(workerPath),
    migrations,
  };
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: '10mb' }));

  app.all('/api/sync/*', async (req, res) => {
    try {
      const origin = `http://${req.headers.host || 'localhost:3000'}`;
      const fullUrl = new URL(req.originalUrl, origin).toString();
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === 'string') headers.set(k, v);
        else if (Array.isArray(v)) headers.set(k, v.join(', '));
      }

      const webReq = new Request(fullUrl, {
        method: req.method,
        headers,
        body:
          req.method !== 'GET' && req.method !== 'HEAD'
            ? JSON.stringify(req.body ?? {})
            : undefined,
      });

      const webRes = await handleSyncApiRequest(
        webReq,
        {
          SUPABASE_URL: process.env.SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
          SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
          SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
          SUPABASE_KEY: process.env.SUPABASE_KEY,
          SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
          SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
          GITHUB_REPO: process.env.GITHUB_REPO,
          GITHUB_BRANCH: process.env.GITHUB_BRANCH,
          GITHUB_TOKEN: process.env.GITHUB_TOKEN,
          CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
          CLOUDFLARE_WORKER_NAME: process.env.CLOUDFLARE_WORKER_NAME,
        },
        getWorkspaceIntegrationState(),
      );

      res.status(webRes.status);
      webRes.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });
      const text = await webRes.text();
      res.send(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync API error';
      res.status(500).json({ error: msg });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  const disableHmr = process.env.DISABLE_HMR === 'true';
  let viteServer: { close: () => Promise<void> } | null = null;
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: disableHmr ? false : { server: httpServer },
        ws: disableHmr ? false : { server: httpServer },
      },
      plugins: disableHmr
        ? [
            {
              name: 'disable-hmr-client-ws',
              enforce: 'post',
              transform(code: string, id: string) {
                if (!id.replace(/\\/g, '/').endsWith('vite/dist/client/client.mjs')) {
                  return null;
                }
                return {
                  code: code.replace(
                    'const createWebSocketModuleRunnerTransport = (options) => {',
                    'const createWebSocketModuleRunnerTransport = () => ({ async connect() {}, async disconnect() {}, async send() {} }); const _unusedCreateWebSocketModuleRunnerTransport = (options) => {',
                  ),
                  map: null,
                };
              },
            },
          ]
        : [],
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
