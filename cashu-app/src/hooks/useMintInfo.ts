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

const mintInfoCache: Record<string, MintInfo | null> = {};

export function useMintInfo(mintUrl: string | null) {
  const [info, setInfo] = useState<MintInfo | null>(mintUrl ? mintInfoCache[mintUrl] || null : null);
  const [loading, setLoading] = useState<boolean>(!mintInfoCache[mintUrl ?? '']);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!mintUrl) {
      setInfo(null);
      setLoading(false);
      return;
    }

    if (mintInfoCache[mintUrl]) {
      setInfo(mintInfoCache[mintUrl]);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    const fetchInfo = async () => {
      try {
        const urlObj = new URL(mintUrl);
        // Ensure path correctly points to /v1/info
        let fetchUrl = urlObj.origin;
        if (urlObj.pathname !== '/') {
          fetchUrl += urlObj.pathname.replace(/\/$/, '');
        }
        fetchUrl += '/v1/info';

        const res = await fetch(fetchUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        
        mintInfoCache[mintUrl] = data;
        
        if (isMounted) {
          setInfo(data);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err);
          // Set to null to indicate failed fetch
          mintInfoCache[mintUrl] = null;
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
  }, [mintUrl]);

  return { info, loading, error };
}
