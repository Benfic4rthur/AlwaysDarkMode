const repository = 'https://github.com/Benfic4rthur/AlwaysDarkMode';
export const releaseApi = 'https://api.github.com/repos/Benfic4rthur/AlwaysDarkMode/releases/latest';

export function parseRelease(data) {
  if (!data || data.draft !== false || data.prerelease !== false || !Array.isArray(data.assets)) return null;
  const version = typeof data.tag_name === 'string' && /^v?(\d+\.\d+\.\d+)$/.exec(data.tag_name)?.[1];
  if (!version) return null;
  const url = `${repository}/releases/download/${data.tag_name}/Always-Dark.zip`;
  const asset = data.assets.find(item => item?.name === 'Always-Dark.zip' && item.state === 'uploaded'
    && item.browser_download_url === url && Number.isSafeInteger(item.size) && item.size > 0);
  return asset ? { version, bytes: asset.size } : null;
}

export async function fetchLatestRelease(fetcher = fetch) {
  try {
    const response = await fetcher(releaseApi, { credentials: 'omit', cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(5000) });
    return response.ok ? parseRelease(await response.json()) : null;
  } catch { return null; }
}
