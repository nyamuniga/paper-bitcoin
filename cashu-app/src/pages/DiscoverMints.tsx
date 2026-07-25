import { useEffect, useState } from 'react';
import { PageHeader } from '../components/shared/PageHeader';
import { useMints } from '../hooks/useMints';
import { useWalletStore } from '../store/wallet';
import { Server, Plus, Check, Search, ShieldCheck, Zap, ChevronLeft, ChevronRight, Info, X, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import clsx from 'clsx';
import { MintInfoModal } from '../components/home/MintInfoModal';

interface MintApiInfo {
  name?: string;
  description?: string;
  icon_url?: string;
  nuts?: Record<string, any>;
}

interface MintApiResult {
  id: number;
  url: string;
  info: string | null;
  parsedInfo?: MintApiInfo;
}

export default function DiscoverMints() {
  const [mints, setMints] = useState<MintApiResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const itemsPerPage = 12;
  const [selectedMint, setSelectedMint] = useState<MintApiResult | null>(null);
  const [actionMintUrl, setActionMintUrl] = useState<string | null>(null);

  const { addMint, removeMint, loading: isAdding } = useMints();
  const { mintBalances } = useWalletStore();

  useEffect(() => {
    const fetchMints = async () => {
      try {
        const res = await fetch('https://api.audit.8333.space/mints/?skip=0&limit=1000');
        if (!res.ok) throw new Error('Failed to fetch mints');
        const data: MintApiResult[] = await res.json();

        // Parse the inner JSON strings
        const parsedData = data.map(m => {
          let parsedInfo: MintApiInfo | undefined;
          if (m.info) {
            try {
              parsedInfo = JSON.parse(m.info);
            } catch (e) {
              console.warn(`Failed to parse info for ${m.url}`);
            }
          }
          return { ...m, parsedInfo };
        });

        // Filter out mints that don't look valid (missing name/pubkey usually means broken info)
        // or just sort them to show the ones with proper names first
        parsedData.sort((a, b) => {
          const aName = a.parsedInfo?.name || '';
          const bName = b.parsedInfo?.name || '';
          if (aName && !bName) return -1;
          if (!aName && bName) return 1;
          return aName.localeCompare(bName);
        });

        setMints(parsedData);
      } catch (e: any) {
        toast.error('Could not load mint registry: ' + e.message);
      } finally {
        setLoading(false);
      }
    };

    fetchMints();
  }, []);

  const handleAddMint = async (url: string) => {
    if (isAdding) return;
    setActionMintUrl(url);
    await addMint(url);
    setActionMintUrl(null);
  };

  const handleRemoveMint = async (url: string) => {
    if (isAdding) return;
    setActionMintUrl(url);
    await removeMint(url);
    setActionMintUrl(null);
  };

  const isMintAdded = (url: string) => {
    // mintUrls in balances might have trailing slashes or differ slightly, 
    // so we normalize for comparison
    const normalize = (u: string) => u.replace(/\/+$/, '').toLowerCase();
    const normalizedUrl = normalize(url);
    return Object.keys(mintBalances).some(k => normalize(k) === normalizedUrl);
  };

  const filteredMints = mints.filter(m => {
    const term = search.toLowerCase();
    const name = m.parsedInfo?.name?.toLowerCase() || '';
    const desc = m.parsedInfo?.description?.toLowerCase() || '';
    const url = m.url.toLowerCase();
    return name.includes(term) || desc.includes(term) || url.includes(term);
  });

  const totalPages = Math.ceil(filteredMints.length / itemsPerPage);
  const paginatedMints = filteredMints.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  return (
    <main className="flex-1 w-full max-w-[1200px] mx-auto px-container-padding md:px-10 py-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <PageHeader
          title="Discover Mints"
          subtitle="Find and connect to public Cashu mints globally."
        />
        <div className="relative w-full md:w-64 shrink-0">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-on-surface-variant">
            <Search size={18} />
          </div>
          <input
            type="text"
            placeholder="Search mints..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full bg-surface-container-highest border border-outline-variant/30 text-on-surface text-sm rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-16 bg-surface-container-high rounded-xl animate-pulse"></div>
          ))}
        </div>
      ) : filteredMints.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-surface-container-high rounded-2xl border border-outline-variant/20 text-center">
          <div className="w-16 h-16 bg-surface-container-highest rounded-full flex items-center justify-center text-on-surface-variant mb-4">
            <Search size={32} />
          </div>
          <h3 className="text-body-lg font-bold text-on-surface mb-2">No mints found</h3>
          <p className="text-sm text-on-surface-variant max-w-md">
            We couldn't find any mints matching your search term.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {paginatedMints.map(mint => {
            const added = isMintAdded(mint.url);
            const isThisMintActioning = isAdding && actionMintUrl === mint.url;

            return (
              <div
                key={mint.id}
                onClick={() => setSelectedMint(mint)}
                className="flex items-center gap-4 bg-surface-container-high border border-outline-variant/30 rounded-xl p-3 hover:border-primary/30 hover:bg-surface-container-highest transition-all duration-300 shadow-sm cursor-pointer group"
              >
                <div className="flex-shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      added ? handleRemoveMint(mint.url) : handleAddMint(mint.url);
                    }}
                    disabled={isAdding}
                    className={clsx(
                      "bg-surface-container-low w-6 h-6 rounded flex items-center justify-center transition-colors border",
                      isThisMintActioning 
                        ? "border-amber-500 text-amber-500" 
                        : added 
                          ? "bg-amber-500 border-amber-500 text-white" 
                          : "border-outline-variant text-transparent hover:border-amber-500/50",
                      isAdding && !isThisMintActioning && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {isThisMintActioning ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Check size={16} className={clsx("transition-opacity", added ? "opacity-100" : "opacity-0")} />
                    )}
                  </button>
                </div>

                <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-surface-container-highest flex items-center justify-center border border-outline-variant/20">
                  {mint.parsedInfo?.icon_url ? (
                    <img
                      src={mint.parsedInfo.icon_url}
                      alt={mint.parsedInfo.name || 'Mint'}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Fallback to icon if image fails to load
                        (e.target as HTMLImageElement).style.display = 'none';
                        (e.target as HTMLImageElement).parentElement?.classList.add('fallback-icon');
                      }}
                    />
                  ) : (
                    <Server size={20} className="text-primary/70" />
                  )}
                  <Server size={20} className="text-primary/70 hidden fallback-icon-svg absolute" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-on-surface truncate">
                    {mint.parsedInfo?.name || 'Unnamed Mint'}
                  </div>
                  <div className="text-xs text-on-surface-variant truncate">
                    {new URL(mint.url).hostname}
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedMint(mint);
                  }}
                  className="p-2 text-on-surface-variant hover:text-primary transition-colors shrink-0"
                >
                  <Info size={20} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-8 pb-8">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 rounded-xl border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={20} className="text-on-surface" />
          </button>
          <span className="text-sm font-medium text-on-surface-variant">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-2 rounded-xl border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight size={20} className="text-on-surface" />
          </button>
        </div>
      )}

      {selectedMint && (
        <MintInfoModal
          mintUrl={selectedMint.url}
          onClose={() => setSelectedMint(null)}
        />
      )}
    </main>
  );
}
