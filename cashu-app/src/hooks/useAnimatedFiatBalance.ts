import { useEffect, useRef, useState } from 'react';
import { useCurrencyStore } from '../store/currencyStore';

export function useAnimatedFiatBalance(balance: number) {
  const preferredCurrency = useCurrencyStore((s) => s.preferredCurrency);
  const rates = useCurrencyStore((s) => s.rates);
  const fetchRates = useCurrencyStore((s) => s.fetchRates);
  const convert = useCurrencyStore((s) => s.convert);
  const getCurrencyMeta = useCurrencyStore((s) => s.getCurrencyMeta);
  const currentMeta = getCurrencyMeta(preferredCurrency);

  const [isInitialLoadingRate, setIsInitialLoadingRate] = useState<boolean>(true);
  const targetFiatValue = convert(balance).value;

  const [displayedFiatValue, setDisplayedFiatValue] = useState<number | null>(() => targetFiatValue || null);
  const [isNumberAnimating, setIsNumberAnimating] = useState<boolean>(false);
  const currentDisplayRef = useRef<number | null>(displayedFiatValue);
  const prevCurrencyRef = useRef<string>(preferredCurrency);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    let isMounted = true;
    const poll = async (isInitial = false) => {
      if (!isInitial && typeof document !== 'undefined' && document.hidden) return;
      try {
        await fetchRates();
      } catch (e) {
        console.error('Failed to fetch exchange rates', e);
      } finally {
        if (isMounted && isInitial) {
          setIsInitialLoadingRate(false);
        }
      }
    };

    poll(true);
    const interval = setInterval(() => poll(false), 60000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [fetchRates]);

  useEffect(() => {
    if (targetFiatValue === null || isNaN(targetFiatValue)) return;

    if (prevCurrencyRef.current !== preferredCurrency) {
      prevCurrencyRef.current = preferredCurrency;
      setDisplayedFiatValue(targetFiatValue);
      currentDisplayRef.current = targetFiatValue;
      return;
    }

    const startVal = currentDisplayRef.current !== null ? currentDisplayRef.current : 0;
    const endVal = targetFiatValue;

    if (startVal === endVal && currentDisplayRef.current !== null) {
      return;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    setIsNumberAnimating(true);
    const startTime = performance.now();
    const duration = 650;
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const step = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);

      const nextVal =
        currentMeta.decimals === 0
          ? Math.round(startVal + (endVal - startVal) * eased)
          : Number((startVal + (endVal - startVal) * eased).toFixed(currentMeta.decimals));

      setDisplayedFiatValue(nextVal);
      currentDisplayRef.current = nextVal;

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(step);
      } else {
        setDisplayedFiatValue(endVal);
        currentDisplayRef.current = endVal;
        setIsNumberAnimating(false);
        animationFrameRef.current = null;
      }
    };

    animationFrameRef.current = requestAnimationFrame(step);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [targetFiatValue, preferredCurrency, currentMeta.decimals]);

  const formatFiatValue = (val: number | null) => {
    if (val === null || isNaN(val)) return `••• ${currentMeta.code}`;
    const formattedNum =
      currentMeta.decimals === 0
        ? Math.round(val).toLocaleString()
        : val.toLocaleString(undefined, {
            minimumFractionDigits: currentMeta.decimals,
            maximumFractionDigits: currentMeta.decimals,
          });
    return currentMeta.symbol !== currentMeta.code
      ? `${currentMeta.symbol}${formattedNum} ${currentMeta.code}`
      : `${formattedNum} ${currentMeta.code}`;
  };

  return {
    preferredCurrency,
    rates,
    currentMeta,
    isInitialLoadingRate,
    targetFiatValue,
    displayedFiatValue,
    isNumberAnimating,
    formatFiatValue,
  };
}
