import { MomoTransferView } from './MomoTransferView';
import type { MomoTransferViewProps } from './MomoTransferView';

type MomoTransferScreenProps = Omit<MomoTransferViewProps, 'page'>;

export function MomoTransferScreen(props: MomoTransferScreenProps) {
  return <MomoTransferView {...props} page />;
}
