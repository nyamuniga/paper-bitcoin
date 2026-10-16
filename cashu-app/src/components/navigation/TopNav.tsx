import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Clock, Settings as SettingsIcon, Landmark } from 'lucide-react';
import { useWalletStore } from '../../store/wallet';

interface NavTabItem {
  path: string;
  label: string;
  badge?: boolean;
  match: (pathname: string) => boolean;
}

const DESKTOP_TABS: NavTabItem[] = [
  { path: '/', label: 'Wallet', match: (p) => p === '/' },
  { path: '/issue', label: 'Issue', match: (p) => p === '/issue' },
  { path: '/scan', label: 'Scan', match: (p) => p === '/scan' },
  { path: '/mints', label: 'Mints', match: (p) => p === '/mints' || p === '/discover' },
  { path: '/history', label: 'History', badge: true, match: (p) => p === '/history' },
  { path: '/settings', label: 'Settings', match: (p) => p === '/settings' },
];

interface MobileTabItem {
  path: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  badge?: boolean;
  match: (pathname: string) => boolean;
}

const MOBILE_TABS: MobileTabItem[] = [
  { path: '/mints', icon: Landmark, title: 'Trusted Mints', match: (p) => p === '/mints' || p === '/discover' },
  { path: '/history', icon: Clock, title: 'History', badge: true, match: (p) => p === '/history' },
  { path: '/settings', icon: SettingsIcon, title: 'Settings', match: (p) => p === '/settings' },
];

export const TopNav = () => {
  const location = useLocation();
  const hasUnreadTxs = useWalletStore((s) => s.hasUnreadTxs);
  const markHistorySeen = useWalletStore((s) => s.markHistorySeen);

  useEffect(() => {
    if (location.pathname === '/history') {
      markHistorySeen();
    }
  }, [location.pathname, markHistorySeen]);

  // Desktop active pill indicator
  const navRef = useRef<HTMLElement | null>(null);
  const desktopTabRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [desktopPillStyle, setDesktopPillStyle] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    opacity: 0,
  });

  // Mobile active pill indicator
  const mobileNavRef = useRef<HTMLElement | null>(null);
  const mobileTabRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [mobilePillStyle, setMobilePillStyle] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    opacity: 0,
  });

  const [isInitialMount, setIsInitialMount] = useState(true);

  const updateDesktopPill = () => {
    const activeTab = DESKTOP_TABS.find((t) => t.match(location.pathname));
    if (activeTab && desktopTabRefs.current[activeTab.path] && navRef.current) {
      const el = desktopTabRefs.current[activeTab.path]!;
      setDesktopPillStyle({
        left: el.offsetLeft,
        top: el.offsetTop,
        width: el.offsetWidth,
        height: el.offsetHeight,
        opacity: 1,
      });
    } else {
      setDesktopPillStyle((prev) => ({ ...prev, opacity: 0 }));
    }
  };

  const updateMobilePill = () => {
    const activeTab = MOBILE_TABS.find((t) => t.match(location.pathname));
    if (activeTab && mobileTabRefs.current[activeTab.path] && mobileNavRef.current) {
      const el = mobileTabRefs.current[activeTab.path]!;
      setMobilePillStyle({
        left: el.offsetLeft,
        top: el.offsetTop,
        width: el.offsetWidth,
        height: el.offsetHeight,
        opacity: 1,
      });
    } else {
      setMobilePillStyle((prev) => ({ ...prev, opacity: 0 }));
    }
  };

  useLayoutEffect(() => {
    updateDesktopPill();
    updateMobilePill();
    const timer = setTimeout(() => {
      setIsInitialMount(false);
    }, 50);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  useEffect(() => {
    const handleResize = () => {
      updateDesktopPill();
      updateMobilePill();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [location.pathname]);

  return (
    <header 
      style={{ paddingTop: 'env(safe-area-inset-top)' }} 
      className="bg-background top-0 left-0 w-full z-40 sticky"
    >
      <div className="flex justify-between items-center w-full px-4 sm:px-6 md:px-8 max-w-[1200px] mx-auto h-16 relative">
        <Link
          to="/"
          className="group hover:opacity-90 active:scale-95 transition-all duration-200 flex items-center gap-3"
          title="BitNotes Home"
        >
          <div className="relative w-11 h-11 flex items-center justify-center flex-shrink-0">
            <div className="absolute inset-0 rounded-full bg-[#f2a93b]/15 blur-md pointer-events-none group-hover:bg-[#f2a93b]/30 transition-all"></div>
            <img
              alt="BitNotes"
              className="w-full h-full object-contain relative z-10 drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
              src="/logo.png"
            />
          </div>
          <span className="font-display-hero text-lg font-bold text-[#f7f4eb] tracking-tight hidden sm:inline">
            BitNotes
          </span>
        </Link>

        {/* Desktop Navigation with Animated Sliding Indicator Pill */}
        <nav 
          ref={navRef}
          className="hidden md:flex items-center gap-1.5 bg-[#0c1b14] border border-[#142d20] rounded-full p-1 shadow-sm relative overflow-hidden"
        >
          {/* Sliding Indicator Pill */}
          <div
            className={`absolute top-0 left-0 rounded-full pointer-events-none bg-[#183626] border border-[#2b563e] shadow-sm ${
              isInitialMount
                ? ''
                : 'transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]'
            }`}
            style={{
              transform: `translate3d(${desktopPillStyle.left}px, ${desktopPillStyle.top}px, 0)`,
              width: `${desktopPillStyle.width}px`,
              height: `${desktopPillStyle.height}px`,
              opacity: desktopPillStyle.opacity,
            }}
          >
            {/* Subtle botanical amber highlight along top border */}
            <div className="absolute inset-x-2 top-0 h-[1px] bg-gradient-to-r from-transparent via-[#f2a93b]/40 to-transparent rounded-full pointer-events-none" />
          </div>

          {DESKTOP_TABS.map((tab) => {
            const isActive = tab.match(location.pathname);
            return (
              <Link
                key={tab.path}
                to={tab.path}
                ref={(el) => {
                  desktopTabRefs.current[tab.path] = el;
                }}
                className={`relative z-10 px-3.5 py-1.5 rounded-full text-xs font-semibold font-display-hero transition-colors duration-200 select-none ${
                  isActive
                    ? 'text-primary'
                    : 'text-[#8b9e94] hover:text-[#f7f4eb] hover:bg-[#12261d]/50'
                }`}
              >
                {tab.label}
                {tab.badge && hasUnreadTxs && (
                  <span className="inline-block w-1.5 h-1.5 bg-primary rounded-full ml-1.5 align-middle animate-pulse" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Mobile Navigation with Animated Sliding Indicator Pill */}
        <nav 
          ref={mobileNavRef}
          className="flex md:hidden items-center gap-1 bg-[#0c1b14] border border-[#142d20] rounded-full p-1 shadow-sm relative overflow-hidden"
        >
          {/* Sliding Mobile Indicator Pill */}
          <div
            className={`absolute top-0 left-0 rounded-full pointer-events-none bg-[#183626] border border-[#2b563e] shadow-sm ${
              isInitialMount
                ? ''
                : 'transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]'
            }`}
            style={{
              transform: `translate3d(${mobilePillStyle.left}px, ${mobilePillStyle.top}px, 0)`,
              width: `${mobilePillStyle.width}px`,
              height: `${mobilePillStyle.height}px`,
              opacity: mobilePillStyle.opacity,
            }}
          >
            <div className="absolute inset-x-1.5 top-0 h-[1px] bg-gradient-to-r from-transparent via-[#f2a93b]/40 to-transparent rounded-full pointer-events-none" />
          </div>

          {MOBILE_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.match(location.pathname);
            return (
              <Link
                key={tab.path}
                to={tab.path}
                ref={(el) => {
                  mobileTabRefs.current[tab.path] = el;
                }}
                className={`relative z-10 p-2 transition-colors duration-200 active:scale-95 rounded-full ${
                  isActive
                    ? 'text-primary'
                    : 'text-[#8b9e94] hover:text-primary hover:bg-[#12261d]/50'
                }`}
                title={tab.title}
              >
                <Icon className="w-[20px] h-[20px]" strokeWidth={1.75} />
                {tab.badge && hasUnreadTxs && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full shadow-[0_0_8px_rgba(242,169,59,0.9)]" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
};

