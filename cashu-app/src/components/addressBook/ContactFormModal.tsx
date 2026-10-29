import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { X, User, Phone, Zap, Star } from 'lucide-react';
import { Contact, ContactType } from '../../types/addressBook';
import { useAddressBookStore } from '../../store/addressBookStore';
import { toast } from 'react-hot-toast';

interface ContactFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialContact?: Contact | null;
  defaultType?: ContactType;
  defaultCurrency?: string;
}

const TYPE_TABS = [
  { id: 'momo' as const, label: 'MoMo' },
  { id: 'lightning' as const, label: 'Lightning' },
];

export const ContactFormModal: React.FC<ContactFormModalProps> = ({
  isOpen,
  onClose,
  initialContact,
  defaultType = 'momo',
  defaultCurrency = 'RWF',
}) => {
  const { addContact, updateContact } = useAddressBookStore();

  const [name, setName] = useState(initialContact?.name || '');
  const [type, setType] = useState<ContactType>(initialContact?.type || defaultType);
  const [value, setValue] = useState(initialContact?.value || '');
  const [notes, setNotes] = useState(initialContact?.notes || '');
  const [isFavorite, setIsFavorite] = useState(!!initialContact?.isFavorite);

  // Animated sliding pill indicator (matching AddressBook and TopNav)
  const tabsNavRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pillStyle, setPillStyle] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    opacity: 0,
  });
  const [isInitialMount, setIsInitialMount] = useState(true);

  const updatePill = () => {
    const el = tabRefs.current[type];
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
    if (isOpen) {
      updatePill();
      const timer = setTimeout(() => setIsInitialMount(false), 50);
      return () => clearTimeout(timer);
    }
  }, [type, isOpen]);

  useEffect(() => {
    const handleResize = () => updatePill();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [type, isOpen]);

  // Sync state if initialContact changes
  useEffect(() => {
    if (initialContact) {
      setName(initialContact.name);
      setType(initialContact.type);
      setValue(initialContact.value);
      setNotes(initialContact.notes || '');
      setIsFavorite(!!initialContact.isFavorite);
    } else {
      setName('');
      setType(defaultType);
      setValue('');
      setNotes('');
      setIsFavorite(false);
    }
  }, [initialContact, defaultType, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Please enter a name');
      return;
    }
    if (!value.trim()) {
      toast.error('Please enter an address or phone number');
      return;
    }

    if (type === 'momo') {
      const cleanPhone = value.replace(/[^\d+]/g, '');
      if (cleanPhone.length < 8) {
        toast.error('Please enter a valid phone number');
        return;
      }
    } else if (type === 'lightning') {
      const cleanVal = value.trim().toLowerCase();
      if (!cleanVal.includes('@') && !cleanVal.startsWith('lnurl')) {
        toast.error('Please enter a valid Lightning address or LNURL');
        return;
      }
    }

    if (initialContact) {
      updateContact(initialContact.id, {
        name: name.trim(),
        type,
        value: value.trim(),
        network: type === 'momo' ? 'mtn' : undefined,
        notes: notes.trim() || undefined,
        isFavorite,
      });
      toast.success('Contact updated');
    } else {
      addContact({
        name: name.trim(),
        type,
        value: value.trim(),
        network: type === 'momo' ? 'mtn' : undefined,
        currency: defaultCurrency,
        notes: notes.trim() || undefined,
        isFavorite,
      });
      toast.success('Contact added');
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-surface-container-high border border-outline-variant/30 rounded-2xl p-5 sm:p-6 shadow-2xl flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            <h3 className="text-title-md font-title text-on-surface">
              {initialContact ? 'Edit Contact' : 'New Contact'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface p-1 rounded-full hover:bg-surface-container transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Type Selector with animated sliding pill (consistent with AddressBook page) */}
          {!initialContact && (
            <div
              ref={tabsNavRef}
              className="flex items-center rounded-xl bg-[#0c1b14] p-1 border border-[#142d20] relative shadow-sm overflow-hidden"
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

              {TYPE_TABS.map((t) => {
                const isActive = type === t.id;
                return (
                  <button
                    key={t.id}
                    ref={(el) => {
                      tabRefs.current[t.id] = el;
                    }}
                    type="button"
                    onClick={() => setType(t.id)}
                    className={`relative z-10 flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors duration-200 select-none cursor-pointer ${
                      isActive
                        ? 'text-primary font-bold'
                        : 'text-[#8b9e94] hover:text-[#f7f4eb]'
                    }`}
                  >
                    {t.id === 'momo' ? <Phone size={14} /> : <Zap size={14} />}
                    {t.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="text-label-sm text-on-surface-variant block mb-1.5 font-medium">
              Contact Name or Nickname
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={type === 'momo' ? 'e.g. Alice MTN, Mom' : 'e.g. Bob, Nostr Zap'}
              className="w-full bg-[#0c1b14] rounded-xl px-3.5 py-2.5 text-sm text-on-surface border border-[#142d20] focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
          </div>

          {/* Value (Phone or Address) */}
          <div>
            <label className="text-label-sm text-on-surface-variant block mb-1.5 font-medium">
              {type === 'momo' ? 'MoMo Phone Number' : 'Lightning Address or LNURL'}
            </label>
            <input
              type={type === 'momo' ? 'tel' : 'text'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={type === 'momo' ? '078...' : 'name@domain.com'}
              className="w-full bg-[#0c1b14] rounded-xl px-3.5 py-2.5 text-sm text-on-surface border border-[#142d20] focus:outline-none focus:ring-1 focus:ring-primary font-mono text-xs"
            />
          </div>

          {/* Favorite Toggle */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-label-sm text-on-surface-variant flex items-center gap-1.5">
              <Star size={15} className={isFavorite ? 'text-amber-400 fill-amber-400' : 'text-on-surface-variant'} />
              Mark as Favorite
            </span>
            <button
              type="button"
              onClick={() => setIsFavorite(!isFavorite)}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer ${
                isFavorite ? 'bg-primary' : 'bg-surface-container-highest'
              }`}
            >
              <div
                className={`bg-on-primary w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                  isFavorite ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-[#0c1b14] hover:bg-[#12261d] active:scale-[0.98] border border-primary/50 hover:border-primary text-primary transition-all shadow-sm cursor-pointer"
            >
              {initialContact ? 'Save Changes' : 'Add Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
