import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'react-hot-toast';
import { Link2, ChevronDown, ChevronRight, Copy, QrCode, Edit2, RefreshCcw, Check, X, X as XIcon } from 'lucide-react';
import QRCode from 'react-qr-code';
import { useWalletStore } from '../../store/wallet';
import { MintIcon } from '../shared/MintIcon';
import { MintName } from '../shared/MintName';

export const NWCSection = () => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [nwcUri, setNwcUri] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const [mintUrl, setMintUrl] = useState<string>('');
  const [limitSats, setLimitSats] = useState<number | null>(null);

  const [isEditingMint, setIsEditingMint] = useState(false);
  const [isEditingLimit, setIsEditingLimit] = useState(false);
  const [mintInput, setMintInput] = useState('');
  const [limitInput, setLimitInput] = useState('');

  const [showQR, setShowQR] = useState(false);

  const { mintBalances, refreshWallet } = useWalletStore();
  const mints = Object.keys(mintBalances);
  const defaultMint = localStorage.getItem('preferred_mint_url') || 'https://mint.28waves.com';

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const enabled = localStorage.getItem('nwc_enabled') === 'true';
        setIsEnabled(enabled);
        if (enabled) {
          const uri: string = await invoke('get_nwc_uri');
          if (uri) {
            setNwcUri(uri);
          }
        }

        const config: { mint_url: string | null, payment_limit_sats: number | null } = await invoke('get_nwc_config');
        setMintUrl(config.mint_url || defaultMint);
        setLimitSats(config.payment_limit_sats);
      } catch (e) {
        console.error(e);
      }
    };
    checkStatus();
  }, [defaultMint]);

  const saveConfig = async (newMint: string, newLimit: number | null) => {
    try {
      if (newMint && !mints.includes(newMint)) {
        await invoke('add_mint', { mintUrl: newMint });
        await refreshWallet();
        toast.success("Added new mint to trusted mints");
      }

      await invoke('set_nwc_config', {
        mintUrl: newMint || null,
        limitSats: newLimit
      });
      setMintUrl(newMint);
      setLimitSats(newLimit);
      toast.success("NWC settings updated");
    } catch (e: any) {
      toast.error(`Failed to save NWC settings: ${e}`);
    }
  };

  const handleToggle = async () => {
    if (!isEnabled) {
      try {
        await invoke('enable_nwc');
        const uri: string = await invoke('get_nwc_uri');
        setNwcUri(uri);
        setIsEnabled(true);
        localStorage.setItem('nwc_enabled', 'true');
        toast.success("NWC enabled! Background payments are active.");
      } catch (error: any) {
        toast.error(`Failed to enable NWC: ${error}`);
      }
    } else {
      setIsEnabled(false);
      setNwcUri(null);
      localStorage.setItem('nwc_enabled', 'false');
      toast.success("NWC disabled.");
    }
  };

  const copyToClipboard = () => {
    if (nwcUri) {
      navigator.clipboard.writeText(nwcUri);
      toast.success('NWC URI copied to clipboard');
    }
  };

  const handleResetConnection = async () => {
    if (confirm("Are you sure you want to reset the connection? Paired apps will be disconnected.")) {
      setIsResetting(true);
      try {
        const newUri: string = await invoke('reset_nwc_keys');
        setNwcUri(newUri);
        toast.success('Connection reset. Paired apps are now disconnected.');
      } catch (error: any) {
        toast.error(`Failed to reset connection: ${error}`);
      } finally {
        setIsResetting(false);
      }
    }
  };

  const truncateUri = (uri: string | null) => {
    if (!uri) return '';
    if (uri.length < 30) return uri;
    return `${uri.substring(0, 16)}...${uri.substring(uri.length - 12)}`;
  };

  return (
    <div className="bg-surface-container-high rounded-2xl border border-outline-variant/20 shadow-sm relative overflow-hidden group">
      <div className="absolute top-0 left-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 -translate-x-1/4 pointer-events-none transition-transform group-hover:scale-110 duration-700"></div>

      <div
        className="flex items-center justify-between p-4 md:p-6 relative z-10 cursor-pointer hover:bg-surface-container-highest transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex shrink-0 items-center justify-center text-primary border border-primary/20">
            <Link2 size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="text-body-md font-body-md font-bold text-on-surface mb-1 truncate">Wallet Connect</h2>
            <p className="text-sm text-on-surface-variant truncate">Connect a Nostr app to this wallet.</p>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-on-surface-variant shrink-0 hidden sm:block">
            {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 md:px-6 pb-4 md:pb-6 pt-2 border-t border-outline-variant/10 relative z-10">
          <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">
            Connect a Nostr app to this wallet. Paired apps can check your balance, create invoices, and pay Lightning invoices with your ecash.
          </p>

          <div className="space-y-6">
            {/* SERVICE Section */}
            <div>
              <h3 className="text-xs font-bold text-on-surface-variant/70 uppercase tracking-wider mb-3">Service</h3>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-body-md font-medium text-on-surface">Enable Wallet Connect</div>
                  {isEnabled && <div className="text-sm text-on-surface-variant mt-0.5">Connected</div>}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggle();
                  }}
                  className={`w-12 h-6 rounded-full transition-colors relative ${isEnabled ? 'bg-primary' : ' bg-surface-container-low'
                    }`}
                >
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white transition-transform ${isEnabled ? 'left-[calc(100%-1.25rem)]' : 'left-1'
                      }`}
                  />
                </button>
              </div>
            </div>

            {isEnabled && nwcUri && (
              <>
                {/* CONNECTION Section */}
                <div className="border-t border-outline-variant/10 pt-6">
                  <h3 className="text-xs font-bold text-on-surface-variant/70 uppercase tracking-wider mb-3">Connection</h3>
                  <div className="flex bg-surface-container-low p-4 rounded-xl items-center justify-between py-2">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div className="w-2 h-2 rounded-full bg-green-500 shrink-0"></div>
                      <span className="font-mono text-sm text-on-surface truncate">{truncateUri(nwcUri)}</span>
                    </div>
                    <div className="flex items-center gap-4 text-on-surface-variant shrink-0 ml-4">
                      <button onClick={copyToClipboard} className="hover:text-primary transition-colors">
                        <Copy size={20} />
                      </button>
                      <button onClick={() => setShowQR(!showQR)} className="hover:text-primary transition-colors">
                        <QrCode size={20} />
                      </button>
                    </div>
                  </div>
                  {showQR && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowQR(false)}>
                      <div className="bg-surface-container-high p-6 rounded-2xl max-w-sm w-full flex flex-col items-center" onClick={e => e.stopPropagation()}>
                        <div className="w-full flex justify-between items-center mb-6">
                          <h3 className="text-body-lg font-bold text-on-surface">Scan to Connect</h3>
                          <button onClick={() => setShowQR(false)} className="p-2 hover:bg-surface-variant rounded-full transition-colors text-on-surface-variant">
                            <XIcon size={20} />
                          </button>
                        </div>
                        <div className="bg-white p-4 rounded-xl shadow-inner mb-6">
                          <QRCode value={nwcUri} size={240} />
                        </div>
                        <p className="text-center text-sm text-on-surface-variant leading-relaxed">
                          Scan this QR code from your Nostr app to grant it access to spend your ecash.
                        </p>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-on-surface-variant/80 mt-3 leading-relaxed">
                    Keep this code private. Anyone with it can spend within your payment limit.
                  </p>
                </div>

                {/* SPENDING Section */}
                <div className="border-t border-outline-variant/10 pt-6">
                  <h3 className="text-xs font-bold text-on-surface-variant/70 uppercase tracking-wider mb-3">Spending</h3>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between group">
                      <span className="text-body-md text-on-surface-variant">Mint</span>
                      {isEditingMint ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            className=" bg-surface-container-low rounded px-2 py-1 text-sm text-on-surface w-40 outline-none focus:ring-1 focus:ring-primary"
                            value={mintInput}
                            onChange={e => setMintInput(e.target.value)}
                            placeholder="https://..."
                          />
                          <button onClick={() => { saveConfig(mintInput, limitSats); setIsEditingMint(false); }} className="text-green-500 p-1 hover:bg-green-500/10 rounded">
                            <Check size={16} />
                          </button>
                          <button onClick={() => setIsEditingMint(false)} className="text-red-500 p-1 hover:bg-red-500/10 rounded">
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-on-surface group-hover:text-primary transition-colors cursor-pointer" onClick={() => { setMintInput(mintUrl); setIsEditingMint(true); }}>
                          <div className="flex items-center gap-2 max-w-[180px] overflow-hidden">
                            <MintIcon mintUrl={mintUrl} className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0" textClassName="text-primary text-[10px] font-bold" />
                            <MintName mintUrl={mintUrl} className="font-medium truncate" />
                          </div>
                          <Edit2 size={14} className="opacity-50 ml-1 flex-shrink-0" />
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between group">
                      <span className="text-body-md text-on-surface-variant">Payment limit (sats)</span>
                      {isEditingLimit ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            className="bg-surface-container-low rounded px-2 py-1 text-sm text-on-surface w-32 outline-none focus:ring-1 focus:ring-primary"
                            value={limitInput}
                            onChange={e => setLimitInput(e.target.value)}
                            placeholder="No limit"
                          />
                          <button onClick={() => { saveConfig(mintUrl, limitInput ? parseInt(limitInput) : null); setIsEditingLimit(false); }} className="text-green-500 p-1 hover:bg-green-500/10 rounded">
                            <Check size={16} />
                          </button>
                          <button onClick={() => setIsEditingLimit(false)} className="text-red-500 p-1 hover:bg-red-500/10 rounded">
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-on-surface group-hover:text-primary transition-colors cursor-pointer" onClick={() => { setLimitInput(limitSats ? limitSats.toString() : ''); setIsEditingLimit(true); }}>
                          <span className="font-medium">{limitSats ? limitSats.toLocaleString() : 'No limit'}</span>
                          <Edit2 size={14} className="opacity-50" />
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-on-surface-variant/80 mt-4 leading-relaxed">
                    Payments are sent as ecash from this mint over your Nostr relays.
                  </p>
                </div>

                {/* CONNECTION MANAGEMENT Section */}
                <div className="border-t border-outline-variant/10 pt-6">
                  <h3 className="text-xs font-bold text-on-surface-variant/70 uppercase tracking-wider mb-3">Connection Management</h3>

                  <button
                    onClick={handleResetConnection}
                    disabled={isResetting}
                    className="flex flex-col items-start gap-1 text-left group w-full"
                  >
                    <div className="flex items-center gap-2 text-red-500 group-hover:text-red-400 transition-colors">
                      <RefreshCcw size={18} className={isResetting ? "animate-spin" : ""} />
                      <span className="font-medium">Reset connection</span>
                    </div>
                    <span className="text-sm text-on-surface-variant">
                      Create a new code and disconnect paired apps
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
