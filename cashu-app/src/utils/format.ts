export function formatMintUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    const path = url.pathname === '/' ? '' : url.pathname;
    return url.hostname + path;
  } catch (e) {
    return urlStr;
  }
}
