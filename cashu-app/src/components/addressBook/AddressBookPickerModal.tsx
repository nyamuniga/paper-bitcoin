import React, { useState, useMemo } from 'react';
import { X, Search, Plus, Star, Phone, Zap, Clock, UserCheck } from 'lucide-react';
import { Contact, ContactType } from '../../types/addressBook';
import { useAddressBookStore } from '../../store/addressBookStore';
import { ContactFormModal } from './ContactFormModal';

interface AddressBookPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: ContactType | 'all';
  onSelect: (contact: Contact) => void;
  title?: string;
}

export const AddressBookPickerModal: React.FC<AddressBookPickerModalProps> = ({
  isOpen,
  onClose,
  type,
  onSelect,
  title,
}) => {
  const { contacts, toggleFavorite } = useAddressBookStore();
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const filteredContacts = useMemo(() => {
    return contacts
      .filter((c) => {
        if (type !== 'all' && c.type !== type) return false;
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          c.value.toLowerCase().includes(q) ||
          (c.network && c.network.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        // Favorites first, then most recently used
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        return (b.lastUsedAt || 0) - (a.lastUsedAt || 0);
      });
  }, [contacts, type, search]);

  const favorites = useMemo(() => filteredContacts.filter((c) => c.isFavorite), [filteredContacts]);
  const recents = useMemo(() => filteredContacts.filter((c) => !c.isFavorite), [filteredContacts]);

  if (!isOpen) return null;

  const defaultTitle =
    type === 'momo'
      ? 'Mobile Money Address Book'
      : type === 'lightning'
      ? 'Lightning Address Book'
      : 'Address Book';

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in">
        <div className="relative w-full max-w-md max-h-[85vh] bg-surface-container-high border border-outline-variant/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-outline-variant/20">
            <div className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-primary" />
              <h3 className="text-title-md font-title text-on-surface">
                {title || defaultTitle}
              </h3>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="h-[34px] px-3 rounded-xl bg-[#0c1b14] hover:bg-[#12261d] active:scale-[0.98] border border-dashed border-primary/50 hover:border-primary flex items-center justify-center gap-1.5 text-primary text-xs font-bold transition-all shadow-sm cursor-pointer group"
                title="Add new contact"
              >
                <div className="w-4 h-4 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <Plus size={11} className="text-primary stroke-[2.5]" />
                </div>
                <span>Add</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="text-on-surface-variant hover:text-on-surface p-1.5 rounded-full hover:bg-surface-container transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="p-3 sm:px-5 sm:pt-4 sm:pb-2">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-on-surface-variant/60 absolute left-3" />
              <input
                type="text"
                placeholder={type === 'momo' ? 'Search name or phone number...' : 'Search name or address...'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-surface-container text-on-surface rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary border border-outline-variant/30 placeholder:text-on-surface-variant/50"
                autoFocus
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 text-on-surface-variant/60 hover:text-on-surface p-0.5"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Contact List */}
          <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-2 space-y-4 min-h-[220px]">
            {filteredContacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-10 px-4 text-on-surface-variant">
                <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center mb-3 text-on-surface-variant/60">
                  {type === 'momo' ? <Phone size={22} /> : <Zap size={22} />}
                </div>
                <p className="text-sm font-medium text-on-surface mb-1">No contacts found</p>
                <p className="text-xs text-on-surface-variant/70 max-w-xs mb-4">
                  {search
                    ? `No matching contacts for "${search}"`
                    : 'Successful payments and top-ups will automatically be saved here, or you can add one manually.'}
                </p>
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="h-[38px] px-3.5 rounded-xl bg-[#0c1b14] hover:bg-[#12261d] active:scale-[0.98] border border-dashed border-primary/50 hover:border-primary text-primary text-xs font-bold inline-flex items-center gap-1.5 transition-all shadow-sm cursor-pointer group"
                >
                  <div className="w-4 h-4 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                    <Plus size={12} className="text-primary stroke-[2.5]" />
                  </div>
                  <span>Add First Contact</span>
                </button>
              </div>
            ) : (
              <>
                {/* Favorites */}
                {favorites.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold text-on-surface-variant/70 uppercase tracking-wider mb-1.5 px-1 flex items-center gap-1">
                      <Star size={12} className="text-amber-400 fill-amber-400" />
                      Favorites
                    </p>
                    <div className="space-y-1.5">
                      {favorites.map((c) => (
                        <ContactListItem
                          key={c.id}
                          contact={c}
                          onSelect={() => {
                            onSelect(c);
                            onClose();
                          }}
                          onToggleFavorite={() => toggleFavorite(c.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Recents / Others */}
                {recents.length > 0 && (
                  <div>
                    {favorites.length > 0 && (
                      <p className="text-[11px] font-bold text-on-surface-variant/70 uppercase tracking-wider mb-1.5 px-1 flex items-center gap-1">
                        <Clock size={12} />
                        Recent & Saved
                      </p>
                    )}
                    <div className="space-y-1.5">
                      {recents.map((c) => (
                        <ContactListItem
                          key={c.id}
                          contact={c}
                          onSelect={() => {
                            onSelect(c);
                            onClose();
                          }}
                          onToggleFavorite={() => toggleFavorite(c.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <ContactFormModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        defaultType={type === 'all' ? 'momo' : type}
      />
    </>
  );
};

interface ContactListItemProps {
  contact: Contact;
  onSelect: () => void;
  onToggleFavorite: () => void;
}

const ContactListItem: React.FC<ContactListItemProps> = ({ contact, onSelect, onToggleFavorite }) => {
  return (
    <div className="group flex items-center justify-between p-2.5 rounded-xl bg-surface-container/60 hover:bg-surface-container border border-outline-variant/15 hover:border-outline-variant/40 transition-all">
      <button
        type="button"
        onClick={onSelect}
        className="flex-1 flex items-center gap-3 text-left overflow-hidden cursor-pointer"
      >
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-surface-container-highest flex items-center justify-center font-bold text-xs text-primary shrink-0">
          {contact.type === 'momo' ? (
            <Phone size={16} className="text-emerald-400" />
          ) : (
            <Zap size={16} className="text-amber-400" />
          )}
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-on-surface truncate">
              {contact.name}
            </span>
            {contact.network && (
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-surface-container-highest text-on-surface-variant border border-outline-variant/20 shrink-0">
                {contact.network}
              </span>
            )}
          </div>
          {contact.name.trim().toLowerCase() !== contact.value.trim().toLowerCase() && (
            <span className="text-xs font-mono text-on-surface-variant/70 truncate block">
              {contact.value}
            </span>
          )}
        </div>
      </button>

      {/* Favorite Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        className="p-1.5 rounded-lg text-on-surface-variant/40 hover:text-amber-400 transition-colors ml-2 cursor-pointer shrink-0"
        title={contact.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        <Star
          size={16}
          className={contact.isFavorite ? 'text-amber-400 fill-amber-400' : 'text-on-surface-variant/40'}
        />
      </button>
    </div>
  );
};
