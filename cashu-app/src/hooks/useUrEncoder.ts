import { useState, useEffect, useMemo } from 'react';
import { UR, UREncoder } from '@ngraveio/bc-ur';
import { Buffer } from 'buffer';

export function useUrEncoder(dataStr: string | null, fragmentSize: number = 150, intervalMs: number = 600) {
  // If dataStr is small enough to fit comfortably in a standard static QR code,
  // do not fragment it. Standard Cashu wallets scan cashuA/cashuB tokens directly.
  const isTooLargeForStatic = !!dataStr && dataStr.length > 800;

  const encoder = useMemo(() => {
    if (!dataStr || !isTooLargeForStatic) return null;
    try {
      const buffer = Buffer.from(dataStr, 'utf-8');
      const ur = UR.fromBuffer(buffer);
      return new UREncoder(ur, fragmentSize);
    } catch (e) {
      console.error("UR Encoder initialization failed:", e);
      return null;
    }
  }, [dataStr, fragmentSize, isTooLargeForStatic]);

  // Synchronously initialize the first frame so it is NEVER empty on initial render
  const [currentFrame, setCurrentFrame] = useState<string>(() => {
    if (!dataStr) return '';
    if (!isTooLargeForStatic) return dataStr;
    return '';
  });

  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (!isTooLargeForStatic) {
      setCurrentFrame(dataStr || '');
      setFrameIndex(0);
      return;
    }

    if (!encoder) {
      setCurrentFrame('');
      setFrameIndex(0);
      return;
    }

    try {
      setCurrentFrame(encoder.nextPart());
      setFrameIndex(0);
    } catch (e) {
      console.error("Failed to get initial UR part in effect:", e);
    }

    const tick = () => {
      try {
        setCurrentFrame(encoder.nextPart());
        setFrameIndex(prev => prev + 1);
      } catch (e) {
        console.error("Failed to get next UR part in tick:", e);
      }
    };

    const interval = setInterval(tick, intervalMs);
    return () => clearInterval(interval);
  }, [encoder, intervalMs, dataStr, isTooLargeForStatic]);

  const totalFrames = encoder ? (encoder as any).fragmentsLength || 1 : 1;
  const isAnimated = isTooLargeForStatic && totalFrames > 1;

  return {
    currentFrame,
    isAnimated,
    currentFrameIndex: frameIndex % totalFrames,
    totalFrames
  };
}
