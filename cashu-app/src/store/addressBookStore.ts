import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Contact, ContactType } from '../types/addressBook';

interface AddressBookState {
  contacts: Contact[];
  addContact: (data: {
    name: string;
    type: ContactType;
    value: string;
    network?: string;
    currency?: string;
    notes?: string;
    isFavorite?: boolean;
  }) => Contact;
  updateContact: (id: string, updates: Partial<Omit<Contact, 'id' | 'createdAt'>>) => void;
  deleteContact: (id: string) => void;
  toggleFavorite: (id: string) => void;
  recordSuccessfulUse: (
    type: ContactType,
    value: string,
    meta?: { name?: string; network?: string; currency?: string }
  ) => Contact;
}

function normalizeValue(type: ContactType, val: string): string {
  const trimmed = val.trim();
  if (type === 'lightning') {
    return trimmed.toLowerCase().replace(/^lightning:/i, '');
  }
  if (type === 'momo') {
    // Keep numbers and leading +, remove spaces, hyphens, parentheses
    return trimmed.replace(/[^\d+]/g, '');
  }
  return trimmed;
}

export const useAddressBookStore = create<AddressBookState>()(
  persist(
    (set, get) => ({
      contacts: [],

      addContact: (data) => {
        const id = crypto.randomUUID();
        const now = Date.now();
        const cleanVal = normalizeValue(data.type, data.value);
        const newContact: Contact = {
          id,
          name: data.name.trim() || data.value.trim(),
          type: data.type,
          value: cleanVal,
          network: data.network,
          currency: data.currency,
          notes: data.notes?.trim(),
          createdAt: now,
          lastUsedAt: now,
          useCount: 1,
          isFavorite: !!data.isFavorite,
        };

        set((state) => ({
          contacts: [newContact, ...state.contacts],
        }));

        return newContact;
      },

      updateContact: (id, updates) => {
        set((state) => ({
          contacts: state.contacts.map((c) => {
            if (c.id !== id) return c;
            const updatedValue = updates.value ? normalizeValue(updates.type || c.type, updates.value) : c.value;
            return {
              ...c,
              ...updates,
              value: updatedValue,
            };
          }),
        }));
      },

      deleteContact: (id) => {
        set((state) => ({
          contacts: state.contacts.filter((c) => c.id !== id),
        }));
      },

      toggleFavorite: (id) => {
        set((state) => ({
          contacts: state.contacts.map((c) =>
            c.id === id ? { ...c, isFavorite: !c.isFavorite } : c
          ),
        }));
      },

      recordSuccessfulUse: (type, rawValue, meta) => {
        const cleanVal = normalizeValue(type, rawValue);
        if (!cleanVal) {
          throw new Error('Invalid destination value');
        }

        const now = Date.now();
        const existing = get().contacts.find((c) => {
          if (c.type !== type) return false;
          const existingClean = normalizeValue(c.type, c.value);
          if (existingClean === cleanVal) return true;
          // MoMo edge case: local (e.g. 077...) vs international (+25677...)
          if (type === 'momo') {
            const digitsA = existingClean.replace(/\D/g, '');
            const digitsB = cleanVal.replace(/\D/g, '');
            if (digitsA.length >= 9 && digitsB.length >= 9) {
              return digitsA.slice(-9) === digitsB.slice(-9);
            }
          }
          return false;
        });

        if (existing) {
          const updatedContact: Contact = {
            ...existing,
            lastUsedAt: now,
            useCount: (existing.useCount || 0) + 1,
            network: meta?.network || existing.network,
            currency: meta?.currency || existing.currency,
            name: (meta?.name && meta.name.trim()) ? meta.name.trim() : existing.name,
          };

          set((state) => ({
            contacts: state.contacts.map((c) => (c.id === existing.id ? updatedContact : c)),
          }));

          return updatedContact;
        }

        // Auto-save new contact
        const id = crypto.randomUUID();
        const newContact: Contact = {
          id,
          name: meta?.name?.trim() || rawValue.trim(),
          type,
          value: cleanVal,
          network: meta?.network,
          currency: meta?.currency,
          createdAt: now,
          lastUsedAt: now,
          useCount: 1,
          isFavorite: false,
        };

        set((state) => ({
          contacts: [newContact, ...state.contacts],
        }));

        return newContact;
      },
    }),
    {
      name: 'cashu-address-book-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
