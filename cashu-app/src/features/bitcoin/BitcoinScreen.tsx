import { BitcoinPaymentView } from './BitcoinPaymentView';
import type { BitcoinPaymentViewProps } from './BitcoinPaymentView';

type BitcoinScreenProps = Omit<BitcoinPaymentViewProps, 'page'>;

export function BitcoinScreen(props: BitcoinScreenProps) {
  return <BitcoinPaymentView {...props} page />;
}
