import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  rightAction?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  sticky?: boolean;
  onBack?: () => void;
  hideBack?: boolean;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  rightAction,
  children,
  className = '',
  sticky = true,
  onBack,
  hideBack = false,
}) => {
  const navigate = useNavigate();

  const stickyStyles = sticky
    ? "sticky top-[calc(4rem+env(safe-area-inset-top,0px))] z-40 bg-[#06110c]/95 backdrop-blur-md -mx-container-padding px-container-padding md:-mx-10 md:px-10 -mt-6 pt-3.5 pb-3 mb-4 transition-all"
    : "mb-4";

  return (
    <div className={`${stickyStyles} ${className}`}>
      <div className="flex items-center gap-3 md:gap-4 w-full">
        {!hideBack && (
          <button
            onClick={onBack || (() => navigate(-1))}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#0c1b14] hover:bg-[#12261d] active:scale-95 transition-all duration-200 border border-[#1e3c2e] flex items-center justify-center text-[#f7f4eb] flex-shrink-0 cursor-pointer shadow-sm"
            aria-label="Go back"
          >
            <ArrowLeft size={18} className="sm:w-5 sm:h-5 text-[#8b9e94] hover:text-[#f7f4eb]" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-[20px] sm:text-[24px] md:text-[28px] font-display-hero font-extrabold text-[#f7f4eb] tracking-tight leading-tight truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[#8b9e94] text-xs sm:text-sm mt-0.5 leading-tight truncate font-normal">
              {subtitle}
            </p>
          )}
        </div>
        {rightAction && <div className="flex-shrink-0">{rightAction}</div>}
      </div>
      {children && <div className="mt-3 w-full">{children}</div>}
    </div>
  );
};
