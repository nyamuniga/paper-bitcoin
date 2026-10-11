import { useState, useEffect } from 'react';

export interface MintInfo {
  name?: string;
  pubkey?: string;
  version?: string;
  description?: string;
  description_long?: string;
  contact?: Array<{ method: string; info: string }>;
  motd?: string;
  icon_url?: string;
  time?: number;
  nuts?: any;
}

const DEFAULT_CACHED_MINTS: Record<string, MintInfo> = {
  'https://mint.28waves.com': {
    name: '28MINT',
    icon_url: 'https://res.cloudinary.com/dymfagnlu/image/upload/v1758210455/28_g3bhgv.png',
  },
};

const getInitialCache = (): Record<string, MintInfo | null> => {
  try {
    const saved = localStorage.getItem('mint_info_cache');
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...DEFAULT_CACHED_MINTS,
        ...parsed,
      };
    }
  } catch {}
  return { ...DEFAULT_CACHED_MINTS };
};

const mintInfoCache: Record<string, MintInfo | null> = getInitialCache();

export function useMintInfo(mintUrl: string | null) {
  const cleanUrl = mintUrl ? mintUrl.replace(/\/+$/, '') : null;
  const [info, setInfo] = useState<MintInfo | null>(cleanUrl ? mintInfoCache[cleanUrl] || null : null);
  const [loading, setLoading] = useState<boolean>(!cleanUrl || !mintInfoCache[cleanUrl]);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!cleanUrl) {
      setInfo(null);
      setLoading(false);
      return;
    }

    if (mintInfoCache[cleanUrl]) {
      setInfo(mintInfoCache[cleanUrl]);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    const fetchInfo = async () => {
      try {
        const urlObj = new URL(cleanUrl);
        // Ensure path correctly points to /v1/info
        let fetchUrl = urlObj.origin;
        if (urlObj.pathname !== '/') {
          fetchUrl += urlObj.pathname.replace(/\/$/, '');
        }
        fetchUrl += '/v1/info';

        const res = await fetch(fetchUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        
        mintInfoCache[cleanUrl] = data;
        try {
          localStorage.setItem('mint_info_cache', JSON.stringify(mintInfoCache));
        } catch {}
        
        if (isMounted) {
          setInfo(data);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err);
          // Set to null to indicate failed fetch
          mintInfoCache[cleanUrl] = null;
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchInfo();

    return () => {
      isMounted = false;
    };
  }, [cleanUrl]);

  return { info, loading, error };
}
