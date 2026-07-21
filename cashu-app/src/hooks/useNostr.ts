import { useEffect, useRef, useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { SimplePool, nip19 } from 'nostr-tools';
import { useNostrStore } from '../store/nostrStore';
import { useWalletStore } from '../store/wallet';
import {
  deriveNostrKeypair,
  npubToLightningAddress,
  registerWithNpubCash,
  fetchPendingQuotes,
  fetchNpubxJwt,
  fetchV1ClaimToken,
  claimUsername as claimUsernameApi,
  deriveKeypairFromPrivateKey,
} from '../services/nostrService';
import { NPUB_DOMAIN } from '../constants.local';
import { toast } from 'react-hot-toast';

const CLAIM_INTERVAL_MS = 60_000; // Poll every 60 seconds

export const useNostr = () => {
  const isInitialized = useWalletStore((s) => s.isInitialized);
  const mintBalances = useWalletStore((s) => s.mintBalances);
  const refreshWallet = useWalletStore((s) => s.refreshWallet);

  const npub = useNostrStore((s) => s.npub);
  const lightningAddress = useNostrStore((s) => s.lightningAddress);
  const customUsername = useNostrStore((s) => s.customUsername);
  const preferredMintUrl = useNostrStore((s) => s.preferredMintUrl);
  const isRegistered = useNostrStore((s) => s.isRegistered);
  const relays = useNostrStore((s) => s.relays);
  const setNpub = useNostrStore((s) => s.setNpub);
  const setLightningAddress = useNostrStore((s) => s.setLightningAddress);
  const setCustomUsername = useNostrStore((s) => s.setCustomUsername);
  const setPreferredMint = useNostrStore((s) => s.setPreferredMint);
  const setLastClaimTimestamp = useNostrStore((s) => s.setLastClaimTimestamp);
  const setRegistered = useNostrStore((s) => s.setRegistered);
  const setIsInitializing = useNostrStore((s) => s.setIsInitializing);

  const [claiming, setClaiming] = useState(false);
  const [claimingUsername, setClaimingUsername] = useState(false);
  const [isNostrReady, setIsNostrReady] = useState(false);

  // Keep a ref to the private key in memory (never persisted)
  const privateKeyRef = useRef<string | null>(null);
  const claimIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jwtRef = useRef<{ token: string; expiresAt: number } | null>(null);

  // Derive Nostr keys from the wallet seed on startup
  useEffect(() => {
    if (!isInitialized) return;

    const initNostr = async () => {
      try {
        let keypair;
        const customPrivateKey = await invoke<string | null>('get_custom_nostr_key');
        if (customPrivateKey) {
          keypair = deriveKeypairFromPrivateKey(customPrivateKey);
        } else {
          // Get the seed hex from the Rust backend
          const seedHex = await invoke<string>('get_seed_hex');
          keypair = deriveNostrKeypair(seedHex);
        }

        privateKeyRef.current = keypair.privateKey;
        setNpub(keypair.npub);

        // Set the Lightning Address (use custom username if available)
        const address = customUsername
          ? (customUsername.includes('@') ? customUsername : `${customUsername}@${NPUB_DOMAIN}`)
          : npubToLightningAddress(keypair.npub);
        setLightningAddress(address);

        // Auto-select preferred mint if not set
        const mintUrls = Object.keys(mintBalances || {});
        if (!preferredMintUrl && mintUrls.length > 0) {
          setPreferredMint(mintUrls[0]);
        }

        if (customUsername) {
          setLightningAddress(
            customUsername.includes('@')
              ? customUsername
              : `${customUsername}@${NPUB_DOMAIN}`
          );
        }

        // Initialize JWT and start polling
        try {
          if (!jwtRef.current) {
            const token = await fetchNpubxJwt(privateKeyRef.current);
            jwtRef.current = { token, expiresAt: Date.now() + 1000 * 60 * 60 * 24 };
          }
        } catch (e: any) {
          // If auth fails, we just won't poll for quotes
        }

        // Register with npubx.cash if not already done
        const mintToRegister = preferredMintUrl || mintUrls[0];
        if (mintToRegister && !isRegistered) {
          try {
            await registerWithNpubCash(mintToRegister, keypair.privateKey);
            setRegistered(true);
          } catch (e) {
            console.warn('npubx.cash registration failed (will retry):', e);
          }
        }
        setIsNostrReady(true);
      } catch (err: any) {
        console.error('Failed to initialize Nostr:', err);
        toast.error('Nostr Init Error: ' + err.message);
      } finally {
        setIsInitializing(false);
      }
    };

    initNostr();
  }, [isInitialized]);

  // Background claim loop and Nostr subscription
  useEffect(() => {
    if (!isInitialized || !privateKeyRef.current || !npub || !isNostrReady) return;

    let isClaiming = false;
    const claimOnce = async () => {
      if (!privateKeyRef.current || claiming || isClaiming) return;
      isClaiming = true;
      try {
        // Ensure valid JWT
        console.log(`[DEBUG claimOnce] Checking JWT. Current JWT valid:`, !!jwtRef.current && Date.now() <= jwtRef.current.expiresAt);
        if (!jwtRef.current || Date.now() > jwtRef.current.expiresAt) {
          console.log('[DEBUG claimOnce] Fetching new JWT...');
          const token = await fetchNpubxJwt(privateKeyRef.current);
          console.log('[DEBUG claimOnce] Successfully fetched new JWT');
          jwtRef.current = { token, expiresAt: Date.now() + 4 * 60 * 1000 };
        }

        console.log('[DEBUG claimOnce] Fetching pending quotes...');
        const quotes = await fetchPendingQuotes(jwtRef.current.token);
        console.log('[DEBUG claimOnce] Successfully fetched quotes:', quotes);
        const claimedSet = new Set(JSON.parse(localStorage.getItem('npubx_claimed_quotes') || '[]'));
        
        const paidQuotes = quotes.filter(q => q.state === 'PAID' && !claimedSet.has(q.quoteId));

        if (paidQuotes.length > 0) {
          try {
            // Map to ExternalQuote struct expected by Rust
            const rustQuotes = paidQuotes.map(q => ({
              quoteId: q.quoteId,
              amount: q.amount,
              mintUrl: q.mintUrl || (q as any).mint_url
            }));

            const claimedCount: number = await invoke('batch_mint_external_quotes', {
              quotes: rustQuotes
            });

            if (claimedCount > 0) {
              // Add successful ones to local claimed set
              for (const q of paidQuotes) {
                claimedSet.add(q.quoteId);
              }
              localStorage.setItem('npubx_claimed_quotes', JSON.stringify(Array.from(claimedSet)));

              await refreshWallet();
              toast.success(`⚡ Received ${claimedCount} payment${claimedCount > 1 ? 's' : ''} via Lightning Address!`);
            }
          } catch (e) {
            console.warn('Batch claim failed:', e);
          }
          
          setLastClaimTimestamp(Date.now());
        }
      } catch (e: any) {
        console.error('[DEBUG claimOnce] Caught outer error during claim check (v2 failed). Trying v1 fallback...', e.message);
        
        try {
          const claimResult = await fetchV1ClaimToken(privateKeyRef.current);
          if (claimResult && claimResult.token) {
            console.log('[DEBUG claimOnce] v1 claim succeeded! Receiving token...', claimResult.count);
            await invoke('receive_ecash', { tokenString: claimResult.token });
            await refreshWallet();
            toast.success(`⚡ Received ${claimResult.count} payment${claimResult.count > 1 ? 's' : ''} via Lightning Address!`);
            setLastClaimTimestamp(Date.now());
          }
        } catch (v1Error) {
           console.error('[DEBUG claimOnce] v1 fallback also failed:', v1Error);
        }
      } finally {
        isClaiming = false;
      }
    };

    // Claim immediately on mount
    claimOnce();

    // Poll periodically as a fallback
    claimIntervalRef.current = setInterval(claimOnce, CLAIM_INTERVAL_MS);

    // Fetch immediately when app is foregrounded / unlocked
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[DEBUG useNostr] App foregrounded, checking for payments...');
        claimOnce();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Set up Nostr WebSocket subscription for instant push
    let sub: any = null;
    let pool: any = null;
    
    try {
      const { data: pubkey } = nip19.decode(npub);
      pool = new SimplePool();
      sub = pool.subscribeMany(
        relays,
        [
          {
            kinds: [4, 1059],
            '#p': [pubkey as string],
            since: Math.floor(Date.now() / 1000)
          }
        ],
        {
          onevent(event: any) {
            console.log('Received Nostr event, checking for pending payments...', event);
            // Wait a brief moment to allow the npubx.cash server to finish saving the tokens
            setTimeout(() => claimOnce(), 2000);
          }
        }
      );
    } catch (e) {
      console.warn('Failed to subscribe to Nostr relays:', e);
    }

    return () => {
      if (claimIntervalRef.current) {
        clearInterval(claimIntervalRef.current);
      }
      if (sub) sub.close();
      if (pool) pool.close(relays);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isInitialized, npub, relays, isNostrReady]);

  // Manual claim trigger
  const claimNow = useCallback(async () => {
    if (!privateKeyRef.current) return;
    setClaiming(true);
    try {
      if (!jwtRef.current || Date.now() > jwtRef.current.expiresAt) {
        const token = await fetchNpubxJwt(privateKeyRef.current);
        jwtRef.current = { token, expiresAt: Date.now() + 4 * 60 * 1000 };
      }

      const quotes = await fetchPendingQuotes(jwtRef.current.token);
      const claimedSet = new Set(JSON.parse(localStorage.getItem('npubx_claimed_quotes') || '[]'));
      
      const paidQuotes = quotes.filter(q => q.state === 'PAID' && !claimedSet.has(q.quoteId));

      if (paidQuotes.length === 0) {
        toast('No pending payments found', { icon: '📭' });
        return;
      }

      try {
        const rustQuotes = paidQuotes.map(q => ({
          quoteId: q.quoteId,
          amount: q.amount,
          mintUrl: q.mintUrl || (q as any).mint_url
        }));

        const claimedCount: number = await invoke('batch_mint_external_quotes', {
          quotes: rustQuotes
        });

        if (claimedCount > 0) {
          for (const q of paidQuotes) {
            claimedSet.add(q.quoteId);
          }
          localStorage.setItem('npubx_claimed_quotes', JSON.stringify(Array.from(claimedSet)));

          await refreshWallet();
          toast.success(`⚡ Claimed ${claimedCount} payment${claimedCount > 1 ? 's' : ''}!`);
        } else {
          toast('No payments could be claimed', { icon: '⚠️' });
        }
      } catch (e: any) {
        toast.error(`Batch claim failed: ${e.message}`);
      }

      setLastClaimTimestamp(Date.now());
    } catch (e: any) {
      console.error('[DEBUG claimNow] Caught error during manual claim:', e);
      console.error('[DEBUG claimNow] Error name:', e.name, 'Message:', e.message);
      
      try {
        const claimResult = await fetchV1ClaimToken(privateKeyRef.current!);
        if (claimResult && claimResult.token) {
          console.log('[DEBUG claimNow] v1 claim succeeded! Receiving token...', claimResult.count);
          await invoke('receive_ecash', { tokenString: claimResult.token });
          await refreshWallet();
          toast.success(`⚡ Claimed ${claimResult.count} payment${claimResult.count > 1 ? 's' : ''}!`);
          setLastClaimTimestamp(Date.now());
        } else {
          toast.error(`Claim failed: ${e.message}`);
        }
      } catch (v1Error) {
         console.error('[DEBUG claimNow] v1 fallback also failed:', v1Error);
         toast.error(`Claim failed: ${e.message}`);
      }
    } finally {
      setClaiming(false);
    }
  }, []);

  // Update preferred mint on npubx.cash
  const updatePreferredMint = useCallback(async (mintUrl: string) => {
    setPreferredMint(mintUrl);
    if (privateKeyRef.current) {
      try {
        await registerWithNpubCash(mintUrl, privateKeyRef.current);
        toast.success('Preferred mint updated');
      } catch (e: any) {
        toast.error(`Failed to update mint: ${e.message}`);
      }
    }
  }, []);

  // Claim a human-readable username
  const claimUsername = useCallback(async (username: string) => {
    if (!privateKeyRef.current) return false;
    setClaimingUsername(true);
    try {
      const result = await claimUsernameApi(username, privateKeyRef.current);
      if (result.success) {
        setCustomUsername(username);
        setLightningAddress(result.address || `${username}@${NPUB_DOMAIN}`);
        toast.success(`Username claimed! Your address: ${username}@${NPUB_DOMAIN}`);
        return true;
      } else {
        toast.error(result.error || 'Failed to claim username');
        return false;
      }
    } catch (e: any) {
      toast.error(`Username claim failed: ${e.message}`);
      return false;
    } finally {
      setClaimingUsername(false);
    }
  }, []);

  return {
    npub,
    lightningAddress,
    customUsername,
    preferredMintUrl,
    isRegistered,
    claiming,
    claimingUsername,
    claimNow,
    updatePreferredMint,
    claimUsername,
  };
};
