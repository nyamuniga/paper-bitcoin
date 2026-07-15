import { useState, useEffect, useMemo } from 'react';
import { UR, UREncoder } from '@ngraveio/bc-ur';
import { Buffer } from 'buffer';

export function useUrEncoder(dataStr: string | null, fragmentSize: number = 150, intervalMs: number = 600) {
  const [currentFrame, setCurrentFrame] = useState('');
  const [frameIndex, setFrameIndex] = useState(0);

  const encoder = useMemo(() => {
    if (!dataStr) return null;
    try {
      const buffer = Buffer.from(dataStr, 'utf-8');
      const ur = UR.fromBuffer(buffer);
      return new UREncoder(ur, fragmentSize);
    } catch (e) {
      console.error("UR Encoder initialization failed:", e);
      return null;
    }
  }, [dataStr, fragmentSize]);

  useEffect(() => {
    if (!encoder) {
      setCurrentFrame('');
      return;
    }

    const tick = () => {
      try {
        setCurrentFrame(encoder.nextPart());
        setFrameIndex(prev => prev + 1);
      } catch (e) {
        console.error("Failed to get next UR part:", e);
      }
    };

    tick(); // immediate first frame
    const interval = setInterval(tick, intervalMs);
    
    return () => clearInterval(interval);
  }, [encoder, intervalMs]);

  // The actual number of base fragments
  const totalFrames = encoder ? (encoder as any).fragmentsLength || 1 : 1;

  return {
    currentFrame,
    isAnimated: totalFrames > 1,
    // Fountain codes repeat infinitely, so frameIndex isn't strictly 1-to-M,
    // but for UI progress we can modulo the total base fragments.
    currentFrameIndex: frameIndex % totalFrames,
    totalFrames
  };
}
