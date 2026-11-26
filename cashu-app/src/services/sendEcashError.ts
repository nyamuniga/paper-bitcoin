import type {
  NearestOfflineAmounts,
  SendEcashError,
  SendEcashErrorCode,
} from '../types/sendEcash.ts';

export interface SendEcashFailure {
  code: SendEcashErrorCode;
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
    return { code: 'OUTCOME_UNKNOWN', message: messages.OUTCOME_UNKNOWN, requiresReconciliation: true };
  }
  if (error.tx_id !== null) {
    return {
      code: error.code,
      message: 'A send already has a transaction record. Check History before sending again.',
      requiresReconciliation: true,
    };
  }
  return { code: error.code, message: messages[error.code], requiresReconciliation: false };
}

/** Format a plain-language offline fallback suggesting nearest sendable amounts. */
export function formatOfflineChangeMessage(
  amount: number,
  nearest: NearestOfflineAmounts,
): string | null {
  const lower = typeof nearest.lower === 'number' && nearest.lower > 0 ? nearest.lower : null;
  const higher = typeof nearest.higher === 'number' && nearest.higher > 0 ? nearest.higher : null;
  if (lower === null && higher === null) return null;
  const suggestion = lower !== null && higher !== null
    ? `${lower.toLocaleString()} sats or ${higher.toLocaleString()} sats`
    : `${(lower ?? higher)!.toLocaleString()} sats`;
  return `You're offline and can't make exact change for ${amount.toLocaleString()} sats right now. Try ${suggestion}.`;
}

const OFFLINE_ERROR_PATTERNS = [
  'error sending request',
  'dns error',
  'failed to lookup',
  'connection refused',
  'connection reset',
  'timed out',
  'timeout',
  'network',
  'offline',
  'unreachable',
  'connect error',
  'no route to host',
  'temporarily unavailable',
];

const DEFINITE_RECEIVE_REJECTION_PATTERNS = [
  'already spent',
  'already signed',
  'already issued',
  'already redeemed',
  'already claimed',
  'could not be recovered',
  'invalid',
  'not verified',
  'cannot unlock',
  'wallet is locked',
];

/** Identify receive failures caused by mint unreachability rather than a rejected token. */
export function isOfflineReceiveError(errorMessage: string): boolean {
  const lower = errorMessage.toLowerCase();
  if (!lower) return false;
  if (DEFINITE_RECEIVE_REJECTION_PATTERNS.some((pattern) => lower.includes(pattern))) {
    return false;
  }
  return OFFLINE_ERROR_PATTERNS.some((pattern) => lower.includes(pattern));
}
