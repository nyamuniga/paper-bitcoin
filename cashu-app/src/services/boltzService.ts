import * as secp from '@noble/secp256k1';
import { Buffer } from 'buffer';
import { BOLTZ_API_URL, MEMPOOL_API_URL } from '../constants.local';

export interface SubmarineSwapResponse {
  id: string;
  address: string;
  expectedAmount: number;
  bip21: string;
  timeoutBlockHeight: number;
  refundPublicKey?: string;
  refundPrivateKey?: string;
  redeemScript?: string;
}

export const createSubmarineSwap = async (invoice: string): Promise<SubmarineSwapResponse> => {
  // Generate random keys for refund (non-custodial safety)
  const privKey = secp.utils.randomSecretKey();
  const pubKey = secp.getPublicKey(privKey, true); // true for compressed

  const refundPrivateKey = Buffer.from(privKey).toString('hex');
  const refundPublicKey = Buffer.from(pubKey).toString('hex');

  const payload = {
    type: "submarine",
    pairId: "BTC/BTC",
    orderSide: "buy",
    invoice,
    refundPublicKey,
  };

  const response = await window.fetch(`${BOLTZ_API_URL}/createswap`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    let errMessage = "Unknown error from Boltz";
    try {
      const errorData = await response.json();
      if (errorData.error) errMessage = errorData.error;
    } catch (e) { }
    throw new Error(`Boltz API Error: ${errMessage}`);
  }

  const data = await response.json();

  return {
    id: data.id,
    address: data.address,
    expectedAmount: data.expectedAmount,
    bip21: data.bip21,
    timeoutBlockHeight: data.timeoutBlockHeight,
    refundPublicKey,
    refundPrivateKey,
    redeemScript: data.redeemScript
  };
};

export const getSwapStatus = async (swapId: string): Promise<{ status: string }> => {
  const payload = {
    id: swapId
  };

  const response = await window.fetch(`${BOLTZ_API_URL}/swapstatus`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error("Failed to get swap status from Boltz");
  }

  const data = await response.json();
  return { status: data.status };
};

export interface BoltzPair {
  rate: number;
  limits: {
    maximal: number;
    minimal: number;
    maximalZeroConf: {
      baseAsset: number;
      quoteAsset: number;
    }
  };
  fees: {
    percentage: number;
    percentageSwapIn: number;
    minerFees: {
      baseAsset: {
        normal: number;
        reverse: {
          claim: number;
          lockup: number;
        }
      };
      quoteAsset: {
        normal: number;
        reverse: {
          claim: number;
          lockup: number;
        }
      };
    }
  }
}

export const getBoltzPair = async (pairId: string = "BTC/BTC"): Promise<BoltzPair> => {
  const response = await window.fetch(`${BOLTZ_API_URL}/getpairs`);
  if (!response.ok) {
    throw new Error("Failed to get pairs from Boltz");
  }
  const data = await response.json();
  const pair = data.pairs?.[pairId];
  if (!pair) {
    throw new Error(`Pair ${pairId} not found on Boltz`);
  }
  return pair as BoltzPair;
};

export const getUtxos = async (address: string): Promise<any[]> => {
  const res = await window.fetch(`${MEMPOOL_API_URL}/address/${address}/utxo`);
  if (!res.ok) throw new Error("Failed to fetch UTXOs");
  return res.json();
};

export const getFeeEstimates = async (): Promise<any> => {
  const res = await window.fetch(`${MEMPOOL_API_URL}/v1/fees/recommended`);
  if (!res.ok) throw new Error("Failed to fetch fee estimates");
  return res.json();
};

export const broadcastTransaction = async (txHex: string): Promise<string> => {
  const res = await window.fetch(`${MEMPOOL_API_URL}/tx`, {
    method: 'POST',
    body: txHex
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to broadcast: ${errText}`);
  }
  return res.text(); // txid
};

export const refundSwap = async (
  boltzSwapId: string,
  refundPrivateKeyHex: string,
  redeemScriptHex: string,
  timeoutBlockHeight: number,
  swapAddress: string,
  destinationAddress: string
): Promise<string> => {
  const boltz = await import('boltz-core');

  // 1. Check swap status to prevent malicious refunds
  const { status } = await getSwapStatus(boltzSwapId);
  if (status === 'invoice.paid' || status === 'transaction.claimed') {
    throw new Error("Cannot refund: Swap already succeeded and was claimed by Boltz.");
  }
  if (status === 'transaction.refunded') {
    throw new Error("Swap has already been refunded.");
  }

  // 2. Fetch UTXOs from Mempool API
  const utxosData = await getUtxos(swapAddress);
  if (utxosData.length === 0) {
    throw new Error("No unspent funds found for this swap on the blockchain.");
  }

  // 3. Format UTXOs for boltz-core
  const utxos = utxosData.map(u => ({
    transactionId: u.txid,
    vout: u.vout,
    amount: BigInt(u.value),
    type: boltz.OutputType.Compatibility as any, // Submarine swaps in Boltz v1 generally use P2SH-P2WSH
    privateKey: Buffer.from(refundPrivateKeyHex, 'hex'),
    redeemScript: Buffer.from(redeemScriptHex, 'hex'),
    script: boltz.Scripts.p2shP2wshOutput(Buffer.from(redeemScriptHex, 'hex')),
  }));

  // 4. Determine fees (e.g., using fastest recommended fee)
  const fees = await getFeeEstimates();
  const feeRate = fees.fastestFee || 10;

  // Boltz core fee calculation or hardcode roughly 200 bytes for a refund tx
  const estimatedTxSize = 250;
  const feeSats = BigInt(feeRate * estimatedTxSize);

  // 5. Construct destination script from address
  let destinationScript: Uint8Array;
  try {
    const btc = await import('@scure/btc-signer');
    // Try to determine output script based on network
    // cashu-app might be on mainnet
    const decoded: any = btc.Address().decode(destinationAddress);

    if (decoded.type === 'wpkh') destinationScript = boltz.Scripts.p2wpkhOutput(decoded.hash);
    else if (decoded.type === 'wsh') destinationScript = boltz.Scripts.p2wshOutput(decoded.hash);
    else if (decoded.type === 'tr') destinationScript = boltz.Scripts.p2trOutput(decoded.hash);
    else if (decoded.type === 'pkh') destinationScript = boltz.Scripts.p2pkhOutput(decoded.hash);
    else if (decoded.type === 'sh') destinationScript = boltz.Scripts.p2shOutput(decoded.hash);
    else throw new Error("Unsupported address type");
  } catch (e: any) {
    throw new Error(`Invalid destination address: ${e.message}`);
  }

  // 6. Construct Refund Transaction
  const tx = boltz.constructRefundTransaction(
    utxos,
    destinationScript,
    timeoutBlockHeight,
    feeSats,
    true // isRbf
  );

  const txHex = tx.hex;

  // 7. Broadcast
  const txid = await broadcastTransaction(txHex);
  return txid;
};
