export const getMempoolTxUrl = (txid: string) => `https://mempool.space/tx/${txid}`;
export const getMempoolAddressUrl = (address: string) => `https://mempool.space/address/${address}`;

export const openMempoolTx = async (txid: string) => {
  const url = getMempoolTxUrl(txid);
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};

export const openMempoolAddress = async (address: string) => {
  const url = getMempoolAddressUrl(address);
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};
