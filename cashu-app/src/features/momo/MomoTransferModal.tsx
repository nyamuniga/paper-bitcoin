import { MomoTransferView } from './MomoTransferView';
import type { MomoTransferViewProps } from './MomoTransferView';

type MomoTransferModalProps = Omit<MomoTransferViewProps, 'page'>;

export function MomoTransferModal(props: MomoTransferModalProps) {
  return <MomoTransferView {...props} page={false} />;
}
