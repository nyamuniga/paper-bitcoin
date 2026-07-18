import { Encryption } from '../utils/encryption';

import { fetch } from '@tauri-apps/plugin-http';

import { LIGHTNING_API_ENDPOINT } from '../constants.local';

let btcWalletId: string | null = null;

interface BlinkPaymentResponse {
    success: boolean;
    message?: string;
}

const queryBlink = async (query: string, variables: object) => {
    const targetUrl = `${LIGHTNING_API_ENDPOINT}`;

    const payload = {
        transaction: { query, variables },
        security: {
            nonce: Math.random().toString(36).substring(2, 15),
            timestamp: Date.now()
        },
    };

    const encrypted: any = await Encryption.encrypt(payload);

    const requestData = {
        encrypted: encrypted.encrypted,
        iv: encrypted.iv,
        hmac: encrypted.hmac,
        timestamp: encrypted.timestamp,
    };

    const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Encrypted': 'true',
            'X-Request-ID': payload.security.nonce,
        },
        body: JSON.stringify(requestData),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Blink API Error: ${response.status} - ${errorText}`);
    }

    const { data, errors } = await response.json();

    if (errors) {
        throw new Error(`Blink GraphQL Error: ${errors.map((e: any) => e.message).join(', ')}`);
    }

    return data;
};

const getBtcWalletId = async (): Promise<string> => {
    if (btcWalletId) {
        return btcWalletId;
    }

    const query = `
        query me {
            me {
                defaultAccount {
                    wallets {
                        id
                        walletCurrency
                    }
                }
            }
        }
    `;

    const data = await queryBlink(query, {});
    const wallets = data?.me?.defaultAccount?.wallets;

    if (!wallets || !Array.isArray(wallets)) {
        throw new Error('Could not retrieve wallets from Blink account.');
    }

    const foundWallet = wallets.find(w => w.walletCurrency === 'BTC');

    if (!foundWallet) {
        throw new Error('No BTC wallet found in the Blink account.');
    }

    btcWalletId = foundWallet.id;
    return btcWalletId ? btcWalletId : "null";
};

export const payLightningInvoice = async (invoice: string): Promise<BlinkPaymentResponse> => {
    try {
        const walletId = await getBtcWalletId();

        const mutation = `
            mutation LnInvoicePaymentSend($input: LnInvoicePaymentInput!) {
                lnInvoicePaymentSend(input: $input) {
                    status
                    errors {
                        message
                        path
                        code
                    }
                }
            }
        `;

        const variables = {
            input: {
                walletId,
                paymentRequest: invoice,
                memo: "RWF to BTC Bridge Payout",
            },
        };

        const data = await queryBlink(mutation, variables);
        const paymentStatus = data?.lnInvoicePaymentSend?.status;
        const paymentErrors = data?.lnInvoicePaymentSend?.errors;

        if (paymentErrors && paymentErrors.length > 0) {
            const isAlreadyPaid = paymentErrors.some((e: any) => e.code === 'ALREADY_PAID' || e.message?.includes('ALREADY_PAID'));
            if (!isAlreadyPaid) {
                const errorMessage = paymentErrors.map((e: any) => `[${e.code}] ${e.message}`).join(', ');
                throw new Error(`Payment failed: ${errorMessage}`);
            }
        }

        if (paymentStatus === 'SUCCESS' || paymentStatus === 'PENDING' || paymentStatus === 'ALREADY_PAID' || !paymentStatus) {
            return { success: true, message: `Payment is ${paymentStatus || 'ALREADY_PAID'}.` };
        } else {
            throw new Error(`Payment status returned: ${paymentStatus}`);
        }

    } catch (error: any) {
        return { success: false, message: error.message };
    }
};

export const createLightningInvoice = async (amountInSats: number): Promise<{ paymentRequest: string, paymentHash: string }> => {
    const walletId = await getBtcWalletId();

    const mutation = `
        mutation LnInvoiceCreate($input: LnInvoiceCreateInput!) {
            lnInvoiceCreate(input: $input) {
                invoice {
                    paymentRequest
                    paymentHash
                }
                errors {
                    message
                }
            }
        }
    `;

    const variables = {
        input: {
            walletId,
            amount: amountInSats,
            memo: "RWF Bridge Deposit",
        },
    };

    const data = await queryBlink(mutation, variables);
    const invoiceData = data?.lnInvoiceCreate?.invoice;
    const errors = data?.lnInvoiceCreate?.errors;

    if (errors && errors.length > 0) {
        throw new Error(`Invoice creation failed: ${errors.map((e: any) => e.message).join(', ')}`);
    }

    if (!invoiceData || !invoiceData.paymentRequest) {
        throw new Error('Failed to create Lightning invoice. API response was invalid.');
    }

    return {
        paymentRequest: invoiceData.paymentRequest,
        paymentHash: invoiceData.paymentHash,
    };
};

export const checkInvoiceStatus = async (paymentRequest: string): Promise<{ isPaid: boolean }> => {
    const query = `
        query lnInvoicePaymentStatus($input: LnInvoicePaymentStatusInput!) {
            lnInvoicePaymentStatus(input: $input) {
                status
            }
        }
    `;

    const variables = {
        input: {
            paymentRequest,
        },
    };

    try {
        const data = await queryBlink(query, variables);
        const status = data?.lnInvoicePaymentStatus?.status;
        return { isPaid: status === 'PAID' };
    } catch (error) {
        return { isPaid: false };
    }
};
