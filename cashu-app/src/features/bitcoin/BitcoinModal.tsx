import { BitcoinPaymentView } from './BitcoinPaymentView';
import type { BitcoinPaymentViewProps } from './BitcoinPaymentView';

type BitcoinModalProps = Omit<BitcoinPaymentViewProps, 'page'>;

// Compatibility entry for the mint list: the view redirects to the Bitcoin route.
export function BitcoinModal(props: BitcoinModalProps) {
  return <BitcoinPaymentView {...props} page={false} />;
}
