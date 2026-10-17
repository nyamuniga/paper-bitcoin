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
  _cachedAt?: number;
}

const DEFAULT_CACHED_MINTS: Record<string, MintInfo> = {
  'https://mint.28waves.com': {
    name: '28MINT',
    pubkey: '0294f53f13f988e3a5bf80f384168bf02c117ee9e81019f7e1b66e1250b5e0ebfa',
    version: 'Nutshell/0.19.2',
    description: 'Empowering Africa with Bitcoin and eCash to transact without borders.',
    description_long: '28MINT is more than just a mint, it’s a step toward Africa’s financial independence. By combining the strength of Bitcoin, the privacy of eCash, and the universal right to freedom, we’re building tools for unstoppable communities. With every sat transacted, we unlock a future where Africans can trade, save, and grow without permission, without borders, and without limits.',
    motd: 'Africa needs Bitcoin more than anyone!',
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
  const [loading, setLoading] = useState<boolean>(() => {
    if (!cleanUrl) return false;
    const cached = mintInfoCache[cleanUrl];
    return !cached || !cached.nuts;
  });
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!cleanUrl) {
      setInfo(null);
      setLoading(false);
      return;
    }

    const cached = mintInfoCache[cleanUrl];
    const hasFullInfo = Boolean(cached && cached.nuts);

    if (cached) {
      setInfo(cached);
      // If we already have full info that is recent (under 15 minutes old), we don't need to refetch
      if (hasFullInfo && cached._cachedAt && Date.now() - cached._cachedAt < 15 * 60 * 1000) {
        setLoading(false);
        return;
      }
    }

    let isMounted = true;
    if (!hasFullInfo) {
      setLoading(true);
    }

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
        
        const fullData: MintInfo = { ...data, _cachedAt: Date.now() };
        mintInfoCache[cleanUrl] = fullData;
        try {
          localStorage.setItem('mint_info_cache', JSON.stringify(mintInfoCache));
        } catch {}
        
        if (isMounted) {
          setInfo(fullData);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err);
          // Only invalidate cache if we had no working cached info at all
          if (!mintInfoCache[cleanUrl]) {
            mintInfoCache[cleanUrl] = null;
          }
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
