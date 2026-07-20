import * as secp from '@noble/secp256k1';
import { Buffer } from 'buffer';

const BOLTZ_API_URL = "https://boltz.exchange/api";

export interface SubmarineSwapResponse {
  id: string;
  address: string;
  expectedAmount: number;
  bip21: string;
  timeoutBlockHeight: number;
  refundPublicKey?: string;
  refundPrivateKey?: string;
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
    } catch(e) {}
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
    refundPrivateKey
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
