import React from 'react';
import { Link } from 'react-router-dom';

interface PendingTxAlertProps {
  pendingTxs: number;
}

export const PendingTxAlert: React.FC<PendingTxAlertProps> = ({ pendingTxs }) => {
  if (pendingTxs <= 0) return null;

  return (
    <div className="bg-primary/10 border border-primary/30 text-primary p-4 rounded-xl mb-2 flex justify-between items-center shadow-lg">
      <div>
        <div className="font-bold">Pending Transactions</div>
        <div className="text-sm opacity-90">You have {pendingTxs} pending transaction(s).</div>
      </div>
      <Link to="/history" className="bg-primary/20 px-4 py-2 rounded-lg text-sm font-bold hover:bg-primary/30 transition-colors">
        Check Status
      </Link>
    </div>
  );
};
