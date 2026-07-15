import { Link, useLocation } from 'react-router-dom';
import { Wallet, ScanLine, Send, Clock, Settings as SettingsIcon } from 'lucide-react';

export const BottomNav = () => {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path ? 'text-primary' : 'text-on-secondary-container opacity-60';

  return (
    <nav className="md:hidden bg-secondary-container/70 dark:bg-secondary-container/70 docked full-width bottom-0 rounded-t-xl backdrop-blur-xl border-t border-outline-variant/30 shadow-lg fixed left-0 w-full z-50 flex justify-around items-center px-4 pb-6 pt-3">
      <Link to="/" className={`flex flex-col items-center justify-center relative hover:opacity-100 transition-opacity active:scale-90 transition-transform duration-150 group ${isActive('/')}`}>
        {location.pathname === '/' && <div className="absolute -bottom-1 w-1 h-1 bg-primary rounded-full shadow-[0_0_8px_rgba(255,184,116,0.8)]" />}
        <Wallet size={24} className="mb-1 group-hover:scale-110 transition-transform" fill={location.pathname === '/' ? "currentColor" : "none"} strokeWidth={location.pathname === '/' ? 0 : 2} />
        <span className="text-label-caps font-label-caps text-[10px]">Wallet</span>
      </Link>

      <Link to="/history" className={`flex flex-col items-center justify-center relative hover:opacity-100 transition-opacity active:scale-90 transition-transform duration-150 group ${isActive('/history')}`}>
        {location.pathname === '/history' && <div className="absolute -bottom-1 w-1 h-1 bg-primary rounded-full shadow-[0_0_8px_rgba(255,184,116,0.8)]" />}
        <Clock size={24} className="mb-1 group-hover:scale-110 transition-transform" />
        <span className="text-label-caps font-label-caps text-[10px]">History</span>
      </Link>

      <Link to="/scan" className="flex flex-col items-center justify-center -mt-8 relative group">
        <div className="bg-primary w-14 h-14 rounded-full flex items-center justify-center shadow-[0_4px_20px_rgba(255,184,116,0.4)] group-hover:scale-105 transition-transform border-4 border-background">
          <ScanLine size={28} className="text-on-primary" />
        </div>
        <span className={`text-label-caps font-label-caps text-[10px] mt-1 hover:opacity-100 transition-opacity ${isActive('/scan')}`}>Scan</span>
      </Link>

      <Link to="/issue" className={`flex flex-col items-center justify-center relative hover:opacity-100 transition-opacity active:scale-90 transition-transform duration-150 group ${isActive('/issue')}`}>
        {location.pathname === '/issue' && <div className="absolute -bottom-1 w-1 h-1 bg-primary rounded-full shadow-[0_0_8px_rgba(255,184,116,0.8)]" />}
        <Send size={24} className="mb-1 group-hover:scale-110 transition-transform" />
        <span className="text-label-caps font-label-caps text-[10px]">Issue</span>
      </Link>

      <Link to="/settings" className={`flex flex-col items-center justify-center relative hover:opacity-100 transition-opacity active:scale-90 transition-transform duration-150 group ${isActive('/settings')}`}>
        {location.pathname === '/settings' && <div className="absolute -bottom-1 w-1 h-1 bg-primary rounded-full shadow-[0_0_8px_rgba(255,184,116,0.8)]" />}
        <SettingsIcon size={24} className="mb-1 group-hover:scale-110 transition-transform" />
        <span className="text-label-caps font-label-caps text-[10px]">Settings</span>
      </Link>
    </nav>
  );
};
