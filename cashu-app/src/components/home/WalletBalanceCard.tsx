import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { QrCode, ArrowDownLeft, ArrowUpRight, Coins, Zap, FileText, ChevronDown, Phone } from 'lucide-react';
import { ActionMenuModal } from './ActionMenuModal';
import { EcashModal } from './EcashModal';
import { BitcoinModal } from './BitcoinModal';
import { MomoTransferModal } from './MomoTransferModal';
import { MintIcon } from '../shared/MintIcon';
import { MintName } from '../shared/MintName';


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
  const [selectedMint, setSelectedMint] = useState<string | null>(null);

  const activeMint = selectedMint || (mintUrls.length > 0 ? mintUrls[0] : null);

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
    <section className="flex flex-col gap-4 md:gap-5">
      {/* Balance display */}
      <div className="relative p-6 md:p-10 flex flex-col items-center justify-center min-h-[140px] md:min-h-[200px] z-10">
        {/* Background layer */}
        <div className="absolute inset-0 bg-surface-container-high rounded-2xl overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] border border-outline-variant/20 -z-10">
          <div className="absolute inset-0 texture-overlay opacity-50"></div>
        </div>

        {showMintDropdown && (
          <div className="fixed inset-0 z-10" onClick={() => setShowMintDropdown(false)}></div>
        )}

        <div className="relative z-20 flex flex-col items-center">
          <button
            onClick={() => setShowMintDropdown(!showMintDropdown)}
            className="flex items-center gap-2 bg-surface/40 hover:bg-surface/70 px-3 py-1.5 rounded-full transition-colors mb-2 border border-outline-variant/20 shadow-sm"
          >
            {activeMint ? (
              <>
                <MintIcon mintUrl={activeMint} className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30 flex-shrink-0" textClassName="text-primary text-[9px] font-bold" />
                <MintName mintUrl={activeMint} className="text-label-caps font-label-caps text-on-surface-variant truncate max-w-[120px]" />
              </>
            ) : (
              <span className="text-label-caps font-label-caps text-on-surface-variant px-2">TOTAL BALANCE</span>
            )}
            <ChevronDown size={14} className="text-on-surface-variant flex-shrink-0" />
          </button>

          {showMintDropdown && (
            <div className="absolute top-full mt-2 w-64 bg-surface-container-highest rounded-2xl shadow-2xl border border-outline-variant/20 overflow-hidden flex flex-col animate-fade-in z-50 max-h-[300px] overflow-y-auto">
              {mintUrls.map((mint, index) => (
                <button
                  key={mint}
                  onClick={() => { setSelectedMint(mint); setShowMintDropdown(false); }}
                  className={`flex items-center justify-between p-3 hover:bg-surface-bright transition-colors text-left ${index > 0 ? 'border-t border-outline-variant/10' : ''}`}
                >
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <MintIcon mintUrl={mint} className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0" textClassName="text-primary text-[10px] font-bold" />
                    <MintName mintUrl={mint} className="text-body-sm font-body-sm text-on-surface truncate" />
                  </div>
                  <span className="text-body-sm font-body-sm font-bold text-on-surface flex-shrink-0">₿{(mintBalances![mint] || 0).toLocaleString()}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative z-10 flex items-baseline gap-2">
          <span className="text-[48px] md:text-[64px] leading-none font-display-lg text-on-surface tracking-tight">₿{balance.toLocaleString()}</span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
        <button
          onClick={() => setShowReceive(true)}
          className="flex items-center justify-center gap-2 py-3 px-2 rounded-2xl bg-surface-container-high text-on-surface font-headline-lg-mobile text-[14px] md:text-[15px] border border-outline-variant/30 hover:bg-surface-container-highest active:scale-[0.97] transition-all duration-200"
        >
          <ArrowDownLeft size={20} className="text-primary" />
          <span>Receive</span>
        </button>
        <Link
          to="/scan"
          className="flex items-center justify-center w-14 h-14 rounded-full bg-primary text-on-primary shadow-[0_4px_20px_rgba(212,157,66,0.3)] hover:opacity-90 active:scale-[0.97] transition-all duration-200"
        >
          <QrCode size={24} />
        </Link>
        <button
          onClick={() => setShowSend(true)}
          className="flex items-center justify-center gap-2 py-3 px-2 rounded-2xl bg-surface-container-high text-on-surface font-headline-lg-mobile text-[14px] md:text-[15px] border border-outline-variant/30 hover:bg-surface-container-highest active:scale-[0.97] transition-all duration-200"
        >
          <ArrowUpRight size={20} className="text-primary" />
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
