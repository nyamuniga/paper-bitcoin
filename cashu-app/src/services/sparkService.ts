import { invoke } from '@tauri-apps/api/core';
import initBreezSDK, {
  SdkBuilder,
  defaultConfig,
  type BreezSdk,
  type SdkEvent,
  type PrepareSendPaymentResponse,
} from '@breeztech/breez-sdk-spark/web';
import { BREEZ_API_KEY } from '../constants';
import { guardConversionPayments } from './conversionSpendGuard';
import { withSparkBalanceLock } from './sparkBalanceLock';

export interface OnchainSendEstimate {
  amount: number;
  ark_fee: number;
  cashu_fee: number;
  total_cost: number;
  bridging_invoice: string;
  order_id?: string;
  order_token?: string;
}

export interface SparkDepositResponse {
  address: string;
  amount_sats: number;
  net_receive_sats: number;
  estimated_fee_sats: number;
  quote_id: string;
  order_id?: string;
  order_token?: string;
}

export interface OnchainLimits {
  min_sats: number;
  max_sats: number;
}

interface SparkConfigResponse {
  api_key: string | null;
  network: string;
  mnemonic: string;
  wallet_id: string;
}

interface CashuMeltQuoteResponse {
  quote_id: string;
  cashu_fee: number;
  total_melt: number;
}

interface MeltToSparkResponse {
  tx_id: string;
  sats_paid: number;
  cashu_fee: number;
}

interface PrepareOnchainReceiveResponse {
  tx_id: string;
  address: string;
  amount_sats: number;
}

interface PrepareMintFromSparkResponse {
  tx_id: string;
  quote_id: string;
  invoice: string;
  amount_sats: number;
}

let wasmInitialized = false;
let wasmInitPromise: Promise<void> | null = null;
let sdkInstance: BreezSdk | null = null;
let sdkWalletId: string | null = null;
let sdkConnectPromise: Promise<BreezSdk> | null = null;
let sdkListenerId: string | null = null;
let isSweeping = false;
let lastKnownDepositTxid: string | null = null;

type SparkEventCallback = (event: SdkEvent) => void;
const eventSubscribers = new Set<SparkEventCallback>();

export const subscribeToSparkEvents = (cb: SparkEventCallback): (() => void) => {
  eventSubscribers.add(cb);
  return () => {
    eventSubscribers.delete(cb);
  };
};

async function ensureWasmInitialized(): Promise<void> {
  if (wasmInitialized) return;
  if (!wasmInitPromise) {
    wasmInitPromise = initBreezSDK()
      .then(() => {
        wasmInitialized = true;
      })
      .catch((err) => {
        wasmInitPromise = null;
        throw err;
      });
  }
  await wasmInitPromise;
}

export async function getSparkSdk(): Promise<BreezSdk> {
  await ensureWasmInitialized();

  const cfg = await invoke<SparkConfigResponse>('spark_get_config');
  if (sdkInstance && sdkWalletId === cfg.wallet_id) {
    return sdkInstance;
  }

  if (sdkConnectPromise) {
    return sdkConnectPromise;
  }

  sdkConnectPromise = (async () => {
    try {
      if (sdkInstance) {
        try {
          await sdkInstance.disconnect();
        } catch {
          // Ignore disconnect errors on stale instance
        }
        sdkInstance = null;
        sdkWalletId = null;
      }

      const resolvedApiKey = (cfg.api_key || BREEZ_API_KEY || '').trim();
      if (!resolvedApiKey) {
        throw new Error(
          'Missing Breez API key. Please set BREEZE_API_KEY or BREEZ_API_KEY in your .env file.'
        );
      }

      const network = cfg.network === 'regtest' ? 'regtest' : 'mainnet';
      const sdkConfig = defaultConfig(network);
      sdkConfig.apiKey = resolvedApiKey;
      sdkConfig.maxDepositClaimFee = {
        onchain: {
          type: 'networkRecommended',
          leewaySatPerVbyte: 15,
        },
        proportionalPpm: 15000,
      };

      const builder = await SdkBuilder.new(sdkConfig, {type:'mnemonic', mnemonic:cfg.mnemonic})
        .withDefaultStorage(`bitnotes_spark_${cfg.wallet_id}`);
      const sdk = await builder.withPaymentObserver({
        beforeSend: guardConversionPayments,
        afterSend: async () => {},
      }).build();

      sdkListenerId = await sdk.addEventListener({
        onEvent: async (event: SdkEvent) => {
          if (event.type === 'claimedDeposits' && event.claimedDeposits.length > 0) {
            lastKnownDepositTxid = event.claimedDeposits[0].txid;
          }
          for (const sub of eventSubscribers) {
            try {
              sub(event);
            } catch (e) {
              console.warn('Spark event subscriber error:', e);
            }
          }
        },
      });

      sdkInstance = sdk;
      sdkWalletId = cfg.wallet_id;
      return sdk;
    } finally {
      sdkConnectPromise = null;
    }
  })();

  return sdkConnectPromise;
}

export async function disconnectSparkSdk(): Promise<void> {
  const instance = sdkInstance;
  const listenerId = sdkListenerId;
  sdkInstance = null;
  sdkWalletId = null;
  sdkListenerId = null;
  sdkConnectPromise = null;

  if (instance) {
    try {
      if (listenerId) {
        await instance.removeEventListener(listenerId).catch(() => {});
      }
      await instance.disconnect();
    } catch (e) {
      console.warn('Error disconnecting Spark SDK:', e);
    }
  }
}

let cachedLimits: { data: OnchainLimits; timestamp: number } | null = null;

export const getOnchainSendLimits = async (): Promise<OnchainLimits> => {
  if (cachedLimits && Date.now() - cachedLimits.timestamp < 60_000) {
    return cachedLimits.data;
  }
  try {
    const limits = await invoke<OnchainLimits>('spark_get_limits');
    cachedLimits = { data: limits, timestamp: Date.now() };
    return limits;
  } catch {
    return { min_sats: 2_500, max_sats: 100_000_000 };
  }
};

export const getCredentialsStatus = async (): Promise<boolean> => {
  try {
    const cfg = await invoke<SparkConfigResponse>('spark_get_config');
    return Boolean((cfg.api_key && cfg.api_key.trim()) || BREEZ_API_KEY);
  } catch {
    return Boolean(BREEZ_API_KEY);
  }
};

export const setCredentials = async (apiKey: string): Promise<void> => {
  await invoke('spark_set_credentials', { apiKey });
  await disconnectSparkSdk();
};

export const sparkIsSending = async (): Promise<boolean> => {
  try {
    return await invoke<boolean>('spark_is_sending');
  } catch {
    // A locked wallet or unavailable journal must never release reserved funds.
    return true;
  }
};

function extractSendFeeQuoteSats(prep: PrepareSendPaymentResponse, speed: 'fast' | 'medium' | 'slow' = 'medium'): number {
  if (prep.paymentMethod.type === 'bitcoinAddress') {
    const quote = prep.paymentMethod.feeQuote;
    const selected =
      speed === 'fast'
        ? quote.speedFast
        : speed === 'slow'
        ? quote.speedSlow
        : quote.speedMedium;
    return Number(selected.userFeeSat + selected.l1BroadcastFeeSat);
  }
  if (prep.paymentMethod.type === 'bolt11Invoice') {
    return Number((prep.paymentMethod.sparkTransferFeeSats ?? 0) + prep.paymentMethod.lightningFeeSats);
  }
  if (prep.paymentMethod.type === 'sparkAddress' || prep.paymentMethod.type === 'sparkInvoice') {
    return Number(prep.paymentMethod.fee);
  }
  return 0;
}

export const estimateOnChainSendSpark = async (
  address: string,
  amountSats: number,
  mintUrl: string
): Promise<OnchainSendEstimate> => {
  const cleanAddress = await invoke<string>('spark_validate_address', { address });
  const limits = await getOnchainSendLimits();
  if (amountSats < limits.min_sats) {
    throw new Error(`Minimum on-chain send amount is ${limits.min_sats.toLocaleString()} sats.`);
  }
  if (amountSats > limits.max_sats) {
    throw new Error(`Maximum on-chain send amount is ${limits.max_sats.toLocaleString()} sats.`);
  }

  const sdk = await getSparkSdk();
  const info = await sdk.getInfo({ ensureSynced: false });
  const existingSparkBalance = Number(info.balanceSats);

  let sparkL1FeeSats = 0;
  try {
    const prep = await sdk.prepareSendPayment({
      paymentRequest: { type: 'input', input: cleanAddress },
      amount: BigInt(amountSats),
      feePolicy: 'feesExcluded',
    });
    sparkL1FeeSats = extractSendFeeQuoteSats(prep, 'medium');
  } catch {
    // When local Spark balance is currently < amountSats (funds are in Cashu),
    // calculate the SSP cooperative exit fee using Breez's coop_exit parameters:
    //   user_fee = 750 sats base (or 0.25% for larger exits)
    //   l1_broadcast_fee (medium) = max(minimumFee + 3, halfHourFee + 2) * 250 vB
    try {
      const rec = await sdk.recommendedFees();
      const minFeeRate = Math.max(1, Number(rec.minimumFee || 1));
      const halfHourRate = Math.max(
        minFeeRate + 3,
        Number(rec.halfHourFee || rec.fastestFee || 4) + 2
      );
      const estimatedL1BroadcastFee = halfHourRate * 250;
      const estimatedUserServiceFee = Math.max(750, Math.ceil(amountSats * 0.0025));
      const safetyBuffer = 150;
      sparkL1FeeSats = estimatedL1BroadcastFee + estimatedUserServiceFee + safetyBuffer;
    } catch {
      sparkL1FeeSats = Math.max(1850, Math.ceil(amountSats * 0.005));
    }
  }

  const targetSparkBalance = amountSats + sparkL1FeeSats;
  const neededFromCashu = Math.max(100, targetSparkBalance - existingSparkBalance);

  let lnReceive = await sdk.receivePayment({
    paymentMethod: {
      type: 'bolt11Invoice',
      description: 'BitNotes On-Chain Send Bridge',
      amountSats: neededFromCashu,
      expirySecs: 3600,
    },
  });

  let sparkLnReceiveFee = Number(lnReceive.fee);
  if (sparkLnReceiveFee > 0) {
    // Ensure the net amount landing in Spark after any SSP LN receive fee still covers amountSats + sparkL1FeeSats
    lnReceive = await sdk.receivePayment({
      paymentMethod: {
        type: 'bolt11Invoice',
        description: 'BitNotes On-Chain Send Bridge',
        amountSats: neededFromCashu + sparkLnReceiveFee,
        expirySecs: 3600,
      },
    });
    sparkLnReceiveFee = Number(lnReceive.fee);
  }

  const totalSparkFee = sparkL1FeeSats + sparkLnReceiveFee;

  const meltQuote = await invoke<CashuMeltQuoteResponse>('spark_quote_cashu_melt', {
    bridgingInvoice: lnReceive.paymentRequest,
    mintUrl,
  });

  const totalCost = amountSats + totalSparkFee + meltQuote.cashu_fee;

  return {
    amount: amountSats,
    ark_fee: totalSparkFee,
    cashu_fee: meltQuote.cashu_fee,
    total_cost: totalCost,
    bridging_invoice: lnReceive.paymentRequest,
  };
};

export const executeOnChainSendSpark = async (
  bridgingInvoice: string,
  address: string,
  amountSats: number,
  mintUrl: string,
  estimatedSparkFeeSats = 0
): Promise<string> => {
  const cleanAddress = await invoke<string>('spark_validate_address', { address });
  const sdk = await getSparkSdk();

  // Step 1: Melt Cashu proofs to pay our local self-custodial Spark BOLT11 invoice
  const meltRes = await invoke<MeltToSparkResponse>('spark_melt_to_spark', {
    bridgingInvoice,
    address: cleanAddress,
    amountSats,
    sparkFeeSats: estimatedSparkFeeSats,
    mintUrl,
  });

  let totalCashuFee = meltRes.cashu_fee;

  try {
    // Step 2: Wait for Spark wallet to register the incoming Lightning balance
    const expectedBalance = amountSats + Math.max(0, Math.floor(estimatedSparkFeeSats * 0.5));
    let currentBalance = 0;
    for (let attempt = 0; attempt < 25; attempt++) {
      await sdk.syncWallet({}).catch(() => {});
      const info = await sdk.getInfo({ ensureSynced: false });
      currentBalance = Number(info.balanceSats);
      if (currentBalance >= expectedBalance) {
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (currentBalance < amountSats) {
      const syncedInfo = await sdk.getInfo({ ensureSynced: true });
      currentBalance = Number(syncedInfo.balanceSats);
    }

    // Step 3: Always prepare with feePolicy: 'feesExcluded' so the receiver is guaranteed
    // to receive the exact `amountSats` inputted by the user.
    let prep = await sdk.prepareSendPayment({
      paymentRequest: { type: 'input', input: cleanAddress },
      amount: BigInt(amountSats),
      feePolicy: 'feesExcluded',
    });

    let confirmationSpeed: 'fast' | 'medium' | 'slow' = 'medium';
    const mediumFee = extractSendFeeQuoteSats(prep, 'medium');
    const slowFee = extractSendFeeQuoteSats(prep, 'slow');

    if (amountSats + mediumFee > currentBalance) {
      if (amountSats + slowFee <= currentBalance) {
        confirmationSpeed = 'slow';
      } else {
        // Live SSP cooperative exit fee exceeds our bridged buffer:
        // top up the exact deficit from Cashu rather than ever deducting from the receiver's amount.
        const deficitSats = Math.max(100, amountSats + mediumFee - currentBalance + 50);
        const topupReceive = await sdk.receivePayment({
          paymentMethod: {
            type: 'bolt11Invoice',
            description: 'BitNotes On-Chain Fee Top-Up',
            amountSats: deficitSats,
            expirySecs: 600,
          },
        });
        const topupLnFee = Number(topupReceive.fee);
        const finalTopupInvoice =
          topupLnFee > 0
            ? (
                await sdk.receivePayment({
                  paymentMethod: {
                    type: 'bolt11Invoice',
                    description: 'BitNotes On-Chain Fee Top-Up',
                    amountSats: deficitSats + topupLnFee,
                    expirySecs: 600,
                  },
                })
              ).paymentRequest
            : topupReceive.paymentRequest;

        const topupRes = await invoke<MeltToSparkResponse>('spark_topup_for_send', {
          topupInvoice: finalTopupInvoice,
          mintUrl,
        });
        totalCashuFee += topupRes.cashu_fee;

        for (let attempt = 0; attempt < 20; attempt++) {
          await sdk.syncWallet({}).catch(() => {});
          const info = await sdk.getInfo({ ensureSynced: false });
          currentBalance = Number(info.balanceSats);
          if (currentBalance >= amountSats + mediumFee) {
            break;
          }
          await new Promise((r) => setTimeout(r, 1000));
        }

        prep = await sdk.prepareSendPayment({
          paymentRequest: { type: 'input', input: cleanAddress },
          amount: BigInt(amountSats),
          feePolicy: 'feesExcluded',
        });
        confirmationSpeed = 'medium';
      }
    }

    const sendRes = await sdk.sendPayment({
      prepareResponse: prep,
      options: {
        type: 'bitcoinAddress',
        confirmationSpeed,
      },
    });

    const payment = sendRes.payment;
    let l1Txid = payment.id;
    if (payment.details?.type === 'withdraw' && payment.details.txId) {
      l1Txid = payment.details.txId;
    }

    const actualSparkFee = Number(payment.fees);

    await invoke('spark_finalize_onchain_send', {
      txId: meltRes.tx_id,
      txid: l1Txid,
      finalSparkFeeSats: actualSparkFee,
      cashuFeeSats: totalCashuFee,
      failed: false,
    });

    // If any unused safety fee buffer (>= 100 sats) remains in Spark after the send,
    // sweep it back to the user's Cashu wallet asynchronously.
    sweepSparkToCashu(mintUrl).catch(() => {});

    return l1Txid;
  } catch (err) {
    console.error('Spark L1 broadcast failed after Cashu melt; initiating self-healing sweep back to Cashu:', err);
    await invoke('spark_finalize_onchain_send', {
      txId: meltRes.tx_id,
      txid: null,
      finalSparkFeeSats: null,
      cashuFeeSats: null,
      failed: true,
    }).catch(() => {});

    // Automatically sweep the Spark balance back into the user's Cashu mint so funds are restored
    await sweepSparkToCashu(mintUrl).catch((sweepErr) => {
      console.warn('Immediate rollback sweep deferred to background processor:', sweepErr);
    });

    throw err;
  }
};

export const getDepositAddressSpark = async (
  amountSats: number,
  mintUrl: string
): Promise<SparkDepositResponse> => {
  const limits = await getOnchainSendLimits();
  if (amountSats < limits.min_sats) {
    throw new Error(`Minimum on-chain deposit is ${limits.min_sats.toLocaleString()} sats.`);
  }

  const sdk = await getSparkSdk();
  const receiveRes = await sdk.receivePayment({
    paymentMethod: {
      type: 'bitcoinAddress',
      newAddress: false,
    },
  });

  const bitcoinAddress = receiveRes.paymentRequest;

  // Estimate the Spark L1 deposit claim fee (~165 vB tree-creation tx) + Lightning sweep fee to Cashu
  // so the BIP-21 QR/URI includes the fee and the user receives the full `amountSats` they requested.
  let sparkClaimFeeSats = Number(receiveRes.fee || 0);
  if (sparkClaimFeeSats <= 0) {
    try {
      const rec = await sdk.recommendedFees();
      const claimFeeRate = Math.max(2, Number(rec.fastestFee || rec.halfHourFee || 2));
      sparkClaimFeeSats = Math.max(330, claimFeeRate * 165);
    } catch {
      sparkClaimFeeSats = 350;
    }
  }

  const sweepFeeSats = Math.max(15, Math.ceil((amountSats + sparkClaimFeeSats) * 0.005));
  const estimatedFeeSats = sparkClaimFeeSats + sweepFeeSats;
  const totalDepositSats = amountSats + estimatedFeeSats;

  const prep = await invoke<PrepareOnchainReceiveResponse>('spark_prepare_onchain_receive', {
    address: bitcoinAddress,
    amountSats,
    mintUrl,
  });

  // Trigger a non-blocking check for any unclaimed deposits
  claimUnclaimedDeposits(sdk).catch(() => {});

  return {
    address: bitcoinAddress,
    amount_sats: totalDepositSats,
    net_receive_sats: amountSats,
    estimated_fee_sats: estimatedFeeSats,
    quote_id: prep.tx_id,
  };
};

export async function claimUnclaimedDeposits(sdkInstanceOverride?: BreezSdk): Promise<string | null> {
  const sdk = sdkInstanceOverride || (await getSparkSdk());
  const { deposits } = await sdk.listUnclaimedDeposits({});
  let claimedTxid: string | null = null;

  for (const dep of deposits) {
    try {
      const res = await sdk.claimDeposit({
        txid: dep.txid,
        vout: dep.vout,
        maxFee: {
          onchain: {
            type: 'networkRecommended',
            leewaySatPerVbyte: 25,
          },
          proportionalPpm: 25000,
        },
      });
      claimedTxid = dep.txid;
      lastKnownDepositTxid = dep.txid;
      if (
        res.outcome.type === 'settled' &&
        res.outcome.payment.details?.type === 'deposit' &&
        res.outcome.payment.details.txId
      ) {
        claimedTxid = res.outcome.payment.details.txId;
        lastKnownDepositTxid = claimedTxid;
      }
    } catch (e) {
      console.warn(`Spark deposit ${dep.txid}:${dep.vout} not yet claimable:`, e);
    }
  }

  return claimedTxid;
}

async function findRecentDepositInfo(
  sdk: BreezSdk
): Promise<{ txid: string | null; claimFeeSats: number }> {
  let txid: string | null = lastKnownDepositTxid;
  let claimFeeSats = 0;
  try {
    const { payments } = await sdk.listPayments({
      typeFilter: ['receive'],
      limit: 10,
    });
    for (const p of payments) {
      if (p.details?.type === 'deposit') {
        if (!txid && p.details.txId) {
          txid = p.details.txId;
        }
        claimFeeSats = Number(p.fees || 0);
        break;
      }
    }
  } catch {
    // Ignore listPayments errors
  }
  return { txid, claimFeeSats };
}

export async function sweepSparkToCashu(preferredMintUrl?: string): Promise<boolean> {
  return withSparkBalanceLock(() => sweepSparkToCashuLocked(preferredMintUrl));
}

async function sweepSparkToCashuLocked(preferredMintUrl?: string): Promise<boolean> {
  if (isSweeping) return false;
  if (await sparkIsSending()) return false;

  isSweeping = true;
  try {
    const sdk = await getSparkSdk();
    await sdk.syncWallet({}).catch(() => {});
    await claimUnclaimedDeposits(sdk).catch(() => {});

    const info = await sdk.getInfo({ ensureSynced: false });
    const balanceSats = Number(info.balanceSats);

    // Minimum threshold to sweep into Cashu
    if (balanceSats < 100) {
      return false;
    }

    const { txid: depositTxid, claimFeeSats } = await findRecentDepositInfo(sdk);

    // Reserve a small routing fee buffer (0.5% or at least 15 sats) so Spark can pay the Cashu mint's BOLT11 invoice
    const feeBuffer = Math.max(15, Math.ceil(balanceSats * 0.005));
    const mintAmount = Math.max(1, balanceSats - feeBuffer);
    const totalReceiveFee = claimFeeSats + (balanceSats - mintAmount);

    const mintPrep = await invoke<PrepareMintFromSparkResponse>('spark_prepare_mint_from_spark', {
      amountSats: mintAmount,
      mintUrl: preferredMintUrl ?? null,
      txId: null,
      txid: depositTxid,
      address: null,
      feeSats: totalReceiveFee,
    });

    try {
      const sendPrep = await sdk.prepareSendPayment({
        paymentRequest: { type: 'input', input: mintPrep.invoice },
      });

      await sdk.sendPayment({
        prepareResponse: sendPrep,
      });
    } catch (payErr) {
      await invoke('spark_abort_unpaid_mint_from_spark', {
        txId: mintPrep.tx_id,
      }).catch(() => {});
      throw payErr;
    }

    const completed = await invoke<boolean>('spark_complete_mint_from_spark', {
      txId: mintPrep.tx_id,
      txid: depositTxid,
    });

    if (completed) {
      lastKnownDepositTxid = null;
    }

    return completed;
  } finally {
    isSweeping = false;
  }
}

export async function syncAndSweepSpark(defaultMintUrl?: string): Promise<boolean> {
  if (isSweeping) return false;
  if (await sparkIsSending()) return false;

  try {
    return await sweepSparkToCashu(defaultMintUrl);
  } catch (e) {

    return false;
  }
}
