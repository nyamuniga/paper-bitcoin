import type { SendEcashError, SendEcashErrorCode } from '../types/sendEcash.ts';

export interface SendEcashFailure {
  message: string;
  requiresReconciliation: boolean;
}

const messages: Record<SendEcashErrorCode, string> = {
  INVALID_REQUEST: 'Check the amount, mint and payment details before sending.',
  WALLET_LOCKED: 'Unlock your wallet before sending eCash.',
  INSUFFICIENT_FUNDS: 'There is not enough balance to cover this send and its fees.',
  REVIEW_REQUIRED: 'The fees changed. Review this send before trying again.',
  SERVICE_UNAVAILABLE: 'The mint service is unavailable. Check your connection before trying again.',
  OUTCOME_UNKNOWN: 'We could not confirm whether an eCash token was created. Check History before sending again.',
  INTERNAL_ERROR: 'The wallet could not prepare this send. Check your wallet before trying again.',
};

function isSendEcashError(error: unknown): error is SendEcashError {
  if (!error || typeof error !== 'object' || Array.isArray(error)) return false;
  const value = error as Record<string, unknown>;
  return typeof value.code === 'string'
    && Object.prototype.hasOwnProperty.call(messages, value.code)
    && typeof value.message === 'string'
    && (value.tx_id === null || typeof value.tx_id === 'string');
}

/** Native codes drive handling; an unrecognized rejection never proves a safe retry. */
export function describeSendEcashFailure(error: unknown): SendEcashFailure {
  if (!isSendEcashError(error) || error.code === 'OUTCOME_UNKNOWN') {
    return { message: messages.OUTCOME_UNKNOWN, requiresReconciliation: true };
  }
  if (error.tx_id !== null) {
    return {
      message: 'A send already has a transaction record. Check History before sending again.',
      requiresReconciliation: true,
    };
  }
  return { message: messages[error.code], requiresReconciliation: false };
}
