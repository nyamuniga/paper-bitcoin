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
        const claimResult = await fetchV1ClaimToken(privateKeyRef.current);
        if (claimResult && claimResult.token) {
          console.log('[DEBUG claimOnce] v1 claim succeeded! Receiving token...', claimResult.count);
          await invoke('receive_ecash', { tokenString: claimResult.token });
          await refreshWallet();
          toast.success(`⚡ Received ${claimResult.count} payment${claimResult.count > 1 ? 's' : ''} via Lightning Address!`);
          setLastClaimTimestamp(Date.now());
        }
      } catch (e) {
        // ignore v1 failure
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
      const claimResult = await fetchV1ClaimToken(privateKeyRef.current!);
      if (claimResult && claimResult.token) {
        console.log('[DEBUG claimNow] v1 claim succeeded! Receiving token...', claimResult.count);
        await invoke('receive_ecash', { tokenString: claimResult.token });
        await refreshWallet();
        toast.success(`⚡ Claimed ${claimResult.count} payment${claimResult.count > 1 ? 's' : ''}!`);
        setLastClaimTimestamp(Date.now());
      } else {
        toast('No pending payments found', { icon: '📭' });
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
