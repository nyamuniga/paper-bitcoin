import { Encryption } from '../utils/encryption';

import { requestProxyJson, ProxyRequestError } from './proxyRequest';

import { MOMO_API_BASE_URL } from '../constants';

export const initiateMomoPaymentRequest = async (
  txId: string,
  netSats: number,
  activeTab: string,
  amount: number,
  phoneNumber: string
): Promise<any> => {

  const targetUrl = `${MOMO_API_BASE_URL}/payment/request/octoba`;

  let submitted = false;
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
        nonce: crypto.randomUUID(),
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

    submitted = true;
    const responseData = await requestProxyJson(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Encrypted': 'true',
        'X-Request-ID': payload.security.nonce
      },
      body: JSON.stringify(requestData)
    });

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
    return { success: false, submission: !submitted ? 'rejected' : error instanceof ProxyRequestError ? error.submission : 'unknown', message: error.message || 'Could not confirm the payment request.' };
  }
};

export const checkMomoPaymentStatus = (txId: string | null) => checkStatus('request', txId);

export const initiateMomoPayout = async (
  txId: string,
  amount: number,
  netSats: number,
  phoneNumber: string
): Promise<any> => {
  const targetUrl = `${MOMO_API_BASE_URL}/payment/payout/octoba`;

  let submitted = false;
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
        nonce: crypto.randomUUID(),
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

    submitted = true;
    const responseData = await requestProxyJson(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'X-Encrypted': 'true',
        'X-Request-ID': payload.security.nonce
      },
      body: JSON.stringify(requestData)
    });

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
    return { success: false, submission: !submitted ? 'rejected' : error instanceof ProxyRequestError ? error.submission : 'unknown', message: error.message || 'Could not confirm the payout request.' };
  }
};

export const checkMomoPayoutStatus = (txId: string | null) => checkStatus('payout', txId);

async function checkStatus(kind: 'request' | 'payout', txId: string | null) {
  if (!txId) return {status:'UNKNOWN', message:'The saved transaction ID is missing. Contact support before retrying.'};
  try {
    const data = await requestProxyJson(`${MOMO_API_BASE_URL}/payment/${kind}/octoba/status/${encodeURIComponent(txId)}`);
    const status = data.status === 'success' && typeof data.data?.status === 'string' ? data.data.status.toUpperCase() : '';
    if (['SUCCESSFUL', 'SUCCESS', 'COMPLETED', 'APPROVED'].includes(status)) return {status:'SUCCESSFUL'};
    if (['FAILED', 'REJECTED'].includes(status)) return {status:'FAILED', message:'The Mobile Money provider reported that this transfer failed.'};
    if (status === 'PENDING') return {status:'PENDING', message:'The provider is still processing this transfer.'};
    return {status:'UNKNOWN', message:'The service could not confirm this transfer yet. Keep this record and check again. If it remains unavailable, contact support with the transaction ID.'};
  } catch (error) {
    return {status:'UNKNOWN', message:error instanceof Error ? error.message : 'Unable to check this transfer.'};
  }
}
