import { useState, useCallback, useRef } from 'react';
import { URDecoder } from '@ngraveio/bc-ur';

export function useUrDecoder() {
  const [progress, setProgress] = useState(0);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decoderRef = useRef(new URDecoder());

  const reset = useCallback(() => {
    decoderRef.current = new URDecoder();
    setProgress(0);
    setIsSuccess(false);
    setError(null);
  }, []);

  const receivePart = useCallback((part: string): string | null => {
    if (isSuccess || error) return null;

    try {
      decoderRef.current.receivePart(part);
      
      if (decoderRef.current.isComplete()) {
        if (decoderRef.current.isSuccess()) {
          setIsSuccess(true);
          const ur = decoderRef.current.resultUR();
          // Extract buffer and convert to utf-8 string
          const buffer = ur.decodeCBOR();
          return buffer.toString('utf-8');
        } else {
          const err = decoderRef.current.resultError();
          setError(err ? err.toString() : 'UR decoding failed');
          return null;
        }
      } else {
        setProgress(decoderRef.current.estimatedPercentComplete());
        return null;
      }
    } catch (e: any) {
      setError(e.message || 'Error processing UR part');
      return null;
    }
  }, [isSuccess, error]);

  return {
    receivePart,
    progress,
    isSuccess,
    error,
    reset,
    // We can expose the raw decoder if we need it, but the state should be enough
    decoder: decoderRef.current
  };
}
