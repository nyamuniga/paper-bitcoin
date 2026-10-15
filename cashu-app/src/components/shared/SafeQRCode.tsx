import React from 'react';
import QRCode from 'react-qr-code';
import { AlertCircle, QrCode as QrIcon } from 'lucide-react';

interface SafeQRCodeProps {
  value: string;
  size?: number;
  className?: string;
  fallbackText?: string;
}

interface SafeQRCodeState {
  hasError: boolean;
  error?: Error;
}

class SafeQRCodeBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  SafeQRCodeState
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): SafeQRCodeState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.warn("SafeQRCode caught rendering error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex flex-col items-center justify-center p-4 text-center text-on-surface-variant max-w-[200px]">
          <AlertCircle className="w-8 h-8 text-amber-400 mb-2" />
          <p className="text-[12px] font-bold text-on-surface">Data too large for QR</p>
          <p className="text-[10px] text-on-surface-variant/80 mt-1">Please copy the token text below</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export const SafeQRCode: React.FC<SafeQRCodeProps> = ({ 
  value, 
  size = 180, 
  className,
  fallbackText = "Use the Copy button below to share this token" 
}) => {
  // Hard safety check: QR code Version 40 binary maximum is 2,953 bytes (23,648 bits).
  // Any string exceeding 2,000 bytes will cause a code length overflow error in react-qr-code.
  const byteLength = typeof value === 'string' ? new Blob([value]).size : 0;
  
  if (!value || byteLength > 2000) {
    return (
      <div 
        style={{ width: size, height: size }}
        className={`flex flex-col items-center justify-center p-3 text-center bg-surface-container-lowest/60 rounded-xl border border-outline-variant/30 ${className || ''}`}
      >
        <QrIcon className="w-8 h-8 text-primary/60 mb-2" />
        <p className="text-[12px] font-bold text-on-surface">Data too large for QR</p>
        <p className="text-[10px] text-on-surface-variant/80 mt-1 leading-tight">{fallbackText}</p>
      </div>
    );
  }

  return (
    <SafeQRCodeBoundary
      fallback={
        <div 
          style={{ width: size, height: size }}
          className={`flex flex-col items-center justify-center p-3 text-center bg-surface-container-lowest/60 rounded-xl border border-outline-variant/30 ${className || ''}`}
        >
          <AlertCircle className="w-8 h-8 text-amber-400 mb-2" />
          <p className="text-[12px] font-bold text-on-surface">QR Code Unavailable</p>
          <p className="text-[10px] text-on-surface-variant/80 mt-1 leading-tight">{fallbackText}</p>
        </div>
      }
    >
      <QRCode value={value} size={size} className={className} />
    </SafeQRCodeBoundary>
  );
};
