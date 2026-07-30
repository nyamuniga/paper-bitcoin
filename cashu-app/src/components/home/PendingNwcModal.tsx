import React, { useState } from 'react';
import { X, Check, XCircle, Zap, Loader2, Clock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNwcStore, PendingNwcRequest } from '../../store/nwcStore';

interface PendingNwcModalProps {
  onClose: () => void;
}

export const PendingNwcModal: React.FC<PendingNwcModalProps> = ({ onClose }) => {
  const { pendingRequests, approveRequest, rejectRequest } = useNwcStore();
  const [processingId, setProcessingId] = useState<string | null>(null);

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor(Date.now() / 1000 - timestamp);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const handleApprove = async (req: PendingNwcRequest) => {
    setProcessingId(req.event_id);
    const toastId = toast.loading('Approving Zap...');
    try {
      await approveRequest(req.event_id);
      toast.success('Zap approved and paid!', { id: toastId });
      if (pendingRequests.length === 1) {
        onClose();
      }
    } catch (err: any) {
      toast.error(`Failed to approve Zap: ${err}`, { id: toastId });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (req: PendingNwcRequest) => {
    setProcessingId(req.event_id);
    const toastId = toast.loading('Rejecting Zap...');
    try {
      await rejectRequest(req.event_id);
      toast.success('Zap rejected', { id: toastId });
      if (pendingRequests.length === 1) {
        onClose();
      }
    } catch (err: any) {
      toast.error(`Failed to reject Zap: ${err}`, { id: toastId });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-surface-container-high rounded-2xl w-full max-w-md p-6 relative max-h-[80vh] flex flex-col">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <X size={24} />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="bg-amber-500/20 p-2 rounded-xl text-amber-400">
            <Zap size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-on-surface">Pending Zaps</h2>
            <p className="text-sm text-on-surface-variant">Delayed NWC requests</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4">
          {pendingRequests.length === 0 ? (
            <div className="text-center py-8 text-on-surface-variant">
              No pending zaps.
            </div>
          ) : (
            pendingRequests.map((req) => (
              <div
                key={req.event_id}
                className="bg-surface rounded-xl p-4 border border-outline-variant/30 flex flex-col gap-3"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-2xl font-bold text-on-surface flex items-center gap-1">
                      {Math.floor(req.amount_msats / 1000).toLocaleString()} <span className="text-sm font-normal text-on-surface-variant">sats</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-on-surface-variant mt-1">
                      <Clock size={12} />
                      {formatTimeAgo(req.created_at)}
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => handleReject(req)}
                    disabled={processingId !== null}
                    className="flex-1 bg-surface-container hover:bg-surface-variant text-on-surface rounded-lg py-2 text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {processingId === req.event_id ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                    Reject
                  </button>
                  <button
                    onClick={() => handleApprove(req)}
                    disabled={processingId !== null}
                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-black rounded-lg py-2 text-sm font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {processingId === req.event_id ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    Approve
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
