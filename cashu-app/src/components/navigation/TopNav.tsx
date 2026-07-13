import { Link } from 'react-router-dom';
import { Clock, Settings as SettingsIcon } from 'lucide-react';

export const TopNav = () => {
  return (
    <header style={{ paddingTop: 'env(safe-area-inset-top)' }} className="bg-background/80 backdrop-blur-xl docked full-width top-0 z-40 sticky border-b border-outline-variant/10">
      <div className="flex justify-between items-center w-full px-container-padding py-base max-w-[1200px] mx-auto h-14 md:h-16 relative">
        <div className="flex items-center gap-3">
          <img alt="BitNotes Logo" className="w-8 h-8 rounded-full border border-outline-variant/30 shadow-sm object-cover" src="/logo.png"/>
          <span className="text-headline-lg-mobile font-headline-lg-mobile text-primary tracking-tighter hidden sm:block">BitNotes</span>
        </div>

        <div className="flex items-center gap-1">
          <Link 
            to="/settings" 
            className="p-2.5 text-on-surface-variant hover:text-primary transition-colors active:scale-95 duration-200 rounded-full hover:bg-surface-container-high"
          >
            <SettingsIcon size={20} />
          </Link>
          <Link 
            to="/history" 
            className="p-2.5 text-on-surface-variant hover:text-primary transition-colors active:scale-95 duration-200 rounded-full hover:bg-surface-container-high"
          >
            <Clock size={20} />
          </Link>
        </div>
      </div>
    </header>
  );
};
