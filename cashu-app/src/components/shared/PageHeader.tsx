import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  rightAction?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, rightAction }) => {
  const navigate = useNavigate();

  return (
    <div className="flex items-center gap-3 md:gap-4 mb-6">
      <button
        onClick={() => navigate(-1)}
        className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface hover:bg-surface-container-highest active:scale-95 transition-all duration-200 border border-outline-variant/10 flex-shrink-0"
      >
        <ArrowLeft size={20} />
      </button>
      <div className="flex-1 min-w-0">
        <h1 className="text-headline-lg-mobile md:text-headline-lg font-headline-lg-mobile md:font-headline-lg text-on-surface truncate">{title}</h1>
        {subtitle && <p className="text-on-surface-variant text-body-md font-body-md text-[14px] truncate">{subtitle}</p>}
      </div>
      {rightAction && <div className="flex-shrink-0">{rightAction}</div>}
    </div>
  );
};
