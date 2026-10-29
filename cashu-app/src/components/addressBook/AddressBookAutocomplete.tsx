import React, { useMemo } from 'react';
import { Phone, Zap, Star } from 'lucide-react';
import { Contact, ContactType } from '../../types/addressBook';
import { useAddressBookStore } from '../../store/addressBookStore';

interface AddressBookAutocompleteProps {
  type: ContactType | 'all';
  query: string;
  onSelect: (contact: Contact) => void;
  visible: boolean;
  onClose: () => void;
}

export const AddressBookAutocomplete: React.FC<AddressBookAutocompleteProps> = ({
  type,
  query,
  onSelect,
  visible,
}) => {
  const contacts = useAddressBookStore((state) => state.contacts);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 2) return [];

    return contacts
      .filter((c) => {
        if (type !== 'all' && c.type !== type) return false;
        // Don't show if query is already the exact full value
        if (c.value.toLowerCase() === q) return false;

        const nameMatch = c.name.toLowerCase().includes(q);
        const valMatch = c.value.toLowerCase().includes(q);
        const netMatch = c.network && c.network.toLowerCase().includes(q);

        return nameMatch || valMatch || netMatch;
      })
      .sort((a, b) => {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        return (b.lastUsedAt || 0) - (a.lastUsedAt || 0);
      })
      .slice(0, 4);
  }, [contacts, type, query]);

  if (!visible || matches.length === 0) return null;

  return (
    <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-surface-container-high border border-outline-variant/30 rounded-xl shadow-xl overflow-hidden animate-fade-in backdrop-blur-md">
      <div className="p-1 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider px-3 pt-2 pb-1 flex items-center justify-between">
        <span>Address Book Suggestions</span>
        <span>{matches.length} found</span>
      </div>
      <div className="divide-y divide-outline-variant/10">
        {matches.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c)}
            className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-surface-container transition-colors cursor-pointer group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-6 h-6 rounded-full bg-surface-container-highest flex items-center justify-center shrink-0">
                {c.type === 'momo' ? (
                  <Phone size={12} className="text-emerald-400" />
                ) : (
                  <Zap size={12} className="text-amber-400" />
                )}
              </div>
              <div className="truncate">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-on-surface truncate group-hover:text-primary transition-colors">
                    {c.name}
                  </span>
                  {c.network && (
                    <span className="text-[9px] font-bold uppercase px-1 py-0.2 rounded bg-surface-container-highest text-on-surface-variant border border-outline-variant/20">
                      {c.network}
                    </span>
                  )}
                  {c.isFavorite && (
                    <Star size={10} className="text-amber-400 fill-amber-400 shrink-0" />
                  )}
                </div>
                {c.name.trim().toLowerCase() !== c.value.trim().toLowerCase() && (
                  <span className="text-[11px] font-mono text-on-surface-variant/70 truncate block">
                    {c.value}
                  </span>
                )}
              </div>
            </div>
            <span className="text-[10px] text-primary/70 font-bold group-hover:text-primary transition-colors ml-2 shrink-0">
              Select
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
