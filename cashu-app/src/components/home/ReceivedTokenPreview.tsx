import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useUrEncoder } from '../../hooks/useUrEncoder';
import type { ReceivedTokenPreview as TokenPreview } from '../../services/receivedTokenPreview';
import { writeClipboardText } from '../../utils/clipboard';
import { SafeQRCode } from '../shared/SafeQRCode';
import { MintIcon } from '../shared/MintIcon';
import { MintName } from '../shared/MintName';

export function ReceivedTokenPreview({ preview }: { preview: TokenPreview }) {
  const [copied, setCopied] = useState(false);
  const { currentFrame, isAnimated, currentFrameIndex, totalFrames } = useUrEncoder(preview.token, 150, 400);
  const copy = async () => {
    try {
      await writeClipboardText(preview.token);
      setCopied(true);
    } catch { toast.error('Could not copy token'); }
  };
  return <section className="received-token-preview" aria-label="Scanned ecash token">
    <div className="received-token-qr bg-white p-4 rounded-xl self-center relative">
      <SafeQRCode value={currentFrame || preview.token} size={200} />
      {isAnimated && <span className="absolute bottom-1 right-2 text-xs text-black">{currentFrameIndex + 1}/{totalFrames}</span>}
    </div>
    <div className="received-token-meta flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 min-w-0">
        <MintIcon mintUrl={preview.mint} className="w-6 h-6 shrink-0 rounded-full" textClassName="text-primary text-[10px]" />
        <MintName mintUrl={preview.mint} className="text-sm text-on-surface truncate" />
      </div>
      <p className="text-xl text-primary shrink-0">₿{preview.amount.toLocaleString()}</p>
    </div>
    <div className="received-token-text flex items-center gap-2 min-w-0">
      <p className="text-xs font-mono text-on-surface-variant break-all line-clamp-3 select-all flex-1">{preview.token}</p>
      <button type="button" onClick={copy} aria-label={copied ? 'Token copied' : 'Copy token'} title={copied ? 'Copied' : 'Copy token'} className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg text-primary hover:bg-primary/10 cursor-pointer">
        {copied ? <Check size={16} /> : <Copy size={16} />}
      </button>
    </div>
  </section>;
}
