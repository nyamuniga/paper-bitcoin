import React, { useState, useMemo, useRef, useLayoutEffect, useEffect } from 'react';
import { Plus, Search, Star, Phone, Zap, Edit2, Trash2, Clock, UserCheck, X } from 'lucide-react';
import { PageHeader } from '../components/shared/PageHeader';
import { useAddressBookStore } from '../store/addressBookStore';
import { Contact } from '../types/addressBook';
import { ContactFormModal } from '../components/addressBook/ContactFormModal';
import { toast } from 'react-hot-toast';

const FILTER_TABS = [
  { id: 'all', label: 'All', rank: 0 },
  { id: 'momo', label: 'MoMo', rank: 1 },
  { id: 'lightning', label: 'Lightning', rank: 2 },
  { id: 'favorites', label: 'Favorites', rank: 3 },
] as const;

type FilterTabId = typeof FILTER_TABS[number]['id'];

export const AddressBook: React.FC = () => {
  const { contacts, deleteContact, toggleFavorite } = useAddressBookStore();

  const [activeTab, setActiveTab] = useState<FilterTabId>('all');
  const [search, setSearch] = useState('');
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<Contact | null>(null);

  // Tab sliding pill animation (matching TopNav)
  const tabsNavRef = useRef<HTMLElement | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pillStyle, setPillStyle] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    opacity: 0,
  });
  const [isInitialMount, setIsInitialMount] = useState(true);

  // Page-like transition animation when changing filter tab
  const [transitionClass, setTransitionClass] = useState<string>('animate-page-lift');
  const prevTabRef = useRef<FilterTabId>('all');

  const updatePill = () => {
    const el = tabRefs.current[activeTab];
    if (el && tabsNavRef.current) {
      setPillStyle({
        left: el.offsetLeft,
        top: el.offsetTop,
        width: el.offsetWidth,
        height: el.offsetHeight,
        opacity: 1,
      });
    }
  };

  useLayoutEffect(() => {
    updatePill();
    const timer = setTimeout(() => setIsInitialMount(false), 50);
    return () => clearTimeout(timer);
  }, [activeTab]);

  useEffect(() => {
    const handleResize = () => updatePill();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeTab]);

  const handleTabChange = (nextTab: FilterTabId) => {
    if (nextTab === activeTab) return;
    const currentRank = FILTER_TABS.find((t) => t.id === activeTab)?.rank ?? 0;
    const nextRank = FILTER_TABS.find((t) => t.id === nextTab)?.rank ?? 0;

    if (nextRank > currentRank) {
      setTransitionClass('animate-page-forward');
    } else {
      setTransitionClass('animate-page-backward');
    }

    setActiveTab(nextTab);
    prevTabRef.current = nextTab;
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setTransitionClass('');
    }, 280);
    return () => clearTimeout(timer);
  }, [activeTab]);

  const filteredContacts = useMemo(() => {
    return contacts
      .filter((c) => {
        if (activeTab === 'favorites' && !c.isFavorite) return false;
        if (activeTab === 'momo' && c.type !== 'momo') return false;
        if (activeTab === 'lightning' && c.type !== 'lightning') return false;

        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          c.value.toLowerCase().includes(q) ||
          (c.network && c.network.toLowerCase().includes(q)) ||
          (c.notes && c.notes.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        return (b.lastUsedAt || 0) - (a.lastUsedAt || 0);
      });
  }, [contacts, activeTab, search]);

  const handleDelete = (contact: Contact) => {
    deleteContact(contact.id);
    setDeleteCandidate(null);
    toast.success(`Removed ${contact.name} from address book`);
  };

  const formatRelativeTime = (timestamp: number) => {
    const diffSeconds = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSeconds < 60) return 'Just now';
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
    return `${Math.floor(diffSeconds / 86400)}d ago`;
  };

  return (
    <main className="flex-1 w-full max-w-[1000px] mx-auto px-container-padding md:px-10 flex flex-col h-[calc(100vh-4rem-env(safe-area-inset-top,0px))] max-h-[calc(100vh-4rem-env(safe-area-inset-top,0px))] overflow-hidden">
      {/* Sticky Top Controls - Header, Add Contact Button, Filters, and Search */}
      <div className="flex-shrink-0 sticky top-0 z-30 bg-[#06110c]/95 backdrop-blur-md pt-2 pb-3.5 -mx-container-padding px-container-padding md:-mx-10 md:px-10 border-b border-outline-variant/15">
        <PageHeader
          title="Address Book"
          subtitle="Saved Mobile Money & Lightning payment destinations"
          sticky={false}
          className="mb-3"
        />

        {/* Add New Contact Button (Prominent Mints styling, above the tabs selector, sticks permanently on scroll!) */}
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="w-full h-[46px] sm:h-[48px] rounded-2xl bg-[#0c1b14] hover:bg-[#12261d] active:scale-[0.99] border border-dashed border-primary/50 hover:border-primary flex items-center justify-center gap-2.5 text-primary font-display-hero text-[13px] sm:text-[14px] font-bold transition-all shadow-sm cursor-pointer group mb-3"
        >
          <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
            <Plus size={15} className="text-primary stroke-[2.5]" />
          </div>
          <span>Add New</span>
        </button>

        {/* Tabs and Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          {/* Animated Sliding Filter Pills (matching TopNav) */}
          <nav
            ref={tabsNavRef}
            className="flex items-center rounded-xl bg-[#0c1b14] p-1 border border-[#142d20] relative shadow-sm overflow-x-auto"
          >
            {/* Sliding Indicator Pill */}
            <div
              className={`absolute top-0 left-0 rounded-lg pointer-events-none bg-[#183626] border border-[#2b563e] shadow-sm ${
                isInitialMount
                  ? ''
                  : 'transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]'
              }`}
              style={{
                transform: `translate3d(${pillStyle.left}px, ${pillStyle.top}px, 0)`,
                width: `${pillStyle.width}px`,
                height: `${pillStyle.height}px`,
                opacity: pillStyle.opacity,
              }}
            >
              <div className="absolute inset-x-2 top-0 h-[1px] bg-gradient-to-r from-transparent via-[#f2a93b]/40 to-transparent rounded-full pointer-events-none" />
            </div>

            {FILTER_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  ref={(el) => {
                    tabRefs.current[tab.id] = el;
                  }}
                  type="button"
                  onClick={() => handleTabChange(tab.id)}
                  className={`relative z-10 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors duration-200 select-none cursor-pointer ${
                    isActive
                      ? 'text-primary font-bold'
                      : 'text-[#8b9e94] hover:text-[#f7f4eb]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Search Field */}
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-4 h-4 text-on-surface-variant/60 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search contacts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#0c1b14] text-on-surface rounded-xl pl-9 pr-8 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary border border-[#142d20] placeholder:text-on-surface-variant/50"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant/60 hover:text-on-surface p-0.5"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Only the Contacts Area is Scrollable */}
      <div className="flex-1 overflow-y-auto pt-3 pb-8 pr-1">
        <div key={activeTab} className={transitionClass}>
          {filteredContacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-14 px-4 bg-surface-container/30 rounded-2xl border border-dashed border-outline-variant/30 my-2">
              <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center mb-4 text-on-surface-variant/60">
                <UserCheck size={28} />
              </div>
              <h3 className="text-body-lg font-semibold text-on-surface mb-1">
                {search ? 'No matching contacts' : 'No contacts saved yet'}
              </h3>
              <p className="text-xs text-on-surface-variant max-w-sm mb-5">
                {search
                  ? `No contacts match "${search}". Try searching for another name or address.`
                  : 'Contacts are automatically saved whenever you complete a MoMo cashout, top-up, or Lightning payment. You can also add contacts manually anytime.'}
              </p>
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="h-[44px] px-5 rounded-2xl bg-[#0c1b14] hover:bg-[#12261d] active:scale-[0.98] border border-dashed border-primary/50 hover:border-primary flex items-center justify-center gap-2 text-primary font-display-hero text-[13px] font-bold transition-all shadow-sm cursor-pointer group"
              >
                <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <Plus size={14} className="text-primary stroke-[2.5]" />
                </div>
                <span>Add First Contact</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
              {filteredContacts.map((contact) => (
                <div
                  key={contact.id}
                  className="group bg-surface-container-high/60 hover:bg-surface-container-high border border-outline-variant/20 hover:border-outline-variant/40 rounded-2xl p-4 transition-all duration-200 flex flex-col justify-between shadow-sm"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center shrink-0">
                          {contact.type === 'momo' ? (
                            <Phone size={18} className="text-emerald-400" />
                          ) : (
                            <Zap size={18} className="text-amber-400" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-sm font-bold text-on-surface truncate max-w-[180px]">
                              {contact.name}
                            </h4>
                            {contact.network && (
                              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-surface-container-highest text-on-surface-variant border border-outline-variant/20">
                                {contact.network}
                              </span>
                            )}
                          </div>
                          {contact.name.trim().toLowerCase() !== contact.value.trim().toLowerCase() && (
                            <span className="text-xs font-mono text-on-surface-variant/80 truncate block max-w-[220px]">
                              {contact.value}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Favorite Toggle */}
                      <button
                        type="button"
                        onClick={() => toggleFavorite(contact.id)}
                        className="p-1.5 rounded-lg text-on-surface-variant/40 hover:text-amber-400 transition-colors cursor-pointer"
                        title={contact.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <Star
                          size={18}
                          className={contact.isFavorite ? 'text-amber-400 fill-amber-400' : 'text-on-surface-variant/40'}
                        />
                      </button>
                    </div>

                    {contact.notes && (
                      <p className="text-xs text-on-surface-variant/70 italic bg-surface-container/50 px-2.5 py-1.5 rounded-lg mb-2">
                        {contact.notes}
                      </p>
                    )}
                  </div>

                  {/* Footer info & actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-outline-variant/15 text-[11px] text-on-surface-variant/60">
                    <div className="flex items-center gap-1 font-mono">
                      <Clock size={12} />
                      <span>
                        Used {contact.useCount || 1}x • {formatRelativeTime(contact.lastUsedAt || contact.createdAt)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => setEditingContact(contact)}
                        className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                        title="Edit contact"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteCandidate(contact)}
                        className="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-surface-container transition-colors cursor-pointer"
                        title="Delete contact"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Modal */}
      <ContactFormModal
        isOpen={showAddModal || !!editingContact}
        onClose={() => {
          setShowAddModal(false);
          setEditingContact(null);
        }}
        initialContact={editingContact}
        defaultType={activeTab === 'lightning' ? 'lightning' : 'momo'}
      />

      {/* Delete Confirmation Modal */}
      {deleteCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-surface-container-high border border-outline-variant/30 rounded-2xl p-5 max-w-sm w-full shadow-2xl">
            <h3 className="text-title-sm font-title text-on-surface mb-2">Delete Contact?</h3>
            <p className="text-xs text-on-surface-variant mb-4">
              Are you sure you want to remove <strong className="text-on-surface">{deleteCandidate.name}</strong> from your address book?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteCandidate(null)}
                className="flex-1 py-2 rounded-xl text-xs font-bold bg-surface-container text-on-surface-variant hover:text-on-surface cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteCandidate)}
                className="flex-1 py-2 rounded-xl text-xs font-bold bg-error text-on-error hover:bg-error/90 cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
