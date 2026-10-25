export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseName?: string;
  releaseNotes?: string;
  websiteUrl: string;
}

export const BITNOTES_WEBSITE_URL = 'https://bit-notes.com';
export const UPDATE_DISMISSED_SESSION_KEY = 'bitnotes_update_dismissed_session';

/**
 * Compare two semver strings (e.g. "0.1.8" vs "0.1.7", handles optional leading "v").
 * Returns true if latest > current.
 */
export function isNewerVersion(latest: string, current: string): boolean {
  if (!latest || !current) return false;
  const clean = (v: string) => v.replace(/^v/i, '').trim();
  const latestParts = clean(latest).split('.').map((n) => parseInt(n, 10) || 0);
  const currentParts = clean(current).split('.').map((n) => parseInt(n, 10) || 0);

  const length = Math.max(latestParts.length, currentParts.length);
  for (let i = 0; i < length; i++) {
    const l = latestParts[i] || 0;
    const c = currentParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

/**
 * Get current running version of the app from Tauri runtime with fallback.
 */
export async function getCurrentAppVersion(): Promise<string> {
  try {
    const { getVersion } = await import('@tauri-apps/api/app');
    const version = await getVersion();
    if (version) return version;
  } catch {}
  return '0.1.10';
}

/**
 * Fetch the latest release info from GitHub releases or repository package.json.
 */
export async function fetchLatestRelease(): Promise<{ version: string; name?: string; body?: string } | null> {
  // Method 1: Check GitHub Releases API
  try {
    const response = await fetch('https://api.github.com/repos/nyamuniga/paper-bitcoin/releases/latest', {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    if (response.ok) {
      const data = await response.json();
      if (data && data.tag_name) {
        const version = data.tag_name.replace(/^v/i, '').trim();
        return {
          version,
          name: data.name || `v${version}`,
          body: data.body || '',
        };
      }
    }
  } catch (e) {
    console.warn('GitHub releases API check failed, trying raw package.json', e);
  }

  // Method 2: Fallback to raw repository package.json
  try {
    const response = await fetch(
      'https://raw.githubusercontent.com/nyamuniga/paper-bitcoin/main/cashu-app/package.json'
    );
    if (response.ok) {
      const data = await response.json();
      if (data && data.version) {
        return {
          version: data.version.trim(),
          name: `v${data.version.trim()}`,
        };
      }
    }
  } catch (e) {
    console.warn('Raw package.json check failed', e);
  }

  return null;
}

/**
 * Check if a new version is available.
 * If ignoreSessionDismissal is false and user clicked "Update Later" during this session,
 * returns null so it only reschedules for the next app opening.
 */
export async function checkAppUpdate(ignoreSessionDismissal = false): Promise<UpdateInfo | null> {
  if (!ignoreSessionDismissal) {
    try {
      if (sessionStorage.getItem(UPDATE_DISMISSED_SESSION_KEY) === 'true') {
        return null;
      }
    } catch {}
  }

  const currentVersion = await getCurrentAppVersion();
  const latestRelease = await fetchLatestRelease();

  if (!latestRelease) {
    return null;
  }

  const hasUpdate = isNewerVersion(latestRelease.version, currentVersion);

  return {
    hasUpdate,
    currentVersion,
    latestVersion: latestRelease.version,
    releaseName: latestRelease.name,
    releaseNotes: latestRelease.body,
    websiteUrl: BITNOTES_WEBSITE_URL,
  };
}

/**
 * Dismisses the update prompt for the current session.
 * Since this is stored in sessionStorage, it resets when the app is restarted / reopened.
 */
export function dismissUpdateForSession(): void {
  try {
    sessionStorage.setItem(UPDATE_DISMISSED_SESSION_KEY, 'true');
  } catch {}
}

/**
 * Open bit-notes.com website in the user's default browser.
 */
export async function openUpdateWebsite(): Promise<void> {
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(BITNOTES_WEBSITE_URL);
  } catch {
    window.open(BITNOTES_WEBSITE_URL, '_blank');
  }
}
