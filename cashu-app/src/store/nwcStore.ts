import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface PendingNwcRequest {
  event_id: string;
  invoice: string;
  amount_msats: number;
  created_at: number;
  raw_event: string;
}

interface NwcState {
  pendingRequests: PendingNwcRequest[];
  isFetching: boolean;
  fetchPendingRequests: () => Promise<void>;
  approveRequest: (eventId: string) => Promise<void>;
  rejectRequest: (eventId: string) => Promise<void>;
}

export const useNwcStore = create<NwcState>((set, get) => ({
  pendingRequests: [],
  isFetching: false,

  fetchPendingRequests: async () => {
    set({ isFetching: true });
    try {
      const requests = await invoke<PendingNwcRequest[]>('get_pending_nwc_requests');
      set({ pendingRequests: requests });
    } catch (err) {
      console.error('Failed to fetch pending NWC requests:', err);
    } finally {
      set({ isFetching: false });
    }
  },

  approveRequest: async (eventId: string) => {
    try {
      await invoke('approve_nwc_request', { eventId });
      await get().fetchPendingRequests();
    } catch (err) {
      console.error('Failed to approve NWC request:', err);
      throw err;
    }
  },

  rejectRequest: async (eventId: string) => {
    try {
      await invoke('reject_nwc_request', { eventId });
      await get().fetchPendingRequests();
    } catch (err) {
      console.error('Failed to reject NWC request:', err);
      throw err;
    }
  }
}));
