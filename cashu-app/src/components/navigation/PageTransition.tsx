import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const ROUTE_RANKS: Record<string, number> = {
  '/': 0,
  '/issue': 1,
  '/scan': 2,
  '/mints': 3,
  '/discover': 3.5,
  '/history': 4,
  '/settings': 5,
  '/pay': 6,
};

type TransitionDirection = 'forward' | 'backward' | 'lift';

interface PageTransitionProps {
  children: React.ReactNode;
}

export const PageTransition: React.FC<PageTransitionProps> = ({ children }) => {
  const location = useLocation();
  const navigationType = useNavigationType();
  const prevPathRef = useRef<string | null>(null);

  let direction: TransitionDirection = 'lift';

  if (prevPathRef.current !== null && prevPathRef.current !== location.pathname) {
    const prevRank = ROUTE_RANKS[prevPathRef.current];
    const currentRank = ROUTE_RANKS[location.pathname];

    if (navigationType === 'POP') {
      direction = 'backward';
    } else if (prevRank !== undefined && currentRank !== undefined) {
      if (currentRank > prevRank) {
        direction = 'forward';
      } else if (currentRank < prevRank) {
        direction = 'backward';
      } else {
        direction = 'lift';
      }
    } else {
      direction = 'lift';
    }
  }

  useEffect(() => {
    if (prevPathRef.current !== location.pathname) {
      window.scrollTo(0, 0);
      prevPathRef.current = location.pathname;
    }
  }, [location.pathname]);

  const animationClass =
    direction === 'forward'
      ? 'animate-page-forward'
      : direction === 'backward'
      ? 'animate-page-backward'
      : 'animate-page-lift';

  return (
    <div
      key={location.pathname}
      className={`w-full flex-1 flex flex-col ${animationClass}`}
      style={{ overflowX: 'clip' }}
    >
      {children}
    </div>
  );
};
