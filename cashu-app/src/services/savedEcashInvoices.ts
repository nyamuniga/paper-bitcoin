import { invoke } from '@tauri-apps/api/core';
import type { EcashInvoice } from './ecashInvoice';
export interface EcashInvoiceSummary {
    id: string;
    amount: number;
    mint: string;
    description: string;
    created_at: number;
    status: 'pending' | 'received' | 'paid';
}
export interface SavedEcashInvoice extends EcashInvoiceSummary, EcashInvoice {
    secret_hex: string;
    relays: string[];
    pending_token: string | null;
}
export const listEcashInvoices = () => invoke<EcashInvoiceSummary[]>('ecash_invoices');
export const loadEcashInvoice = (id: string) => invoke<SavedEcashInvoice>('ecash_invoice', { id });
export async function saveEcashInvoice(invoice: EcashInvoice, description: string, secret: Uint8Array, relays: string[]): Promise<void> {
    await invoke('ecash_save_invoice', { invoice: { ...invoice, description, secret_hex: Array.from(secret, b => b.toString(16).padStart(2, '0')).join(''), relays, created_at: 0, pending_token: null } });
}
export const saveInvoicePayment = (id: string, token: string) => invoke<void>('ecash_invoice_payment', { id, token });
export function invoiceSecret(saved: SavedEcashInvoice): Uint8Array {
    if (!/^[a-f0-9]{64}$/i.test(saved.secret_hex))
        throw new Error('The saved request has an invalid receiving key.');
    return Uint8Array.from(saved.secret_hex.match(/../g)!, byte => parseInt(byte, 16));
}

// Verified to accept NIP-17 inbox subscriptions; every request saves its own routes.
export const DEFAULT_INVOICE_RELAYS = ['wss://auth.nostr1.com', 'wss://nos.lol', 'wss://relay.primal.net'];
export const addInvoiceRelays = (id: string) => invoke<string[]>('ecash_invoice_relays', {id, relays:DEFAULT_INVOICE_RELAYS});
