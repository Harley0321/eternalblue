import { handleSyncApiRequest, type SyncRuntimeEnv } from './src/utils/syncApiHandler';

export interface WorkerEnv extends SyncRuntimeEnv {
  ASSETS?: {
    fetch(input: Request | URL | string, init?: RequestInit): Promise<Response>;
  };
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/sync/')) {
      return handleSyncApiRequest(request, env, {
        runtime: 'cloudflare-worker',
        hasWranglerConfig: true,
        hasWorkerEntry: true,
        hasConfigToml: true,
        hasWorkflow: true,
        hasCloudflareWorkflow: true,
      });
    }

    if (url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: `Unknown API endpoint: ${url.pathname}` }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Static assets binding (ASSETS) is not configured.', { status: 500 });
  },
};
