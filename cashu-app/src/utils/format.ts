export function formatMintUrl(urlStr: string | undefined | null): string {
  if (!urlStr) return '';
  try {
    const url = new URL(urlStr);
    const path = url.pathname === '/' ? '' : url.pathname;
    return url.hostname + path;
  } catch (e) {
    return urlStr;
  }
}

export const extractMintFromToken = (tokenStr: string): string | null => {
  try {
    if (tokenStr.startsWith('cashuA')) {
      let base64 = tokenStr.slice(6).replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) {
        base64 += '=';
      }
      const jsonStr = atob(base64);
      const parsed = JSON.parse(jsonStr);
      if (parsed && parsed.token && Array.isArray(parsed.token) && parsed.token.length > 0) {
        const url = parsed.token[0].mint;
        return url.endsWith('/') ? url.slice(0, -1) : url;
      }
    } else if (tokenStr.startsWith('cashuB')) {
      let base64 = tokenStr.slice(6).replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) {
        base64 += '=';
      }
      const raw = atob(base64);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) {
        bytes[i] = raw.charCodeAt(i);
      }

      for (let i = 0; i < bytes.length - 4; i++) {
        if (bytes[i] === 104 && bytes[i + 1] === 116 && bytes[i + 2] === 116 && bytes[i + 3] === 112) { // 'http'
          let length = 0;
          if (i >= 1 && bytes[i - 1] >= 0x60 && bytes[i - 1] <= 0x77) {
            length = bytes[i - 1] - 0x60;
          } else if (i >= 2 && bytes[i - 2] === 0x78) {
            length = bytes[i - 1];
          } else if (i >= 3 && bytes[i - 3] === 0x79) {
            length = (bytes[i - 2] << 8) | bytes[i - 1];
          }

          if (length > 0 && i + length <= bytes.length) {
            const urlBytes = bytes.slice(i, i + length);
            const url = String.fromCharCode(...Array.from(urlBytes));
            return url.endsWith('/') ? url.slice(0, -1) : url;
          }
        }
      }
    }
  } catch (e) {
    // Ignore parse errors for incomplete tokens
  }
  return null;
};
