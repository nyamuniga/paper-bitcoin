import { Encryption } from '../utils/encryption';
import { MomoStatus } from '../types/momo';
import { fetch } from '@tauri-apps/plugin-http';

import { MOMO_API_BASE_URL } from '../constants.local';

export const initiateMomoPaymentRequest = async (
  txId: string,
  netSats: number,
  activeTab: string,
  amount: number,
  phoneNumber: string
): Promise<any> => {
  console.log(`[MomoService] Initiating payment for ${amount} RWF to ${phoneNumber}`);

  const targetUrl = `${MOMO_API_BASE_URL}/payment/request/octoba`;

  try {
    const externalId = `payment_${Date.now()}`;
    const requestBody = {
      txId,
      amount: `${amount}`,
      btcamount: activeTab === 'lightning' ? `${netSats}` : '0',
      ecashamount: activeTab === 'ecash' ? `${netSats}` : '0',
      currency: "RWF",
      externalId: externalId,
      phone: phoneNumber,
      payerMessage: `Bridge Payment`,
      payeeNote: `Order ${externalId}`
    };
    
    const payload = {
      transaction: requestBody,
      security: {
        nonce: Math.random().toString(36).substring(2, 15),
        timestamp: Date.now()
      }
    };

    const encrypted: any = await Encryption.encrypt(payload);

    const requestData = {
      encrypted: encrypted.encrypted,
      iv: encrypted.iv,
      hmac: encrypted.hmac,
      timestamp: encrypted.timestamp
    };

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Encrypted': 'true',
        'X-Request-ID': payload.security.nonce
      },
      body: JSON.stringify(requestData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error(`Received an invalid response from the server.`);
    }

    const responseData = await response.json();

    if (responseData.status === 'success' && responseData.data?.reference_id) {
      return {
        success: true,
        referenceId: responseData.data.reference_id,
        message: responseData.message || 'Request to pay sent. Please approve the transaction on your phone.'
      };
    } else {
      throw new Error(responseData.message || "Failed to initiate MoMo payment due to an unknown API error.");
    }
  } catch (error: any) {
    console.error('[MomoService] Error initiating MoMo payment:', error);
    return { success: false, message: error.message || 'Payment request failed due to a network or server issue.' };
  }
};

export const checkMomoPaymentStatus = async (
  txId: string | null
): Promise<any> => {
  if (!txId) {
    return { status: 'FAILED', message: 'Missing reference ID.' };
  }
  
  const targetUrl = `${MOMO_API_BASE_URL}/payment/request/octoba/status/${txId}`;

  try {
    const response = await fetch(targetUrl);

    if (!response.ok) {
      return { status: 'PENDING', message: 'Temporarily unable to check status. Will retry.' };
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return { status: 'PENDING', message: `Invalid server response type. Will retry.` };
    }

    const responseData = await response.json();

    if (responseData.status === 'success' && responseData.data?.status) {
      const mtnStatus = responseData.data.status.toUpperCase() as MomoStatus;

      if (['SUCCESSFUL', 'PENDING', 'FAILED'].includes(mtnStatus)) {
        return {
          status: mtnStatus,
          message: responseData.data.reason?.message || responseData.message || `Status: ${mtnStatus}`
        };
      } else {
        return { status: 'PENDING', message: `Unknown payment status received: ${mtnStatus}.` };
      }
    } else {
      return { status: 'FAILED', message: responseData.message || "Could not retrieve valid payment status." };
    }
  } catch (error: any) {
    return { status: 'PENDING', message: 'Network issue while checking status. Will retry.' };
  }
};

export const initiateMomoPayout = async (
  txId: string,
  amount: number,
  netSats: number,
  phoneNumber: string
): Promise<any> => {
  const targetUrl = `${MOMO_API_BASE_URL}/payment/payout/octoba`;

  try {
    const externalId = `payout_${Date.now()}`;
    const requestBody = {
      txId,
      amount: `${amount}`,
      btcamount: `${netSats}`,
      currency: "RWF",
      externalId: externalId,
      phone: phoneNumber,
      payerMessage: `RWF Bridge Payout`,
      payeeNote: `Payout ${externalId}`
    };
    
    const payload = {
      transaction: requestBody,
      security: {
        nonce: Math.random().toString(36).substring(2, 15),
        timestamp: Date.now()
      }
    };

    const encrypted: any = await Encryption.encrypt(payload);

    const requestData = {
      encrypted: encrypted.encrypted,
      iv: encrypted.iv,
      hmac: encrypted.hmac,
      timestamp: encrypted.timestamp
    };

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'X-Encrypted': 'true',
        'X-Request-ID': payload.security.nonce
      },
      body: JSON.stringify(requestData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    const responseData = await response.json();
    if (responseData.status === 'success' && responseData.data?.reference_id) {
      return {
        success: true,
        referenceId: responseData.data.reference_id,
        message: 'Payout initiated successfully.'
      };
    } else {
      throw new Error(responseData.message || "Failed to initiate MoMo payout.");
    }
  } catch (error: any) {
    return { success: false, message: error.message || 'Payout failed due to a network or server issue.' };
  }
};

export const checkMomoPayoutStatus = async (
  txId: string | null
): Promise<any> => {
  if (!txId) {
    return { status: 'FAILED', message: 'Missing reference ID for payout status check.' };
  }

  const targetUrl = `${MOMO_API_BASE_URL}/payment/payout/octoba/status/${txId}`;

  try {
    const response = await fetch(targetUrl);

    if (!response.ok) {
      return { status: 'PENDING', message: 'Temporarily unable to check payout status. Will retry.' };
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return { status: 'PENDING', message: `Invalid server response for payout status. Will retry.` };
    }

    const responseData = await response.json();

    if (responseData.status === 'success' && responseData.data?.status) {
      const mtnStatus = responseData.data.status.toUpperCase() as MomoStatus;

      if (['SUCCESSFUL', 'PENDING', 'FAILED'].includes(mtnStatus)) {
        return {
          status: mtnStatus,
          message: responseData.data.reason?.message || responseData.message || `Status: ${mtnStatus}`
        };
      } else {
        return { status: 'PENDING', message: `Unknown payout status received: ${mtnStatus}.` };
      }
    } else {
      return { status: 'PENDING', message: responseData.message || "Could not retrieve valid payout status." };
    }
  } catch (error: any) {
    return { status: 'PENDING', message: 'Network issue while checking payout status. Will retry.' };
  }
};
