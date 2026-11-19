import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader(
      'Permissions-Policy',
      'camera=(self), microphone=(), geolocation=(), payment=(), usb=()',
    );
    next();
  });
  const httpServer = http.createServer(app);

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
    app.use(
      express.static(distDir, {
        setHeaders: (res, filePath) => {
          const base = path.basename(filePath);
          if (
            base === 'index.html' ||
            base === 'sw.js' ||
            base === 'registerSW.js' ||
            base === 'manifest.webmanifest'
          ) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          }
        },
      }),
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
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
    console.log('OmniMart PH POS server listening on http://0.0.0.0:3000');
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
