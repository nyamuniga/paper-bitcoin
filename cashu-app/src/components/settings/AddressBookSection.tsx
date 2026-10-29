import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookUser, ChevronDown, Plus, ExternalLink, Phone, Zap } from 'lucide-react';
import { useAddressBookStore } from '../../store/addressBookStore';
import { ContactFormModal } from '../addressBook/ContactFormModal';

interface AddressBookSectionProps {
  isExpanded?: boolean;
  onToggle?: () => void;
}

export const AddressBookSection: React.FC<AddressBookSectionProps> = ({
  isExpanded: isExpandedProp,
  onToggle,
}) => {
  const navigate = useNavigate();
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = isExpandedProp !== undefined ? isExpandedProp : internalExpanded;
  const toggleExpanded = onToggle || (() => setInternalExpanded((prev) => !prev));

  const contacts = useAddressBookStore((s) => s.contacts);
  const [showAddModal, setShowAddModal] = useState(false);

  const recentContacts = [...contacts]
    .sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0))
    .slice(0, 3);

  return (
    <>
      <section className="bg-surface-container-high rounded-xl border border-outline-variant overflow-hidden relative group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none transition-transform group-hover:scale-110 duration-700"></div>

        {/* Accordion Header */}
        <div
          onClick={toggleExpanded}
          className="flex items-center justify-between p-4 md:p-6 relative z-10 cursor-pointer hover:bg-surface-container-highest transition-colors select-none"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex shrink-0 items-center justify-center text-primary border border-primary/20">
              <BookUser size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-body-md font-body-md font-bold text-on-surface mb-0.5">Address Book</h2>
              <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
                {contacts.length === 0
                  ? 'No saved contacts'
                  : `${contacts.length} saved contact${contacts.length === 1 ? '' : 's'}`}
              </p>
            </div>
          </div>

          <div className="text-on-surface-variant shrink-0 ml-3">
            <ChevronDown
              size={20}
              className={`transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                isExpanded ? 'rotate-180 text-primary' : 'text-on-surface-variant'
              }`}
            />
          </div>
        </div>

        {/* Accordion Content */}
        <div className={isExpanded ? 'accordion-content-expand' : 'accordion-content-collapse'}>
          <div className={`accordion-inner-content ${isExpanded ? 'accordion-inner-content-open' : 'accordion-inner-content-closed'}`}>
            <div className="px-4 md:px-6 pb-4 md:pb-6 pt-2 border-t border-outline-variant space-y-4 relative z-10">
              {recentContacts.length === 0 && (
                <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed pt-1">
                  Save your frequent MoMo numbers and Lightning addresses for quick transfers.
                </p>
              )}

              {/* Recent contacts preview */}
              {recentContacts.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-on-surface-variant/70 uppercase tracking-wider block px-1">
                    Recently Used
                  </span>
                  {recentContacts.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between p-2 rounded-xl bg-surface-container-highest/40 border border-outline-variant/15 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {c.type === 'momo' ? (
                          <Phone size={13} className="text-emerald-400 shrink-0" />
                        ) : (
                          <Zap size={13} className="text-amber-400 shrink-0" />
                        )}
                        <span className="font-semibold text-on-surface truncate">{c.name}</span>
                      </div>
                      {c.name.trim().toLowerCase() !== c.value.trim().toLowerCase() && (
                        <span className="text-[11px] font-mono text-on-surface-variant/70 truncate max-w-[140px] shrink-0 ml-2">
                          {c.value}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="flex-1 h-[42px] px-3 rounded-xl bg-surface-container-highest hover:bg-surface-bright active:scale-[0.98] border border-dashed border-primary/40 hover:border-primary text-primary text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer group whitespace-nowrap"
                >
                  <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                    <Plus size={13} className="text-primary stroke-[2.5]" />
                  </div>
                  <span>Add</span>
                </button>

                <button
                  type="button"
                  onClick={() => navigate('/address-book')}
                  className="flex-1 h-[42px] px-3 rounded-xl bg-surface-container-highest hover:bg-surface-bright active:scale-[0.98] border border-outline-variant hover:border-primary/50 text-on-surface hover:text-primary text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer group whitespace-nowrap"
                >
                  <span>Manage All</span>
                  <ExternalLink size={13} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <ContactFormModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        defaultType="momo"
      />
    </>
  );
};
