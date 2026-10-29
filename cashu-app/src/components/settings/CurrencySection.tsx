import React, { useState, useMemo } from 'react';
import { Globe, ChevronDown, Check, Search } from 'lucide-react';
import { useCurrencyStore } from '../../store/currencyStore';
import { CURRENCIES, POPULAR_CURRENCIES } from '../../services/currencyService';

interface CurrencySectionProps {
  isExpanded?: boolean;
  onToggle?: () => void;
}

export const CurrencySection: React.FC<CurrencySectionProps> = ({
  isExpanded: isExpandedProp,
  onToggle,
}) => {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = isExpandedProp !== undefined ? isExpandedProp : internalExpanded;
  const toggleExpanded = onToggle || (() => setInternalExpanded((prev) => !prev));

  const [searchQuery, setSearchQuery] = useState('');
  const preferredCurrency = useCurrencyStore((s) => s.preferredCurrency);
  const setPreferredCurrency = useCurrencyStore((s) => s.setPreferredCurrency);
  const rates = useCurrencyStore((s) => s.rates);

  const handleSelectCurrency = (code: string) => {
    setPreferredCurrency(code);
    if (isExpanded) {
      if (onToggle) {
        onToggle();
      } else {
        setInternalExpanded(false);
      }
    }
  };

  const currentMeta = CURRENCIES[preferredCurrency] || {
    code: preferredCurrency,
    name: preferredCurrency,
    symbol: preferredCurrency,
    decimals: 2,
  };

  const filteredCurrencies = useMemo(() => {
    const list = Object.values(CURRENCIES);
    if (!searchQuery.trim()) return list;
    const query = searchQuery.trim().toLowerCase();
    return list.filter(
      (c) =>
        c.code.toLowerCase().includes(query) ||
        c.name.toLowerCase().includes(query) ||
        c.symbol.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const formatRate = (code: string) => {
    const rate = rates[code];
    if (!rate || rate <= 0) return null;
    const meta = CURRENCIES[code];
    const dec = meta?.decimals ?? 2;
    return dec === 0
      ? Math.round(rate).toLocaleString()
      : rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <section className="bg-surface-container-high rounded-xl border border-outline-variant overflow-hidden relative group">
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none transition-transform group-hover:scale-110 duration-700"></div>

      {/* Header */}
      <div
        className="flex items-center justify-between p-4 md:p-6 relative z-10 cursor-pointer hover:bg-surface-container-highest transition-colors select-none"
        onClick={toggleExpanded}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex shrink-0 items-center justify-center text-primary border border-primary/20">
            <Globe size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-body-md font-body-md font-bold text-on-surface mb-0.5">Currency</h2>
            <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
              {currentMeta.name} ({currentMeta.code})
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
            {/* Quick Pick Chips */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {POPULAR_CURRENCIES.map((code) => {
                const isSelected = preferredCurrency === code;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => handleSelectCurrency(code)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer border ${
                      isSelected
                        ? 'bg-[#0c1b14] text-primary border-primary shadow-sm'
                        : 'bg-[#0c1b14] hover:bg-[#12261d] text-on-surface-variant hover:text-on-surface border-[#142d20]'
                    }`}
                  >
                    {code}
                  </button>
                );
              })}
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search currency..."
                className="w-full pl-9 pr-3 py-2 bg-[#0c1b14] text-on-surface placeholder:text-on-surface-variant/40 rounded-xl text-xs sm:text-sm border border-[#142d20] focus:border-primary/50 focus:ring-1 focus:ring-primary focus:outline-none transition-colors"
              />
            </div>

            {/* Currencies List */}
            <div className="max-h-64 overflow-y-auto overscroll-contain pr-1 divide-y divide-outline-variant/15 border border-outline-variant/20 rounded-xl bg-surface-container/30">
              {filteredCurrencies.map((c) => {
                const isSelected = preferredCurrency === c.code;
                const formattedRate = formatRate(c.code);

                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => handleSelectCurrency(c.code)}
                    className={`w-full flex items-center justify-between p-3 text-left transition-colors cursor-pointer group/row ${
                      isSelected
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-surface-container-high/60 text-on-surface'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono text-xs font-bold shrink-0 border ${
                          isSelected
                            ? 'bg-primary/20 border-primary/40 text-primary'
                            : 'bg-surface-container border-outline-variant/30 text-on-surface-variant group-hover/row:text-on-surface'
                        }`}
                      >
                        {c.symbol}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs sm:text-sm">{c.code}</span>
                          <span className="text-[11px] text-on-surface-variant truncate">
                            {c.name}
                          </span>
                        </div>
                        {formattedRate && (
                          <div className="text-[10px] text-on-surface-variant/60 font-mono mt-0.5">
                            1 BTC ≈ {c.symbol !== c.code ? c.symbol : ''}{formattedRate}
                          </div>
                        )}
                      </div>
                    </div>

                    {isSelected && (
                      <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0 border border-primary/30">
                        <Check size={14} className="stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}

              {filteredCurrencies.length === 0 && (
                <div className="text-center py-6 text-xs text-on-surface-variant">
                  No currencies match "{searchQuery}"
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
