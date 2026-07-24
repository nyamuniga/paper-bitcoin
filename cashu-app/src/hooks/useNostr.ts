import { useEffect, useRef, useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { SimplePool, nip19 } from 'nostr-tools';
import { useNostrStore } from '../store/nostrStore';
import { useWalletStore } from '../store/wallet';
import {
  deriveNostrKeypair,
  npubToLightningAddress,
  registerWithNpubCash,
  fetchV1ClaimToken,
  claimUsername as claimUsernameApi,
  deriveKeypairFromPrivateKey,
  fetchNpubCashUser,
} from '../services/nostrService';
import { NPUB_DOMAIN } from '../constants.local';
import { toast } from 'react-hot-toast';

const CLAIM_INTERVAL_MS = 60_000; // Poll every 60 seconds

// ─── Module-level singletons ──────────────────────────────────────────────────
// These ensure the claim loop, Nostr subscription, and visibility listener
// are only created once, even though useNostr() is called from multiple components.

let globalIsClaiming = false;
let globalClaimLoopInitialized = false;
let globalNostrInitStarted = false;
let globalPrivateKey: string | null = null;
let globalClaimInterval: ReturnType<typeof setInterval> | null = null;
let globalPool: any = null;
let globalSub: any = null;
let globalVisibilityHandler: (() => void) | null = null;
let globalMountCount = 0;

// Track the last successfully claimed token to skip duplicates
let lastClaimedToken: string | null = null;

function setupClaimLoop(npub: string, relays: string[]) {
  if (globalClaimLoopInitialized) return;
  globalClaimLoopInitialized = true;

  const refreshWallet = useWalletStore.getState().refreshWallet;
  const setLastClaimTimestamp = useNostrStore.getState().setLastClaimTimestamp;

  const claimOnce = async () => {
    if (!globalPrivateKey || globalIsClaiming) return;
    globalIsClaiming = true;
    
    let wakeLock: any = null;
    try {
      // Prevent Android from sleeping and dropping the network connection
      if ('wakeLock' in navigator) {
        try {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        } catch (err) {
          console.warn('[useNostr] Wake Lock error:', err);
        }
      }

      const claimResult = await fetchV1ClaimToken(globalPrivateKey);
      if (claimResult && claimResult.token) {
        // Skip if we just processed this exact token
        if (claimResult.token === lastClaimedToken) {
          console.log('[useNostr] Skipping duplicate token (already claimed)');
          return;
        }

        console.log('[useNostr] Claim succeeded, receiving token...', claimResult.count);
        const toastId = toast.loading(`Claiming ${claimResult.count} token${claimResult.count > 1 ? 's' : ''}...`);
        try {
          await invoke('receive_ecash', { tokenString: claimResult.token });
          lastClaimedToken = claimResult.token;
          await refreshWallet();
          toast.success(`⚡ Received ${claimResult.count} token${claimResult.count > 1 ? 's' : ''} via Lightning Address!`, { id: toastId });
          setLastClaimTimestamp(Date.now());
        } catch (err) {
          toast.error("Failed to claim token. Check history to retry.", { id: toastId });
          throw err;
        }
      }
    } catch (e) {
      // ignore v1 failure
    } finally {
      if (wakeLock !== null) {
        wakeLock.release().catch(console.warn);
      }
      globalIsClaiming = false;
    }
  };

  // Claim immediately
  claimOnce();

  // Poll periodically as a fallback
  globalClaimInterval = setInterval(claimOnce, CLAIM_INTERVAL_MS);

  // Fetch immediately when app is foregrounded / unlocked
  globalVisibilityHandler = () => {
    if (document.visibilityState === 'visible') {
      console.log('[useNostr] App foregrounded, checking for payments...');
      claimOnce();
    }
  };
  document.addEventListener('visibilitychange', globalVisibilityHandler);

  // Set up Nostr WebSocket subscription for instant push
  try {
    const { data: pubkey } = nip19.decode(npub);
    globalPool = new SimplePool();
    globalSub = globalPool.subscribeMany(
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
}

function teardownClaimLoop(relays: string[]) {
  globalClaimLoopInitialized = false;

  if (globalClaimInterval) {
    clearInterval(globalClaimInterval);
    globalClaimInterval = null;
  }
  if (globalSub) {
    globalSub.close();
    globalSub = null;
  }
  if (globalPool) {
    globalPool.close(relays);
    globalPool = null;
  }
  if (globalVisibilityHandler) {
    document.removeEventListener('visibilitychange', globalVisibilityHandler);
    globalVisibilityHandler = null;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

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

  // Derive Nostr keys from the wallet seed on startup (singleton — only runs once)
  useEffect(() => {
    if (!isInitialized) return;
    if (globalNostrInitStarted) {
      // Another hook instance already started init — just sync our local state
      privateKeyRef.current = globalPrivateKey;
      if (globalPrivateKey) setIsNostrReady(true);
      return;
    }
    globalNostrInitStarted = true;

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
        globalPrivateKey = keypair.privateKey;
        setNpub(keypair.npub);

        const fallbackAddress = npubToLightningAddress(keypair.npub);

        // Query npub.cash for any registered custom username for this key
        try {
          const userInfo = await fetchNpubCashUser(keypair.privateKey);
          if (userInfo && userInfo.username) {
            setCustomUsername(userInfo.username);
            const customAddress = userInfo.username.includes('@')
              ? userInfo.username
              : `${userInfo.username}@${NPUB_DOMAIN}`;
            setLightningAddress(customAddress);
          } else {
            setCustomUsername(null);
            setLightningAddress(fallbackAddress);
          }
        } catch (e) {
          setCustomUsername(null);
          setLightningAddress(fallbackAddress);
        }

        // Auto-select preferred mint if not set
        const mintUrls = Object.keys(mintBalances || {});
        if (!preferredMintUrl && mintUrls.length > 0) {
          setPreferredMint(mintUrls[0]);
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
        toast.error('Nostr Init Error: ' + (err.message || err));
      } finally {
        setIsInitializing(false);
      }
    };

    initNostr();
  }, [isInitialized]);

  // Background claim loop and Nostr subscription (singleton)
  useEffect(() => {
    if (!isInitialized || !privateKeyRef.current || !npub || !isNostrReady) return;

    globalMountCount++;
    if (!globalClaimLoopInitialized) {
      setupClaimLoop(npub, relays);
    }

    return () => {
      globalMountCount--;
      // Only tear down when the last hook instance unmounts
      if (globalMountCount <= 0) {
        globalMountCount = 0;
        teardownClaimLoop(relays);
        globalNostrInitStarted = false;
        globalPrivateKey = null;
      }
    };
  }, [isInitialized, npub, relays, isNostrReady]);

  // Manual claim trigger (pull-to-refresh)
  const claimNow = useCallback(async () => {
    if (!privateKeyRef.current) return;
    setClaiming(true);
    try {
      const claimResult = await fetchV1ClaimToken(privateKeyRef.current!);
      if (claimResult && claimResult.token) {
        // Skip if this exact token was already claimed
        if (claimResult.token === lastClaimedToken) {
          console.log('[useNostr claimNow] Skipping duplicate token');
          await refreshWallet();
          return;
        }

        console.log('[useNostr claimNow] Claim succeeded, receiving token...', claimResult.count);
        await invoke('receive_ecash', { tokenString: claimResult.token });
        lastClaimedToken = claimResult.token;
        await refreshWallet();
        toast.success(`⚡ Claimed ${claimResult.count} payment${claimResult.count > 1 ? 's' : ''}!`);
        setLastClaimTimestamp(Date.now());
      } else {
        // No pending payments — the background loop likely already claimed them.
        // Just silently refresh the wallet balance.
        await refreshWallet();
      }
    } catch (e: any) {
      toast.error(`Claim failed: ${e.message || e}`);
    } finally {
      setClaiming(false);
    }
  }, [refreshWallet]);


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
