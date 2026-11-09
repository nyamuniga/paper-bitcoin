import type { Transaction } from '../components/history/TransactionCard';
import type { EcashInvoiceSummary } from './savedEcashInvoices';

/** A paid request becomes its receipt; pending requests take part in the same activity feed. */
export function mergeEcashRequests(transactions: Transaction[], requests: EcashInvoiceSummary[]): Transaction[] {
  const receipted = new Set(transactions.filter(tx => tx.status === 'Success')
    .map(tx => tx.tx_type.ReceiveEcash?.invoice_id).filter(Boolean));
  const pending = requests.filter(request => !receipted.has(request.id)).map(request => ({
    id: `ecash-request:${request.id}`,
    tx_type: {EcashRequest: request},
    amount: request.amount,
    fee: 0,
    status: request.status === 'paid' ? 'Success' as const : 'Pending' as const,
    timestamp: request.created_at,
    mint_url: request.mint,
  }));
  const requestIds = new Set(requests.map(request => request.id));
  const receipts = transactions.filter(tx => tx.status === 'Success' || !requestIds.has(tx.tx_type.ReceiveEcash?.invoice_id));
  return [...receipts, ...pending].sort((left, right) => right.timestamp - left.timestamp);
}
