import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { QrCode, ArrowDownLeft, ArrowUpRight, Coins, Zap, FileText, ChevronDown, Phone, Check, Eye, EyeOff } from 'lucide-react';
import { ActionMenuModal } from './ActionMenuModal';
import { EcashModal } from './EcashModal';
import { BitcoinModal } from './BitcoinModal';
import { MomoTransferModal } from './MomoTransferModal';
import { MintIcon } from '../shared/MintIcon';
import { MintName } from '../shared/MintName';
import { fetchCurrentRate } from '../../services/flowServices';


interface WalletBalanceCardProps {
  balance: number;
  mintBalances?: Record<string, number>;
}

export const WalletBalanceCard: React.FC<WalletBalanceCardProps> = ({ balance, mintBalances }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showReceive, setShowReceive] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [showMintDropdown, setShowMintDropdown] = useState(false);
  const [ecashModalConfig, setEcashModalConfig] = useState<{ isOpen: boolean, tab: 'send' | 'receive', initialToken?: string } | null>(null);
  const [bitcoinModalConfig, setBitcoinModalConfig] = useState<{ isOpen: boolean, tab: 'send' | 'receive', initialInvoice?: string } | null>(null);
  const [momoModalConfig, setMomoModalConfig] = useState<{ isOpen: boolean, tab: 'send' | 'receive' } | null>(null);

  const mintUrls = Object.keys(mintBalances || {});
  const [selectedMint, setSelectedMint] = useState<string | null>(() => localStorage.getItem('preferred_mint_url'));
  const [currentRate, setCurrentRate] = useState<number | null>(null);
  const [hideBalance, setHideBalance] = useState<boolean>(() => localStorage.getItem('hide_balance') === 'true');

  const toggleHideBalance = () => {
    setHideBalance((prev) => {
      const next = !prev;
      localStorage.setItem('hide_balance', String(next));
      return next;
    });
  };

  const activeMint = (selectedMint && mintUrls.includes(selectedMint)) ? selectedMint : (mintUrls.length > 0 ? mintUrls[0] : null);

  React.useEffect(() => {
    const fetchRate = async () => {
      try {
        const rate = await fetchCurrentRate();
        setCurrentRate(rate);
      } catch (e) {
        console.error("Failed to fetch exchange rate", e);
      }
    };

    // Fetch immediately on mount
    fetchRate();

    // Set up polling every 5 seconds
    const interval = setInterval(fetchRate, 5000);

    // Clean up interval on unmount
    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    if (location.state) {
      const state = location.state as any;
      if (state.ecashToken) {
        setEcashModalConfig({ isOpen: true, tab: 'receive', initialToken: state.ecashToken });
        navigate(location.pathname, { replace: true, state: {} });
      } else if (state.lnbcInvoice) {
        setBitcoinModalConfig({ isOpen: true, tab: 'send', initialInvoice: state.lnbcInvoice });
        navigate(location.pathname, { replace: true, state: {} });
      }
    }
  }, [location, navigate]);

  return (
    <section className="flex flex-col gap-4 md:gap-5 relative z-50">
      {/* Balance display */}
      <div className="relative p-5 sm:p-6 md:p-8 flex flex-col items-center justify-center min-h-[150px] sm:min-h-[160px] md:min-h-[190px] z-10 bg-[#0c1b14] rounded-[24px] sm:rounded-[28px] border border-[#142d20] shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
        {showMintDropdown && (
          <div className="fixed inset-0 z-10" onClick={() => setShowMintDropdown(false)}></div>
        )}

        <div className="relative z-20 flex flex-col items-center max-w-full">
          <button
            onClick={() => setShowMintDropdown(!showMintDropdown)}
            className="flex items-center gap-2 bg-[#12261d] hover:bg-[#162f24] px-3 sm:px-3.5 py-1.5 rounded-full transition-all mb-3 border border-[#1e3c2e] shadow-sm active:scale-95 max-w-[calc(100vw-64px)] sm:max-w-none"
          >
            {activeMint ? (
              <>
                <MintIcon mintUrl={activeMint} className="w-5 h-5 rounded-full bg-[#183626] border border-[#2b563e] flex items-center justify-center flex-shrink-0" textClassName="text-primary text-[9px] font-bold" />
                <MintName
                  mintUrl={activeMint}
                  className="font-mono text-[10px] sm:text-[11px] font-bold text-[#8b9e94] tracking-wider uppercase truncate max-w-[120px] sm:max-w-[150px]"
                />
              </>
            ) : (
              <span className="font-mono text-[10px] sm:text-[11px] font-bold text-primary px-1 tracking-wider uppercase">ALL MINTS</span>
            )}
            <ChevronDown size={14} className="text-[#8b9e94] flex-shrink-0" />
          </button>

          {showMintDropdown && (
            <div className="absolute top-full mt-2 w-64 max-w-[calc(100vw-48px)] bg-[#0c1b14] rounded-2xl shadow-[0_16px_48px_-8px_rgba(0,0,0,0.7)] border border-[#1a3829] overflow-hidden flex flex-col animate-fade-in z-50 max-h-[300px] overflow-y-auto left-1/2 -translate-x-1/2">
              {mintUrls.map((mint) => (
                <button
                  key={mint}
                  onClick={() => {
                    setSelectedMint(mint);
                    localStorage.setItem('preferred_mint_url', mint);
                    invoke('set_app_default_mint', { mintUrl: mint }).catch(console.error);
                    setShowMintDropdown(false);
                  }}
                  className={`flex items-center justify-between p-3 sm:p-3.5 hover:bg-[#12261d] transition-colors text-left border-b border-[rgba(247,244,235,0.04)] last:border-b-0`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <MintIcon mintUrl={mint} className="w-6 h-6 rounded-full bg-[#183626] border border-[#2b563e] flex items-center justify-center flex-shrink-0" textClassName="text-primary text-[10px] font-bold" />
                    <MintName mintUrl={mint} className="text-body-sm font-body-sm text-on-surface truncate" />
                    {activeMint === mint && <Check size={14} className="text-primary flex-shrink-0" />}
                  </div>
                  <span className="font-mono text-body-sm font-semibold text-primary flex-shrink-0">
                    {hideBalance ? '••••••' : `₿${(mintBalances![mint] || 0).toLocaleString()}`}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative z-10 flex flex-col items-center gap-1 max-w-full">
          <div className="flex items-center justify-center gap-1.5 sm:gap-2 max-w-full">
            <span className="text-[#f2a93b] text-[28px] sm:text-[36px] md:text-[44px] font-extrabold leading-none select-none flex-shrink-0">₿</span>
            <span
              onClick={toggleHideBalance}
              className="text-[#f7f4eb] text-[34px] sm:text-[46px] md:text-[54px] leading-none font-display-hero font-extrabold tracking-tight cursor-pointer select-none truncate"
              title={hideBalance ? "Click to show balance" : "Click to hide balance"}
            >
              {hideBalance ? '••••••' : balance.toLocaleString()}
            </span>
            <button
              onClick={toggleHideBalance}
              className="text-[#627d70] hover:text-[#f7f4eb] p-1 sm:p-1.5 rounded-full hover:bg-[#12261d] transition-all active:scale-95 cursor-pointer ml-0.5 sm:ml-1 flex-shrink-0"
              title={hideBalance ? "Show balance" : "Hide balance"}
              aria-label={hideBalance ? "Show balance" : "Hide balance"}
            >
              {hideBalance ? <EyeOff size={18} className="sm:w-5 sm:h-5 stroke-[2.25]" /> : <Eye size={18} className="sm:w-5 sm:h-5 stroke-[2.25]" />}
            </button>
          </div>
          {currentRate && (
            <span className="text-[12px] sm:text-[13px] font-medium text-[#6f887b] mt-1 tracking-tight select-none truncate max-w-full">
              {hideBalance ? '≈ •••••• RWF' : `≈ ${(balance / currentRate).toLocaleString(undefined, { maximumFractionDigits: 0 })} RWF`}
            </span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={() => setShowReceive(true)}
          className="flex-1 h-[48px] sm:h-[54px] rounded-2xl bg-[#0c1b14] hover:bg-[#12261d] border border-[#183325] flex items-center justify-center gap-1.5 sm:gap-2 text-[#f7f4eb] font-display-hero text-[13px] sm:text-[15px] font-medium active:scale-95 transition-all duration-200 cursor-pointer"
        >
          <ArrowDownLeft size={16} className="sm:w-[18px] sm:h-[18px] text-[#f2a93b] stroke-[2.25] flex-shrink-0" />
          <span>Receive</span>
        </button>
        <Link
          to="/scan"
          className="w-[50px] h-[50px] sm:w-[58px] sm:h-[58px] rounded-full bg-[#f2a93b] hover:bg-[#fbb94d] text-[#06110c] shadow-[0_0_24px_rgba(242,169,59,0.45)] flex items-center justify-center active:scale-95 transition-all duration-200 flex-shrink-0"
        >
          <QrCode size={20} className="sm:w-[23px] sm:h-[23px] stroke-[2.5]" />
        </Link>
        <button
          onClick={() => setShowSend(true)}
          className="flex-1 h-[48px] sm:h-[54px] rounded-2xl bg-[#0c1b14] hover:bg-[#12261d] border border-[#183325] flex items-center justify-center gap-1.5 sm:gap-2 text-[#f7f4eb] font-display-hero text-[13px] sm:text-[15px] font-medium active:scale-95 transition-all duration-200 cursor-pointer"
        >
          <ArrowUpRight size={16} className="sm:w-[18px] sm:h-[18px] text-[#f2a93b] stroke-[2.25] flex-shrink-0" />
          <span>Send</span>
        </button>
      </div>

      {showReceive && (
        <ActionMenuModal
          title="Receive"
          onClose={() => setShowReceive(false)}
          options={[
            {
              label: 'Ecash',
              icon: <Coins size={20} />,
              colorClass: 'bg-primary/20 text-primary',
              onClick: () => {
                if (!activeMint && mintUrls.length === 0) return;
                setEcashModalConfig({ isOpen: true, tab: 'receive' });
              }
            },
            {
              label: 'Bitcoin',
              icon: <Zap size={20} />,
              colorClass: 'bg-primary/20 text-primary',
              onClick: () => {
                if (!activeMint && mintUrls.length === 0) return;
                setBitcoinModalConfig({ isOpen: true, tab: 'receive' });
              }
            },
            {
              label: 'RWF (Mobile Money)',
              icon: <Phone size={20} />,
              colorClass: 'bg-primary/20 text-primary',
              onClick: () => {
                setMomoModalConfig({ isOpen: true, tab: 'receive' });
              }
            }
          ]}
        />
      )}

      {showSend && (
        <ActionMenuModal
          title="Send"
          onClose={() => setShowSend(false)}
          options={[
            {
              label: 'Issue Note',
              icon: <FileText size={20} />,
              colorClass: 'bg-primary/20 text-primary',
              onClick: () => { navigate('/issue'); }
            },
            {
              label: 'Ecash',
              icon: <Coins size={20} />,
              colorClass: 'bg-primary/20 text-primary',
              onClick: () => {
                if (!activeMint && mintUrls.length === 0) return;
                setEcashModalConfig({ isOpen: true, tab: 'send' });
              }
            },
            {
              label: 'Bitcoin',
              icon: <Zap size={20} />,
              colorClass: 'bg-primary/20 text-primary',
              onClick: () => {
                if (!activeMint && mintUrls.length === 0) return;
                setBitcoinModalConfig({ isOpen: true, tab: 'send' });
              }
            },
            {
              label: 'RWF (Mobile Money)',
              icon: <Phone size={20} />,
              colorClass: 'bg-primary/20 text-primary',
              onClick: () => {
                setMomoModalConfig({ isOpen: true, tab: 'send' });
              }
            }
          ]}
        />
      )}

      {ecashModalConfig && (
        <EcashModal
          mintUrl={activeMint || mintUrls[0]}
          initialTab={ecashModalConfig.tab}
          initialToken={ecashModalConfig.initialToken}
          onClose={() => setEcashModalConfig(null)}
        />
      )}

      {bitcoinModalConfig && (
        <BitcoinModal
          mintUrl={activeMint || mintUrls[0]}
          initialTab={bitcoinModalConfig.tab}
          initialInvoice={bitcoinModalConfig.initialInvoice}
          onClose={() => setBitcoinModalConfig(null)}
        />
      )}

      {momoModalConfig && (
        <MomoTransferModal
          mintUrl={activeMint || mintUrls[0]}
          initialTab={momoModalConfig.tab}
          onClose={() => setMomoModalConfig(null)}
        />
      )}
    </section>
  );
};
