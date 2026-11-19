import { DeviceBridge } from '../hardware/deviceBridge';

export type SyncStatus = 'UPDATE_AVAILABLE' | 'UP_TO_DATE' | 'NO_RELEASE_APK_YET' | 'ERROR';

export interface ReleaseInfo {
  repoSlug: string;
  status: SyncStatus;
  tagName: string;
  versionCode: number;
  releaseNotes?: string | null;
  htmlUrl: string;
  apkDownloadUrl?: string | null;
  apkFileName?: string | null;
  apkSizeBytes?: number | null;
  manifestUrl?: string | null;
  expectedSha256?: string | null;
  latestCommitSha?: string | null;
  latestCommitMessage?: string | null;
  message: string;
  isNewer: boolean;
}

function parseVersionParts(raw: string): number[] {
  const core = raw
    .trim()
    .replace(/^[vV]/, '')
    .split('-')[0]
    .split('+')[0];
  return core
    .split('.')
    .map((p) => parseInt(p.trim(), 10))
    .filter((n) => Number.isFinite(n));
}

export const GitHubUpdateChecker = {
  normalizeRepoSlug(raw: string): string {
    const trimmed = raw
      .trim()
      .replace(/^https?:\/\/github\.com\//, '')
      .replace(/\.git$/, '')
      .replace(/^\/+|\/+$/g, '');
    const parts = trimmed.split('/').filter((p) => p.trim().length > 0);
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : trimmed;
  },

  isVersionNewer(remoteRaw: string, currentRaw: string): boolean {
    const rParts = parseVersionParts(remoteRaw);
    const cParts = parseVersionParts(currentRaw);
    if (rParts.length === 0 || cParts.length === 0) {
      const cleanR = remoteRaw.trim().replace(/^[vV]/, '');
      const cleanC = currentRaw.trim().replace(/^[vV]/, '');
      return cleanR.length > 0 && cleanR !== cleanC;
    }
    const maxLen = Math.max(rParts.length, cParts.length);
    for (let i = 0; i < maxLen; i++) {
      const rv = rParts[i] ?? 0;
      const cv = cParts[i] ?? 0;
      if (rv !== cv) return rv > cv;
    }
    return false;
  },

  async checkLatest(repoSlug: string, currentVersion: string, currentVersionCode = 1): Promise<ReleaseInfo> {
    const clean = GitHubUpdateChecker.normalizeRepoSlug(repoSlug);
    if (!clean.includes('/')) {
      return {
        repoSlug: clean,
        status: 'ERROR',
        tagName: '',
        versionCode: 0,
        htmlUrl: 'https://github.com',
        message: 'Invalid GitHub repo format. Use owner/repo (e.g. Harley0321/eternalblue).',
        isNewer: false,
      };
    }

    const releasesPageUrl = `https://github.com/${clean}/releases/latest`;

    if (DeviceBridge.isAndroidHost()) {
      const nativeManifest = await DeviceBridge.fetchUpdateManifestNative(clean);
      if (nativeManifest && (nativeManifest.tagName || nativeManifest.versionName)) {
        const tag = String(nativeManifest.tagName || `v${nativeManifest.versionName ?? currentVersion}`);
        const remoteCode = Number(nativeManifest.versionCode) || 0;
        const newerByName = GitHubUpdateChecker.isVersionNewer(
          nativeManifest.versionName || tag,
          currentVersion
        );
        const newerByCode = remoteCode > 0 && remoteCode > currentVersionCode;
        const newer = newerByName || newerByCode;
        const apkUrl = nativeManifest.apkUrl?.trim() || null;
        const apkName = apkUrl ? apkUrl.split('/').pop() || `EternalBlue-POS-${tag}.apk` : null;
        return {
          repoSlug: clean,
          status: newer ? 'UPDATE_AVAILABLE' : 'UP_TO_DATE',
          tagName: tag,
          versionCode: remoteCode || currentVersionCode,
          htmlUrl: nativeManifest.releaseUrl?.trim() || releasesPageUrl,
          apkDownloadUrl: apkUrl,
          apkFileName: apkName,
          manifestUrl: `https://github.com/${clean}/releases/latest/download/update-manifest.json`,
          expectedSha256: nativeManifest.sha256?.trim() || null,
          message: newer
            ? `Update ${tag} is available.`
            : `App is up to date (installed v${currentVersion}, latest ${tag}).`,
          isNewer: newer,
        };
      }
    }

    try {
      const latestResp = await fetch(`https://api.github.com/repos/${clean}/releases/latest`, {
        cache: 'no-store',
        headers: {
          Accept: 'application/vnd.github+json',
        },
      });

      let releaseObj: Record<string, unknown> | null = null;
      if (latestResp.status === 200) {
        releaseObj = (await latestResp.json()) as Record<string, unknown>;
      } else if (latestResp.status === 404) {
        const listResp = await fetch(`https://api.github.com/repos/${clean}/releases?per_page=5`, {
          cache: 'no-store',
          headers: { Accept: 'application/vnd.github+json' },
        });
        if (listResp.status === 200) {
          const arr = (await listResp.json()) as Array<Record<string, unknown>>;
          releaseObj = arr.find((r) => r.draft !== true) ?? null;
        } else if (listResp.status === 404) {
          return {
            repoSlug: clean,
            status: 'ERROR',
            tagName: '',
            versionCode: 0,
            htmlUrl: `https://github.com/${clean}`,
            message: `Repository "${clean}" not found or is private (GitHub HTTP 404).`,
            isNewer: false,
          };
        }
      } else if (latestResp.status === 403) {
        return {
          repoSlug: clean,
          status: 'ERROR',
          tagName: '',
          versionCode: 0,
          htmlUrl: releasesPageUrl,
          message: 'GitHub API rate limit reached (HTTP 403). Try again in a few minutes.',
          isNewer: false,
        };
      } else if (!latestResp.ok) {
        return {
          repoSlug: clean,
          status: 'ERROR',
          tagName: '',
          versionCode: 0,
          htmlUrl: releasesPageUrl,
          message: `GitHub returned HTTP ${latestResp.status}.`,
          isNewer: false,
        };
      }

      if (releaseObj) {
        const tag = String(releaseObj.tag_name ?? `v${currentVersion}`);
        const htmlUrl = String(releaseObj.html_url ?? releasesPageUrl);
        const notes = typeof releaseObj.body === 'string' && releaseObj.body.trim() ? releaseObj.body : null;
        const assets = Array.isArray(releaseObj.assets) ? (releaseObj.assets as Array<Record<string, unknown>>) : [];
        const apkAsset = assets.find(
          (a) => typeof a.name === 'string' && a.name.toLowerCase().endsWith('.apk')
        );
        const manifestAsset = assets.find(
          (a) => typeof a.name === 'string' && a.name.toLowerCase() === 'update-manifest.json'
        );
        const newer = GitHubUpdateChecker.isVersionNewer(tag, currentVersion);
        const status: SyncStatus = newer ? 'UPDATE_AVAILABLE' : 'UP_TO_DATE';
        return {
          repoSlug: clean,
          status,
          tagName: tag,
          versionCode: currentVersionCode,
          releaseNotes: notes,
          htmlUrl,
          apkDownloadUrl: apkAsset ? String(apkAsset.browser_download_url ?? '') : null,
          apkFileName: apkAsset ? String(apkAsset.name ?? '') : null,
          apkSizeBytes: apkAsset && typeof apkAsset.size === 'number' ? apkAsset.size : null,
          manifestUrl: manifestAsset ? String(manifestAsset.browser_download_url ?? '') : null,
          message: newer
            ? `Update ${tag} is available.`
            : `App is up to date (installed v${currentVersion}, latest ${tag}).`,
          isNewer: newer,
        };
      }

      let latestTag: string | null = null;
      const tagsResp = await fetch(`https://api.github.com/repos/${clean}/tags?per_page=1`, { cache: 'no-store' });
      if (tagsResp.ok) {
        const tags = (await tagsResp.json()) as Array<{ name?: string }>;
        latestTag = tags[0]?.name ?? null;
      }

      let commitSha: string | null = null;
      let commitMsg: string | null = null;
      const commitsResp = await fetch(`https://api.github.com/repos/${clean}/commits?per_page=1`, { cache: 'no-store' });
      if (commitsResp.ok) {
        const commits = (await commitsResp.json()) as Array<{ sha?: string; commit?: { message?: string } }>;
        const first = commits[0];
        if (first?.sha) commitSha = first.sha.slice(0, 7);
        if (first?.commit?.message) commitMsg = first.commit.message.split('\n')[0].slice(0, 70);
      }

      const commitInfo = commitSha ? `Latest commit ${commitSha} (${commitMsg ?? ''}). ` : '';
      return {
        repoSlug: clean,
        status: 'NO_RELEASE_APK_YET',
        tagName: latestTag ?? '',
        versionCode: 0,
        htmlUrl: `https://github.com/${clean}/actions`,
        latestCommitSha: commitSha,
        latestCommitMessage: commitMsg,
        message: `${commitInfo}No published update release yet — run the GitHub release workflow.`,
        isNewer: false,
      };
    } catch (e) {
      return {
        repoSlug: clean,
        status: 'ERROR',
        tagName: '',
        versionCode: 0,
        htmlUrl: releasesPageUrl,
        message: `Cannot reach GitHub (${e instanceof Error ? e.message : 'offline'}).`,
        isNewer: false,
      };
    }
  },
};
