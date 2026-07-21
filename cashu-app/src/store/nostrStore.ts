import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface NostrState {
  npub: string | null;
  lightningAddress: string | null;
  customUsername: string | null;
  preferredMintUrl: string | null;
  lastClaimTimestamp: number;
  isRegistered: boolean;
  isInitializing: boolean;
  relays: string[];
  setNpub: (npub: string) => void;
  setLightningAddress: (addr: string) => void;
  setCustomUsername: (username: string | null) => void;
  setPreferredMint: (url: string) => void;
  setLastClaimTimestamp: (ts: number) => void;
  setRegistered: (val: boolean) => void;
  setIsInitializing: (val: boolean) => void;
  setRelays: (relays: string[]) => void;
  reset: () => void;
}

export const useNostrStore = create<NostrState>()(
  persist(
    (set) => ({
      npub: null,
      lightningAddress: null,
      customUsername: null,
      preferredMintUrl: null,
      lastClaimTimestamp: 0,
      isRegistered: false,
      isInitializing: true,
      relays: ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'],
      setNpub: (npub) => set({ npub }),
      setLightningAddress: (addr) => set({ lightningAddress: addr }),
      setCustomUsername: (username) => set({ customUsername: username }),
      setPreferredMint: (url) => set({ preferredMintUrl: url }),
      setLastClaimTimestamp: (ts) => set({ lastClaimTimestamp: ts }),
      setRegistered: (val) => set({ isRegistered: val }),
      setIsInitializing: (val) => set({ isInitializing: val }),
      setRelays: (relays) => set({ relays }),
      reset: () => set({
        npub: null,
        lightningAddress: null,
        customUsername: null,
        preferredMintUrl: null,
        lastClaimTimestamp: 0,
        isRegistered: false,
        isInitializing: false,
        relays: ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'],
      }),
    }),
    {
      name: 'cashu-nostr-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
